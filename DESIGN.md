# Hibiki（響）— 設計契約書（不変Protocol / Interface-First）

> ANIMA（Anima: Binaural Beats）の仕組みを完璧に再現したオリジナルWebアプリ。
> 周波数（バイノーラルビート / アイソクロニックトーン / ソルフェジオ）で脳波を誘導し、
> 睡眠・リラックス・集中・瞑想・不安解放・耳鳴り緩和をサポートする。スマホPWA。

**この文書は並列ワーカー全員への「不変の契約」である。ここに定義された
関数シグネチャ・データスキーマ・DOM id/class・CSS変数を勝手に変えてはならない。**
担当ファイル以外は触らない。契約に疑問があれば実装を止めてPM（オーケストレーター）に報告。

---

## 0. プロダクト概要

- **名前**: Hibiki（響） / タグライン「周波数で、ととのう。」
- **形態**: 静的サイト + PWA（オフライン動作、ホーム画面追加、スマホ最適化）
- **音は全て Web Audio API でリアルタイム合成**（音源ファイル不要 → 軽量・著作権クリーン）
- **言語**: 日本語UI（将来i18n可能な構造だが今回は日本語固定）
- **ES Modules** を使用（`<script type="module">`）。ローカル確認は `python3 -m http.server 8080`
- **ANIMAより優れた点（オリジナルの差別化）**: お気に入り保存・カスタム周波数モード・ミキサー常時表示・科学的根拠の常時表示・Wake Lock（画面オフ防止）

---

## 1. ファイル構成と担当（衝突ゼロのファイル分担）

```
hibiki/
├── index.html              [W4] マークアップ（DOM契約に厳密準拠）
├── css/styles.css          [W4] デザイン全般
├── js/
│   ├── audio-engine.js     [W1] オーディオエンジン（心臓部）
│   ├── presets.js          [W2] プリセット/カテゴリ/科学テキストのデータ
│   ├── visualizer.js       [W3] ビジュアライザー（Canvas）
│   └── app.js              [W5] 全UI配線・状態管理・localStorage
├── manifest.webmanifest    [W6] PWAマニフェスト
├── sw.js                   [W6] Service Worker
├── icons/                  [W6] アイコン（生成スクリプトで作る）
└── tools/gen-icons.mjs     [W6] アイコン生成スクリプト（node, sharp不要のSVG→PNG or 純SVG）
```

各JSは ESM。`app.js` が全モジュールを import して配線する。

```js
// app.js での import 契約
import { AudioEngine } from './audio-engine.js';
import { CATEGORIES, PRESETS, NOISES, AMBIENCES, getPresetById } from './presets.js';
import { Visualizer } from './visualizer.js';
```

---

## 2. [W1] audio-engine.js — オーディオエンジン契約

`export class AudioEngine { ... }` を提供する。**WebAudioのノードグラフは内部実装自由**だが、
以下の public API シグネチャと挙動は契約として固定。

### ノードグラフ（推奨構成）
```
[Tone Layer]
  binaural:    oscL(carrier) → panL(-1) ┐
               oscR(carrier+beat) → panR(+1) ┘→ toneGain
  isochronic:  osc(carrier) → gateGain(LFOで0/1矩形) → toneGain
  solfeggio:   osc(carrier, sine) → toneGain
[Noise Layer]  noiseSource(AudioWorklet or BufferSource loop) → noiseGain
[Ambience]     合成（noise + bandpass/LFOで rain/waves/forest/night/sakura を作る） → ambGain
toneGain, noiseGain, ambGain → masterGain → analyser → destination
```

