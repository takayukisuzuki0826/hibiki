/**
 * Hibiki — visualizer.js [W3]
 * 呼吸する同心円（波紋）＋周波数データによる外周パーティクル
 * 瞑想的・なめらか・ダーク背景 accent glow
 */

export class Visualizer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    this._analyser = null;
    this._getBeatHz = null;
    this._freqData = null;

    this._accent = '#7b5be1';
    this._rafId = null;
    this._running = false;

    // 呼吸アニメーション用状態
    this._phase = 0;           // 0..2π を循環
    this._beatPhase = 0;       // ビート同期位相
    this._lastBeatTs = 0;      // 前回のビートタイムスタンプ(ms)

    // prefers-reduced-motion
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resize();
  }

  /**
   * AudioEngine から AnalyserNode と getBeatHz 関数を受け取る
   * @param {AnalyserNode|null} analyser
   * @param {() => number|null} getBeatHz
   */
  attach(analyser, getBeatHz) {
    this._getBeatHz = getBeatHz;

    if (analyser) {
      // 同じ analyser を再 attach された場合はバッファを使い回す
      const binCount = analyser.frequencyBinCount;
      if (
        this._analyser !== analyser ||
        !this._freqData ||
        this._freqData.length !== binCount
      ) {
        // fftSize は audio-engine 側で確定済み。ここでは書き換えない。
        // frequencyBinCount を読んでバッファを確保するだけ。
        this._freqData = new Uint8Array(binCount);
      }
      this._analyser = analyser;
    } else {
      this._analyser = null;
      this._freqData = null;
    }
  }

  /**
   * アクセントカラー（16進 "#rrggbb"）を更新
   * @param {string} colorHex
   */
  setAccent(colorHex) {
    this._accent = colorHex || '#7b5be1';
  }

  /** rAF ループ開始 */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTs = performance.now();
    this._loop(this._lastTs);
  }

  /** rAF ループ停止 */
  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * DPR 対応リサイズ。window resize 時に app.js から呼ばれる。
   */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const el = this._canvas;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssW = w;
    this._cssH = h;
  }

  // ─────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────

  _loop(ts) {
    if (!this._running) return;
    const dt = Math.min((ts - (this._lastTs || ts)) / 1000, 0.1); // 秒、上限 0.1s
    this._lastTs = ts;
    this._draw(dt, ts);
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _draw(dt, ts) {
    const ctx = this._ctx;
    const W = this._cssW;
    const H = this._cssH;
    const cx = W / 2;
    const cy = H / 2;
    const baseR = Math.min(W, H) * 0.22; // 基準半径

    // ── 背景クリア（半透明でトレイルを残すと美しいが、今回はクリーンに）
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(ctx, W, H, ts);

    // ── 周波数データ取得
    let hasAnalyser = false;
    if (this._analyser && this._freqData) {
      this._analyser.getByteFrequencyData(this._freqData);
      // データが全ゼロでないか（再生中か）を判断
      hasAnalyser = this._freqData.some(v => v > 0);
    }

    // ── ビート周期に合わせた位相進行
    const beatHz = (this._getBeatHz && this._getBeatHz()) || null;
    this._updateBeatPhase(dt, beatHz, hasAnalyser);

    // ── 外周の周波数リング（うっすら）
    if (hasAnalyser && !this._reducedMotion) {
      this._drawFreqRing(ctx, cx, cy, baseR, this._freqData);
    }

    // ── 呼吸する同心円（中心・主役）
    this._drawBreathCircles(ctx, cx, cy, baseR, ts, hasAnalyser);
  }

  /** 夜空グラデーション背景 */
  _drawBackground(ctx, W, H, ts) {
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, '#141430');
    grad.addColorStop(0.6, '#0d0d28');
    grad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * ビート位相を更新する
   * beatHz が高くても視覚は穏やかな範囲（0.05–0.5 Hz 相当）にマッピング
   */
  _updateBeatPhase(dt, beatHz, isPlaying) {
    // 視覚的なビート周波数は、実際の beatHz を穏やかな範囲へ圧縮
    let visualHz;
    if (!isPlaying || beatHz === null) {
      // 待機中: 0.1 Hz でゆっくり呼吸
      visualHz = 0.1;
    } else {
      // 実ビートHz（例: 2.5–40Hz）→ 視覚は 0.08–0.4Hz にマップ
      const t = Math.log1p(beatHz) / Math.log1p(40); // 0..1
      visualHz = 0.08 + t * 0.32;
    }

    if (!this._reducedMotion) {
      this._beatPhase += dt * visualHz * Math.PI * 2;
      if (this._beatPhase > Math.PI * 2) this._beatPhase -= Math.PI * 2;
    }
  }

  /**
   * 中心の呼吸する同心円（主役）
   * beatPhase に合わせて半径が脈動する
   */
  _drawBreathCircles(ctx, cx, cy, baseR, ts, isPlaying) {
    const phase = this._beatPhase;
    // 脈動係数: sin カーブで滑らかに 0.85..1.15
    const pulse = 1 + Math.sin(phase) * (isPlaying ? 0.15 : 0.07);

    const accent = this._accent;
    const [r, g, b] = this._hexToRgb(accent);

    // ── 一番外の霞んだ輪（前兆）
    for (let i = 3; i >= 1; i--) {
      const ringR = baseR * pulse * (1 + i * 0.38);
      const alpha = isPlaying ? 0.04 + (3 - i) * 0.025 : 0.02;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── メインリング（中心から 1個目・最も主張する）
    {
      const ringR = baseR * pulse;
      const glow = ctx.createRadialGradient(cx, cy, ringR * 0.7, cx, cy, ringR * 1.3);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.0)`);
      glow.addColorStop(0.5, `rgba(${r},${g},${b},${isPlaying ? 0.18 : 0.08})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0.0)`);

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${isPlaying ? 0.75 : 0.35})`;
      ctx.lineWidth = isPlaying ? 2 : 1.2;
      ctx.shadowColor = accent;
      ctx.shadowBlur = isPlaying ? 24 : 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── 内側の静かな輪（2個）
    for (let i = 1; i <= 2; i++) {
      const innerR = baseR * pulse * (1 - i * 0.28);
      if (innerR < 4) continue;
      const alpha = isPlaying ? (0.45 - i * 0.15) : (0.18 - i * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${Math.max(0, alpha)})`;
      ctx.lineWidth = isPlaying ? (2 - i * 0.4) : 0.8;
      ctx.shadowColor = accent;
      ctx.shadowBlur = isPlaying ? (12 - i * 3) : 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── 中心の核（小さな光点）
    {
      const coreR = Math.max(3, baseR * 0.06 * (1 + Math.sin(phase * 2) * 0.3));
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5);
      coreGrad.addColorStop(0, `rgba(${r},${g},${b},${isPlaying ? 0.9 : 0.4})`);
      coreGrad.addColorStop(0.4, `rgba(${r},${g},${b},${isPlaying ? 0.35 : 0.12})`);
      coreGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }
  }

  /**
   * 外周の周波数リング（粒子/波）
   * AnalyserNode の getByteFrequencyData で描く、うっすら・瞑想的
   */
  _drawFreqRing(ctx, cx, cy, baseR, freqData) {
    const len = freqData.length;
    const ringR = baseR * 1.55; // 呼吸リングよりやや外側
    const accent = this._accent;
    const [r, g, b] = this._hexToRgb(accent);
    const phase = this._beatPhase;

    // 使用するビン数（低〜中域を重視、高域は適度に）
    const bins = Math.min(len, 96);
    const angleStep = (Math.PI * 2) / bins;

    ctx.save();
    ctx.globalAlpha = 0.55;

    for (let i = 0; i < bins; i++) {
      const v = freqData[i] / 255; // 0..1
      if (v < 0.03) continue;      // 無音ビンは描かない

      const angle = i * angleStep - Math.PI / 2; // 上から開始
      const barH = v * baseR * 0.55;             // 最大振れ幅
      const x1 = cx + Math.cos(angle) * ringR;
      const y1 = cy + Math.sin(angle) * ringR;
      const x2 = cx + Math.cos(angle) * (ringR + barH);
      const y2 = cy + Math.sin(angle) * (ringR + barH);

      // 低域は暖色よりやや太く
      const binFrac = i / bins; // 0=低域、1=高域
      ctx.lineWidth = 1.5 - binFrac * 0.8;

      // 振幅に応じたアルファ
      const alpha = 0.15 + v * 0.65;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;

      // glow は振幅が大きいビンだけ
      if (v > 0.4) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * v;
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 点線で繋ぐ内側の輪（波形のベースライン・うっすら）
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /**
   * "#rrggbb" → [r, g, b] (0..255)
   * @param {string} hex
   * @returns {[number, number, number]}
   */
  _hexToRgb(hex) {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
}
