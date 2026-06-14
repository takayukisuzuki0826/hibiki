/**
 * audio-engine.js — Hibiki オーディオエンジン [W1]
 *
 * 全ての音は Web Audio API でリアルタイム合成。音源ファイル不使用。
 * ESM: export class AudioEngine
 */

// ---- 内部定数 ----
const FADE_TIME_CONST = 0.05;      // setTargetAtTime の時定数（秒）
const RAMP_TIME      = 0.02;       // クリックノイズ防止 ramp 幅（秒）
const NOISE_BUF_SEC  = 4;          // ノイズ用 AudioBuffer の長さ（秒）
const NOISE_FADE     = 0.05;       // ノイズ系内部ゲート ramp
const ISO_RAMP       = 0.004;      // アイソクロニック on/off ramp（秒）
const ANALYSER_FFT   = 512;

// ---- ノイズ生成ヘルパ（AudioBuffer） ----

function makeWhiteBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * NOISE_BUF_SEC);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makePinkBuffer(ctx) {
  // Paul Kellet 近似（6 段ピンクフィルタ）
  const len = Math.floor(ctx.sampleRate * NOISE_BUF_SEC);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

function makeBrownBuffer(ctx) {
  // leaky integrator
  const len = Math.floor(ctx.sampleRate * NOISE_BUF_SEC);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

// ---- ノイズ BufferSource 生成ヘルパ ----
function makeNoiseSource(ctx, buf) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

// ---- 環境音合成ヘルパ ----
// 各関数は { nodes: [...StoppableNode], output: AudioNode } を返す
// nodes.forEach(n => n.stop()) で停止できる

function makeRain(ctx, dest) {
  // white/pink ノイズ → bandpass(1-6kHz) + LFO で振幅変調（雨粒感）
  const pinkBuf = makePinkBuffer(ctx);
  const whiteBuf = makeWhiteBuffer(ctx);
  const nodes = [];

  // メイン雨音：pink → bandpass
  const src1 = makeNoiseSource(ctx, pinkBuf);
  nodes.push(src1);
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = 2500;
  bp1.Q.value = 0.5;

  const ampGain = ctx.createGain();
  ampGain.gain.value = 0.7;

  // LFO で振幅を揺らす（雨の強弱感）
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.3;
  nodes.push(lfo);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.2;

  src1.connect(bp1);
  bp1.connect(ampGain);
  lfo.connect(lfoGain);
  lfoGain.connect(ampGain.gain);
  ampGain.connect(dest);

  // 高域の細かい雨粒：white → highpass
  const src2 = makeNoiseSource(ctx, whiteBuf);
  nodes.push(src2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const hpGain = ctx.createGain();
  hpGain.gain.value = 0.15;
  src2.connect(hp);
  hp.connect(hpGain);
  hpGain.connect(dest);

  src1.start();
  src2.start();
  lfo.start();

  return { nodes, output: dest };
}

function makeWaves(ctx, dest) {
  // brown ノイズ → lowpass + 0.08Hz LFO でゆっくりうねる（波）
  const buf = makeBrownBuffer(ctx);
  const nodes = [];

  const src = makeNoiseSource(ctx, buf);
  nodes.push(src);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;
  lp.Q.value = 0.5;

  const ampGain = ctx.createGain();
  ampGain.gain.value = 0.6;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  nodes.push(lfo);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.35;

  src.connect(lp);
  lp.connect(ampGain);
  lfo.connect(lfoGain);
  lfoGain.connect(ampGain.gain);
  ampGain.connect(dest);

  src.start();
  lfo.start();

  return { nodes, output: dest };
}

function makeForest(ctx, dest) {
  // pink ノイズ lowpass（葉ずれ）+ 高域断続チャープ（鳥）
  const pinkBuf = makePinkBuffer(ctx);
  const nodes = [];

  // 葉ずれ
  const src = makeNoiseSource(ctx, pinkBuf);
  nodes.push(src);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  const leafGain = ctx.createGain();
  leafGain.gain.value = 0.35;

  const lfoLeaf = ctx.createOscillator();
  lfoLeaf.type = 'sine';
  lfoLeaf.frequency.value = 0.15;
  nodes.push(lfoLeaf);
  const lfoLeafGain = ctx.createGain();
  lfoLeafGain.gain.value = 0.15;

  src.connect(lp);
  lp.connect(leafGain);
  lfoLeaf.connect(lfoLeafGain);
  lfoLeafGain.connect(leafGain.gain);
  leafGain.connect(dest);

  // 鳥の鳴き声風（高域の軽いチャープ）
  // 周期的に短い sine バーストを生成するために LFO ゲート + オシレータ
  const birdOsc = ctx.createOscillator();
  birdOsc.type = 'sine';
  birdOsc.frequency.value = 3200;
  nodes.push(birdOsc);
  const birdGain = ctx.createGain();
  birdGain.gain.value = 0;

  // ゆっくりとした AM で断続的な鳥声風
  const birdLfo = ctx.createOscillator();
  birdLfo.type = 'square';
  birdLfo.frequency.value = 0.12; // 約8秒周期
  nodes.push(birdLfo);
  const birdLfoGain = ctx.createGain();
  birdLfoGain.gain.value = 0.03;

  birdOsc.connect(birdGain);
  birdLfo.connect(birdLfoGain);
  birdLfoGain.connect(birdGain.gain);
  birdGain.connect(dest);

  src.start();
  lfoLeaf.start();
  birdOsc.start();
  birdLfo.start();

  return { nodes, output: dest };
}

function makeNight(ctx, dest) {
  // brown ノイズ very lowpass（夜の静寂感）+ 虫の細帯域ノイズ（バンドパス）
  const brownBuf = makeBrownBuffer(ctx);
  const pinkBuf = makePinkBuffer(ctx);
  const nodes = [];

  // 深夜の低音空気感
  const srcLow = makeNoiseSource(ctx, brownBuf);
  nodes.push(srcLow);
  const lpLow = ctx.createBiquadFilter();
  lpLow.type = 'lowpass';
  lpLow.frequency.value = 300;
  const lowGain = ctx.createGain();
  lowGain.gain.value = 0.4;
  srcLow.connect(lpLow);
  lpLow.connect(lowGain);
  lowGain.connect(dest);

  // 虫の声（細い帯域ノイズ、3〜5kHz）
  const srcBug = makeNoiseSource(ctx, pinkBuf);
  nodes.push(srcBug);
  const bpBug = ctx.createBiquadFilter();
  bpBug.type = 'bandpass';
  bpBug.frequency.value = 4000;
  bpBug.Q.value = 8;
  const bugGain = ctx.createGain();
  bugGain.gain.value = 0.18;

  // LFO でかすかに揺れる虫声
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.25;
  nodes.push(lfo);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;

  srcBug.connect(bpBug);
  bpBug.connect(bugGain);
  lfo.connect(lfoGain);
  lfoGain.connect(bugGain.gain);
  bugGain.connect(dest);

  srcLow.start();
  srcBug.start();
  lfo.start();

  return { nodes, output: dest };
}

function makeSakura(ctx, dest) {
  // pink ノイズ soft（上品）+ ゆったり LFO（風が吹く感覚）
  const pinkBuf = makePinkBuffer(ctx);
  const nodes = [];

  const src = makeNoiseSource(ctx, pinkBuf);
  nodes.push(src);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  lp.Q.value = 0.7;

  const ampGain = ctx.createGain();
  ampGain.gain.value = 0.45;

  // ゆったりとした風のうねり（約0.05Hz = 20秒周期）
  const lfoWind = ctx.createOscillator();
  lfoWind.type = 'sine';
  lfoWind.frequency.value = 0.05;
  nodes.push(lfoWind);
  const lfoWindGain = ctx.createGain();
  lfoWindGain.gain.value = 0.25;

  src.connect(lp);
  lp.connect(ampGain);
  lfoWind.connect(lfoWindGain);
  lfoWindGain.connect(ampGain.gain);
  ampGain.connect(dest);

  // 高域の花びら感（very soft bandpass）
  const src2 = makeNoiseSource(ctx, pinkBuf);
  nodes.push(src2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3500;
  bp.Q.value = 3;
  const softGain = ctx.createGain();
  softGain.gain.value = 0.06;
  src2.connect(bp);
  bp.connect(softGain);
  softGain.connect(dest);

  src.start();
  src2.start();
  lfoWind.start();

  return { nodes, output: dest };
}

// ---- AudioEngine 本体 ----

export class AudioEngine {
  constructor() {
    // AudioContext は init() まで遅延
    this._ctx = null;
    this._analyser = null;
    this._masterGain = null;
    this._toneGain = null;
    this._noiseGain = null;
    this._ambGain = null;

    // 目標音量（0..1）
    this._masterVolume    = 0.8;
    this._toneVolume      = 0.5;
    this._noiseVolume     = 0.25;
    this._ambienceVolume  = 0.4;

    // 現在の設定
    this._method     = 'binaural';
    this._carrierHz  = 100;
    this._beatHz     = 4;
    this._waveform   = 'sine';
    this._noiseType  = null;
    this._ambType    = null;

    // 再生状態
    this._playing = false;
    this._ready   = false;

    // 再生中のノード（stop で破棄）
    this._toneNodes   = [];  // osc など
    this._noiseNodes  = [];  // noise source など
    this._ambNodes    = [];  // ambience 合成ノードなど

    // タイマー
    this._timerTimeoutId   = null;
    this._timerEndTime     = null;   // performance.now() 基準 ms
    this._timerOnComplete  = null;

    // iso gate スケジューラ
    this._isoSchedulerId = null;

    // 世代トークン: stop/setTimer の遅延破棄が「自分の世代」か判定する
    this._stopGen = 0;
    // 保留中の stop フェード setTimeout ID
    this._stopTimerId = null;
  }

  // ---- 公開 getter ----

  get isPlaying() { return this._playing; }
  get isReady()   { return this._ready; }

  get timerRemainingSec() {
    if (this._timerEndTime === null) return null;
    const remaining = (this._timerEndTime - performance.now()) / 1000;
    return remaining > 0 ? remaining : 0;
  }

  // ---- init ----

  async init() {
    if (this._ready) {
      // 冪等: suspended なら resume だけ
      if (this._ctx.state === 'suspended') {
        await this._ctx.resume();
      }
      return;
    }

    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      await this._ctx.resume(); // iOS Safari 必須

      // マスターグラフ構築
      this._masterGain  = this._ctx.createGain();
      this._toneGain    = this._ctx.createGain();
      this._noiseGain   = this._ctx.createGain();
      this._ambGain     = this._ctx.createGain();
      this._analyser    = this._ctx.createAnalyser();
      this._analyser.fftSize = ANALYSER_FFT;

      // 初期音量を設定
      this._masterGain.gain.value = 0; // play() 前はミュート
      this._toneGain.gain.value   = this._toneVolume;
      this._noiseGain.gain.value  = this._noiseVolume;
      this._ambGain.gain.value    = this._ambienceVolume;

      // 接続: toneGain, noiseGain, ambGain → masterGain → analyser → destination
      this._toneGain.connect(this._masterGain);
      this._noiseGain.connect(this._masterGain);
      this._ambGain.connect(this._masterGain);
      this._masterGain.connect(this._analyser);
      this._analyser.connect(this._ctx.destination);

      this._ready = true;
    } catch (e) {
      console.warn('[AudioEngine] init failed:', e);
    }
  }

  // ---- 音作り API ----

  setTone(cfg = {}) {
    if (cfg.method   !== undefined) this._method    = cfg.method;
    if (cfg.carrierHz !== undefined) this._carrierHz = cfg.carrierHz;
    if (cfg.beatHz   !== undefined) this._beatHz    = cfg.beatHz;
    if (cfg.waveform !== undefined) this._waveform  = cfg.waveform;

    if (this._playing) {
      this._stopToneNodes();
      this._startToneNodes();
    }
  }

  setNoise(type) {
    this._noiseType = type;
    if (this._playing) {
      this._stopNoiseNodes();
      if (type) this._startNoiseNodes();
    }
  }

  setAmbience(type) {
    this._ambType = type;
    if (this._playing) {
      this._stopAmbNodes();
      if (type) this._startAmbNodes();
    }
  }

  // ---- 音量 API ----

  setMasterVolume(v) {
    this._masterVolume = Math.max(0, Math.min(1, v));
    if (this._ready && this._playing) {
      this._rampGain(this._masterGain.gain, this._masterVolume);
    }
  }

  setToneVolume(v) {
    this._toneVolume = Math.max(0, Math.min(1, v));
    if (this._ready) {
      this._rampGain(this._toneGain.gain, this._toneVolume);
    }
  }

  setNoiseVolume(v) {
    this._noiseVolume = Math.max(0, Math.min(1, v));
    if (this._ready) {
      this._rampGain(this._noiseGain.gain, this._noiseVolume);
    }
  }

  setAmbienceVolume(v) {
    this._ambienceVolume = Math.max(0, Math.min(1, v));
    if (this._ready) {
      this._rampGain(this._ambGain.gain, this._ambienceVolume);
    }
  }

  // ---- 再生制御 ----

  async play(opts = {}) {
    if (!this._ready) await this.init();
    if (this._ctx.state === 'suspended') await this._ctx.resume();

    const fadeInSec = opts.fadeInSec ?? 2;

    // フェードアウト中に再生が来た場合、保留中の stop タイマーをキャンセル
    if (this._stopTimerId !== null) {
      clearTimeout(this._stopTimerId);
      this._stopTimerId = null;
    }

    if (!this._playing) {
      this._playing = true;
      this._startToneNodes();
      if (this._noiseType) this._startNoiseNodes();
      if (this._ambType)   this._startAmbNodes();
    }

    // masterGain を 0 → _masterVolume へ ramp
    const g = this._masterGain.gain;
    const now = this._ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(this._masterVolume, now + fadeInSec);
  }

  stop(opts = {}) {
    if (!this._playing) return;

    const fadeOutSec = opts.fadeOutSec ?? 2;
    const now = this._ctx.currentTime;
    const g = this._masterGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fadeOutSec);

    // 世代をインクリメント: このクロージャが「最新の stop」か判定するため
    this._stopGen = (this._stopGen + 1) & 0xffffffff;
    const gen = this._stopGen;

    // _playing を先に false にすることで play() の二重起動を防ぐ
    this._playing = false;

    // フェード完了後にノード停止（世代チェックで誤発火を防ぐ）
    this._stopTimerId = setTimeout(() => {
      this._stopTimerId = null;
      if (gen !== this._stopGen) return; // より新しい stop/play が来た場合は何もしない
      this._stopToneNodes();
      this._stopNoiseNodes();
      this._stopAmbNodes();
    }, (fadeOutSec + 0.1) * 1000);
  }

  async toggle() {
    if (this._playing) {
      this.stop();
    } else {
      await this.play();
    }
  }

  // ---- スリープタイマー ----

  setTimer(minutes, onComplete) {
    this.clearTimer();
    if (!minutes || minutes <= 0) return;

    this._timerOnComplete  = onComplete ?? null;
    this._timerEndTime     = performance.now() + minutes * 60 * 1000;

    this._timerTimeoutId = setTimeout(() => {
      this._timerEndTime = null;
      const cb = this._timerOnComplete;
      this._timerOnComplete = null;
      if (this._playing) {
        // フェードアウトして stop → コールバック
        const fadeOutSec = 3;
        const now = this._ctx.currentTime;
        const g   = this._masterGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fadeOutSec);

        // 世代をインクリメントしてフェード後の破棄を保護
        this._stopGen = (this._stopGen + 1) & 0xffffffff;
        const gen = this._stopGen;
        this._playing = false;

        this._stopTimerId = setTimeout(() => {
          this._stopTimerId = null;
          if (gen !== this._stopGen) return; // 再生再開などで世代が変わった場合はスキップ
          if (!this._playing) { // 追加の安全ガード
            this._stopToneNodes();
            this._stopNoiseNodes();
            this._stopAmbNodes();
          }
          if (cb) cb();
        }, (fadeOutSec + 0.1) * 1000);
      } else {
        if (cb) cb();
      }
    }, minutes * 60 * 1000);
  }

  clearTimer() {
    if (this._timerTimeoutId !== null) {
      clearTimeout(this._timerTimeoutId);
      this._timerTimeoutId = null;
    }
    this._timerEndTime    = null;
    this._timerOnComplete = null;
  }

  // ---- ビジュアライザー連携 ----

  getAnalyser() {
    return this._ready ? this._analyser : null;
  }

  getCurrentBeatHz() {
    if (!this._playing) return null;
    if (this._method === 'solfeggio') return null;
    return this._beatHz;
  }

  // ---- 状態 ----

  getState() {
    return {
      isPlaying      : this._playing,
      method         : this._method,
      carrierHz      : this._carrierHz,
      beatHz         : this._beatHz,
      noise          : this._noiseType,
      ambience       : this._ambType,
      masterVolume   : this._masterVolume,
      toneVolume     : this._toneVolume,
      noiseVolume    : this._noiseVolume,
      ambienceVolume : this._ambienceVolume,
    };
  }

  // ======================================================
  // 内部メソッド
  // ======================================================

  // ---- ramp ユーティリティ ----

  _rampGain(gainParam, target) {
    const now = this._ctx.currentTime;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.setTargetAtTime(target, now, FADE_TIME_CONST);
  }

  // ---- Tone ノード ----

  _startToneNodes() {
    this._stopToneNodes(); // 念のため

    switch (this._method) {
      case 'binaural':
        this._startBinaural();
        break;
      case 'isochronic':
        this._startIsochronic();
        break;
      case 'solfeggio':
        this._startSolfeggio();
        break;
      default:
        console.warn('[AudioEngine] unknown method:', this._method);
    }
  }

  _stopToneNodes() {
    if (this._isoSchedulerId !== null) {
      clearTimeout(this._isoSchedulerId);
      this._isoSchedulerId = null;
    }
    for (const n of this._toneNodes) {
      try { n.stop(); } catch (_) { /* already stopped */ }
      try { n.disconnect(); } catch (_) { /* already disconnected */ }
    }
    this._toneNodes = [];
  }

  // ---- バイノーラル ----

  _startBinaural() {
    const ctx = this._ctx;

    // 左耳: carrier
    const oscL = ctx.createOscillator();
    oscL.type = this._waveform || 'sine';
    oscL.frequency.value = this._carrierHz;

    const panL = ctx.createStereoPanner();
    panL.pan.value = -1;

    // 右耳: carrier + beat
    const oscR = ctx.createOscillator();
    oscR.type = this._waveform || 'sine';
    oscR.frequency.value = this._carrierHz + (this._beatHz || 0);

    const panR = ctx.createStereoPanner();
    panR.pan.value = 1;

    oscL.connect(panL);
    panL.connect(this._toneGain);
    oscR.connect(panR);
    panR.connect(this._toneGain);

    oscL.start();
    oscR.start();

    this._toneNodes.push(oscL, oscR);
  }

  // ---- アイソクロニック ----

  _startIsochronic() {
    const ctx = this._ctx;
    const beatHz = this._beatHz || 4;

    const osc = ctx.createOscillator();
    osc.type = this._waveform || 'sine';
    osc.frequency.value = this._carrierHz;

    const gateGain = ctx.createGain();
    gateGain.gain.value = 0;

    osc.connect(gateGain);
    gateGain.connect(this._toneGain);

    osc.start();
    this._toneNodes.push(osc);

    // 矩形ゲート: beatHz に合わせて on/off をスケジューリング
    // 各サイクル: 50% duty cycle、ramp でクリックノイズ防止
    const period = 1 / beatHz;
    const half   = period * 0.5;

    let nextOnTime = ctx.currentTime + 0.01;

    const scheduleGate = () => {
      // method が切り替わった/再生が止まった場合は自己終了（孤児タイマー防止）
      if (this._method !== 'isochronic' || !this._playing) return;

      const lookahead = 0.2; // 先読み時間（秒）
      while (nextOnTime < ctx.currentTime + lookahead) {
        const t = nextOnTime;
        // ON
        gateGain.gain.cancelScheduledValues(t - ISO_RAMP);
        gateGain.gain.setValueAtTime(0, t);
        gateGain.gain.linearRampToValueAtTime(1, t + ISO_RAMP);
        // OFF
        gateGain.gain.setValueAtTime(1, t + half - ISO_RAMP);
        gateGain.gain.linearRampToValueAtTime(0, t + half);

        nextOnTime += period;
      }

      this._isoSchedulerId = setTimeout(scheduleGate, (lookahead * 0.5) * 1000);
    };

    scheduleGate();
  }

  // ---- ソルフェジオ ----

  _startSolfeggio() {
    const ctx = this._ctx;
    const carrier = this._carrierHz;

    // 基本純音
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = carrier;

    // 倍音を薄く加えて心地よく
    const harm2 = ctx.createOscillator();
    harm2.type = 'sine';
    harm2.frequency.value = carrier * 2;
    const harm2Gain = ctx.createGain();
    harm2Gain.gain.value = 0.08;

    const harm3 = ctx.createOscillator();
    harm3.type = 'sine';
    harm3.frequency.value = carrier * 3;
    const harm3Gain = ctx.createGain();
    harm3Gain.gain.value = 0.04;

    osc.connect(this._toneGain);
    harm2.connect(harm2Gain);
    harm2Gain.connect(this._toneGain);
    harm3.connect(harm3Gain);
    harm3Gain.connect(this._toneGain);

    osc.start();
    harm2.start();
    harm3.start();

    this._toneNodes.push(osc, harm2, harm3);
  }

  // ---- ノイズノード ----

  _startNoiseNodes() {
    this._stopNoiseNodes();
    if (!this._noiseType) return;

    const ctx = this._ctx;
    let buf;
    switch (this._noiseType) {
      case 'white': buf = makeWhiteBuffer(ctx); break;
      case 'pink':  buf = makePinkBuffer(ctx);  break;
      case 'brown': buf = makeBrownBuffer(ctx); break;
      default:
        console.warn('[AudioEngine] unknown noise type:', this._noiseType);
        return;
    }

    const src = makeNoiseSource(ctx, buf);
    src.connect(this._noiseGain);
    src.start();
    this._noiseNodes.push(src);
  }

  _stopNoiseNodes() {
    for (const n of this._noiseNodes) {
      try { n.stop(); } catch (_) { /* already stopped */ }
      try { n.disconnect(); } catch (_) { /* already disconnected */ }
    }
    this._noiseNodes = [];
  }

  // ---- 環境音ノード ----

  _startAmbNodes() {
    this._stopAmbNodes();
    if (!this._ambType) return;

    const ctx = this._ctx;
    // 合成の出力先として ambGain に直接つなぐ中間 gain を作る
    const mixGain = ctx.createGain();
    mixGain.gain.value = 1;
    mixGain.connect(this._ambGain);

    let result;
    try {
      switch (this._ambType) {
        case 'rain':   result = makeRain(ctx, mixGain);   break;
        case 'waves':  result = makeWaves(ctx, mixGain);  break;
        case 'forest': result = makeForest(ctx, mixGain); break;
        case 'night':  result = makeNight(ctx, mixGain);  break;
        case 'sakura': result = makeSakura(ctx, mixGain); break;
        default:
          console.warn('[AudioEngine] unknown ambience:', this._ambType);
          mixGain.disconnect();
          return;
      }
    } catch (e) {
      console.warn('[AudioEngine] ambience synthesis failed:', e);
      return;
    }

    // result.nodes に停止可能なノードが入っている
    this._ambNodes = [...result.nodes, mixGain];
  }

  _stopAmbNodes() {
    for (const n of this._ambNodes) {
      try { n.stop(); } catch (_) { /* GainNode や BufferSource 等 */ }
      try { n.disconnect(); } catch (_) { /* already disconnected */ }
    }
    this._ambNodes = [];
  }
}