### Public API（シグネチャ固定）
```js
class AudioEngine {
  constructor()                       // ノード生成はinit()まで遅延

  async init(): Promise<void>         // AudioContext生成 + resume。必ずユーザージェスチャ内で呼ぶ。
                                      // 二重呼び出し安全（冪等）。iOS Safari対応（resume必須）。

  get isPlaying(): boolean
  get isReady(): boolean              // init済みか

  // --- 音作り（再生中でもクロスフェードで切替可） ---
  setTone(cfg): void
    // cfg = { method:'binaural'|'isochronic'|'solfeggio', carrierHz:number,
    //         beatHz?:number, waveform?:'sine'|'triangle'|'square'|'sawtooth' }
    // method=solfeggio の時 beatHz は無視。carrierHz がソルフェジオ値(528等)
    // method=binaural/isochronic の時 beatHz が目標脳波(例 2.5=delta)
  setNoise(type): void                // type ∈ {'white','pink','brown', null} null=オフ
  setAmbience(type): void             // type ∈ {'rain','waves','forest','night','sakura', null}

  // --- 音量（全て 0.0〜1.0、内部で滑らかにramp） ---
  setMasterVolume(v): void
  setToneVolume(v): void
  setNoiseVolume(v): void
  setAmbienceVolume(v): void

  // --- 再生制御 ---
  async play(opts?): Promise<void>    // opts={ fadeInSec?:number=2 } masterを0→目標へ
  stop(opts?): void                   // opts={ fadeOutSec?:number=2 } 後にオシレータ停止
  async toggle(): Promise<void>

  // --- スリープタイマー ---
  setTimer(minutes, onComplete?): void  // 時間が来たら fadeOut して stop、onComplete()呼ぶ
  clearTimer(): void
  get timerRemainingSec(): number|null

  // --- ビジュアライザー連携 ---
  getAnalyser(): AnalyserNode          // init後に有効。null可（未init時）
  getCurrentBeatHz(): number|null      // 現在のビート周波数（パルス同期用）

  // --- 状態 ---
  getState(): { isPlaying, method, carrierHz, beatHz, noise, ambience,
                masterVolume, toneVolume, noiseVolume, ambienceVolume }
}
```

### 実装要件
- **バイノーラル**: 左 carrierHz、右 carrierHz+beatHz。StereoPannerNode で完全L/R分離。
- **アイソクロニック**: 単一osc を beatHz の矩形ゲートでON/OFF（ヘッドホン不要）。
  ゲートは GainNode を `setValueCurveAtTime` か LFO(square)→gain.gain で実装。クリックノイズ防止に短いramp。
- **ソルフェジオ**: 純音 sine、carrierHz=ソルフェジオ値。倍音を少し足して心地よくしてよい。
- **ノイズ**: White=一様乱数 / Pink=Paul Kellet近似 / Brown=積分（leaky）。
  AudioWorklet が理想だが、`AudioBuffer`(数秒)を loop=true で再生する方式でも可（CPU軽い）。
- **環境音は合成で作る**（音源ファイル禁止）:
  - rain: white/pinkノイズ → bandpass(1-6kHz) + 軽いランダム振幅変調
  - waves: brownノイズ → lowpass + 0.1Hz前後のLFOで音量うねり
  - forest: pinkノイズlowpass + 間欠的な高域チャープ（鳥）を軽く
  - night: brownノイズ very lowpass + 虫の細い帯域ノイズを薄く
  - sakura: pinkノイズ soft + ゆったりLFO（風）。上品に。
  - 完璧な実物再現でなくてよいが「らしさ」と心地よさを最優先。
- 全ての音量変更・fade は `setTargetAtTime`/`linearRampToValueAtTime` で**クリックノイズなく**。
- AudioContext は init() で1つだけ生成。再生停止後もcontextは保持（再playで再利用、osc は使い捨て再生成）。
- エラーは握りつぶさず console.warn。例外でUIを壊さない。

---

## 3. [W2] presets.js — データ契約

```js
// 脳波帯域メタ
export const BANDS = {
  delta:{ name:'デルタ波', range:'0.5–4 Hz', use:'深い睡眠', color:'#5b6ee1' },
  theta:{ name:'シータ波', range:'4–8 Hz',  use:'瞑想・入眠', color:'#7b5be1' },
  alpha:{ name:'アルファ波', range:'8–14 Hz', use:'リラックス集中', color:'#5be1c4' },
  beta: { name:'ベータ波',  range:'14–30 Hz', use:'覚醒・集中', color:'#e1b15b' },
  gamma:{ name:'ガンマ波',  range:'30–100 Hz',use:'高度認知', color:'#e15b7b' },
  solfeggio:{ name:'ソルフェジオ', range:'396–963 Hz', use:'調律・癒し', color:'#e1c95b' },
};

// カテゴリ（ホームのタブ／セクション）
export const CATEGORIES = [
  { id:'sleep',   name:'深い睡眠',     emoji:'🌙', tagline:'…', accent:'#5b6ee1' },
  { id:'relax',   name:'リラックス',   emoji:'🌊', tagline:'…', accent:'#5be1c4' },
  { id:'focus',   name:'集中',         emoji:'🎯', tagline:'…', accent:'#e1b15b' },
  { id:'meditate',name:'瞑想',         emoji:'🧘', tagline:'…', accent:'#7b5be1' },
  { id:'anxiety', name:'不安解放',     emoji:'🍃', tagline:'…', accent:'#7be15b' },
  { id:'tinnitus',name:'耳鳴り緩和',   emoji:'🔔', tagline:'…', accent:'#9b9bb0' },
  { id:'balance', name:'内なるバランス',emoji:'☯️', tagline:'…', accent:'#e1c95b' },
];

// ノイズ・環境音のメタ（UI表示用）
export const NOISES = [
  { id:'white', name:'ホワイトノイズ', desc:'全帯域。集中・耳鳴りマスキング' },
  { id:'pink',  name:'ピンクノイズ',   desc:'自然でやわらか。睡眠向き' },
  { id:'brown', name:'ブラウンノイズ', desc:'低音リッチ。深いリラックス' },
];
export const AMBIENCES = [
  { id:'rain',   name:'雨',   emoji:'🌧️' },
  { id:'waves',  name:'波',   emoji:'🌊' },
  { id:'forest', name:'森',   emoji:'🌲' },
  { id:'night',  name:'夜',   emoji:'🌌' },
  { id:'sakura', name:'桜',   emoji:'🌸' },
];

// プリセット（各カテゴリに2–4個、合計18個前後）
export const PRESETS = [
  {
    id:'deep-sleep-delta',           // 一意。kebab-case
    categoryId:'sleep',
    name:'深い眠りへ',
    method:'binaural',               // 'binaural'|'isochronic'|'solfeggio'
    carrierHz:100,
    beatHz:2.5,                      // solfeggioの時は不要
    waveform:'sine',
    band:'delta',                    // BANDSのキー
    ambience:'rain',                 // 初期環境音 or null
    noise:'brown',                   // 初期ノイズ or null
    toneVolume:0.5, noiseVolume:0.25, ambienceVolume:0.4,
    headphones:true,                 // バイノーラルはtrue、アイソ/ソルフェジオはfalse可
    duration:45,                     // 推奨タイマー(分)。null可
    science:'デルタ波(2.5Hz)は深いノンレム睡眠で優勢になる脳波。…（日本語2–3文、誇大表現禁止・「促す/サポート」等の穏当な表現）',
  },
  // … 以下、全カテゴリを埋める（下のカバレッジ要件参照）
];

// ヘルパ
export function getPresetById(id) { /* … */ }
export function getPresetsByCategory(categoryId) { /* … */ }
```

### カバレッジ要件（必ず満たす）
- 各カテゴリに最低2プリセット。合計16〜20。
- 帯域の代表値: sleep=delta(1-3Hz)/theta、relax=alpha(10Hz)、focus=beta(16-20Hz)+gamma(40Hz)、
  meditate=theta(6Hz)、anxiety=alpha+ソルフェジオ396/639、tinnitus=ホワイト/ピンク中心+notch的発想、
  balance=ソルフェジオ528/432。
- ソルフェジオは最低 396/432/528/639 を使ったプリセットを含める。
- `science` は**医療的断定・効能保証を避ける**（「整える/サポート/促す/言われています」等）。景表法/薬機法配慮。

---

## 4. [W3] visualizer.js — ビジュアライザー契約

```js
export class Visualizer {
  constructor(canvas)                      // <canvas id="visualizer">
  attach(analyser, getBeatHz)              // AudioEngine.getAnalyser() と getCurrentBeatHz を渡す
  setAccent(colorHex)                      // プリセットのaccentで色変更
  start()                                  // requestAnimationFrameループ開始
  stop()                                   // 停止
  resize()                                 // DPR対応リサイズ（window resize時 app.jsが呼ぶ）
}
```
- **呼吸する円**（中心の同心円が beatHz でゆっくり脈動 = 吸う4秒/吐く…でなく、beatの周期で大きさ変化）
  ＋ analyser の周波数データで外周の波/粒子をうっすら描く。
- ダーク背景に accent 色の発光（glow）。瞑想的でなめらか。60fps、重すぎない。
- 再生してない時は静かな待機アニメ（ゆっくり呼吸）。

---

## 5. [W4] index.html + css/styles.css — DOM契約

`app.js` は以下の id/class を前提に配線する。**この id/class名・data属性を固定**。

### 必須DOM（id）
```
#app                      ルート
#home-view                ホーム画面（カテゴリ+プリセットカード）
  #category-tabs          カテゴリの横スクロールタブ（app.jsが生成 or HTMLに枠）
  #preset-grid            プリセットカード一覧（app.jsが生成）
#favorites-view           お気に入り画面（#favorites-grid）
#custom-view              カスタム周波数画面
  #custom-method (select: binaural/isochronic/solfeggio)
  #custom-carrier (input range + #custom-carrier-val 表示)
  #custom-beat   (input range + #custom-beat-val 表示)
  #custom-play   (button)
#player                   プレイヤー（ボトムシート/モーダル。data-state="hidden|mini|full"）
  #player-title           現在のプリセット名
  #player-band            帯域バッジ（例「デルタ波 2.5Hz」）
  #visualizer             <canvas>
  #play-btn               再生/一時停止トグル（aria-pressed）
  #headphone-hint         ヘッドホン推奨表示（バイノーラル時のみ表示）
  #science-text           科学的根拠テキスト
  #fav-btn                お気に入りトグル（aria-pressed）
  // ミキサー
  #mix-tone   (input range 0..100) + ラベル
  #mix-noise  (input range) + #noise-select（雨/波…ではなくノイズ種別 white/pink/brown + off）
  #mix-amb    (input range) + #amb-select（rain/waves/forest/night/sakura + off）
  #master-vol (input range)
  // タイマー
  #timer-select (chips: 5/10/15/30/45/60/∞ 分) + #timer-remaining 表示
#nav                      ボトムナビ（data-view切替: home/favorites/custom）
  .nav-btn[data-view="home|favorites|custom"]
#toast                    一時通知（任意）
```

### data属性・イベント契約
- プリセットカードは `<button class="preset-card" data-preset-id="...">` で app.js が委譲クリック。
- ナビは `.nav-btn[data-view]`。タイマーchipは `.timer-chip[data-min]`（∞は data-min="0"）。
- スライダーは全て `<input type="range" min="0" max="100">`（app.jsが/100して渡す）。

### デザイン方針（styles.css）
- **ダーク・瞑想的・上質**。背景は深い夜空のグラデーション（#0a0a1a→#141430→#1a1040 等）、
  かすかに動くオーロラ/グラデーション。グラスモーフィズム（半透明+blur）のカード。
- アクセントはプリセット帯域カラー（CSS変数 `--accent` を app.js が動的に更新する想定）。
- CSS変数を `:root` に定義: `--bg`, `--surface`, `--text`, `--text-dim`, `--accent`,
  `--radius`, `--blur`。**`--accent` は app.js が `document.documentElement.style.setProperty('--accent', ...)` で更新する**。
- スマホファースト（375–430px基準）。タップターゲット44px以上。`safe-area-inset` 対応。
- なめらかなトランジション。プレイヤーはボトムシート風（mini↔full）。
- フォント: system-ui / Noto Sans JP（webfont任意、なければsystem）。
- prefers-reduced-motion 尊重。

---

## 6. [W5] app.js — 配線・状態管理契約

責務:
1. DOMContentLoaded で AudioEngine/Visualizer 生成、CATEGORIES/PRESETS から `#category-tabs`/`#preset-grid` を描画。
2. プリセットカードクリック → エンジンに setTone/setNoise/setAmbience/各volume を適用 → player を full 表示 → （ユーザーが#play-btnで再生開始、iOS対応のため**初回再生は必ずクリック内でinit()→play()**）。
3. `#play-btn` トグルで play/stop。再生中は Visualizer.start、停止で stop。
4. ミキサー各スライダー → 対応する setXxxVolume。#noise-select/#amb-select → setNoise/setAmbience。
5. タイマーchip → engine.setTimer。残り時間を #timer-remaining に毎秒表示。
6. お気に入り: localStorage キー `hibiki.favorites`（presetId配列）。#fav-btnトグル、#favorites-view描画。
7. カスタム: #custom-* から cfg組み立て → setTone → 再生。カスタム設定も localStorage `hibiki.custom` に保存可。
8. `--accent` をプリセットの帯域カラーへ更新。ヘッドホン推奨(#headphone-hint)を method=binaural時のみ表示。
9. Wake Lock API で再生中の画面オフ防止（対応ブラウザのみ、失敗は無視）。
10. ページ可視性/中断（visibilitychange）でのAudioContext扱いを適切に（バックグラウンド再生は継続を試みる）。
11. 状態の単一管理（`const state = {...}`）。マジックナンバー回避、定数化。

localStorage キー命名: `hibiki.favorites`, `hibiki.custom`, `hibiki.lastPreset`, `hibiki.mixer`。

---

## 7. [W6] PWA契約

- `manifest.webmanifest`: name="Hibiki（響）" short_name="Hibiki" display="standalone"
  background_color/theme_color はダーク(#0a0a1a)、icons 192/512(maskable含む)、start_url="./", scope="./", orientation any。
- `index.html` に `<link rel="manifest" href="./manifest.webmanifest">` と theme-color meta、apple-touch-icon、
  `apple-mobile-web-app-capable` 系メタを入れるのは **W4の責務**（W6はマニフェスト本体とSWとアイコンに集中、ただしW4へ必要なheadタグ一覧を提示）。
- `sw.js`: app-shell（html/css/js/manifest/icons）を cache-first でプリキャッシュ、ナビゲーションはネット優先→キャッシュfallback。
  バージョン定数でキャッシュ更新。fetch failで壊れない。
- `tools/gen-icons.mjs`: 依存ライブラリなしで icons/icon-192.png, icon-512.png, icon-512-maskable.png,
  apple-touch-icon-180.png を生成（純Canvas代替が無いNode環境なので、SVGを書いて `icons/icon.svg` を置き、
  PNGはSVGから生成できなければ **SVGアイコン＋manifestはSVG参照 + 単色塗りのPNGフォールバックを最小生成**）。
  ロゴモチーフ: 同心円の波紋（響き）。背景#0a0a1a、波紋はグラデ。簡潔でよい。

---

## 8. 品質ゲート（全ワーカー共通の禁止事項）
- 担当外ファイルを編集しない。契約のシグネチャ/id/スキーマを変えない。
- `console.log` のデバッグ残し禁止（必要な警告のみ console.warn）。
- 医療効能の断定禁止（薬機法/景表法）。「治る」「効く」NG。「サポート/促す/言われています」OK。
- 外部CDN依存を増やさない（フォントは任意でgoogle fonts1本まで可、なければsystem-ui）。
- iOS Safari: AudioContext は必ずユーザージェスチャ内 init/resume。
- 動かないコードを書かない。各自の担当範囲は構文的に完結させる。

## 9. 受け入れ基準（Acceptance Criteria）
- `python3 -m http.server` で開き、プリセットを選んで再生するとヘッドホンで左右にビートが聞こえる。
- アイソクロニック/ソルフェジオ/ノイズ/環境音が鳴り分け、ミキサーで各音量が変わる。
- タイマーでフェードアウト停止する。お気に入り保存が永続する。カスタム周波数で鳴る。
- スマホ幅で崩れず、PWAとしてインストール可能、オフラインで起動する。
- コンソールに致命的エラーが出ない。クリックノイズが目立たない。

## 10. Out of Scope（今回やらない）
- 実音源ファイル（mp3）の同梱、ユーザーアカウント/課金、クラウド同期、ネイティブアプリ化、多言語。
