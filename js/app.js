/**
 * app.js — Hibiki（響） アプリ配線・状態管理 [W5]
 *
 * 責務:
 *  1. DOMContentLoaded で AudioEngine/Visualizer 生成、カテゴリ/プリセット描画
 *  2. プリセットカードクリック → エンジン設定適用 → プレイヤー表示
 *  3. play/stop トグル、ミキサー、タイマー、お気に入り、カスタム、Wake Lock
 *  4. localStorage 永続化 (`hibiki.*` キー)
 *
 * ESM。担当ファイル以外は触らない。console.log 禁止（console.warn のみ）。
 */

import { AudioEngine } from './audio-engine.js';
import { CATEGORIES, PRESETS, NOISES, AMBIENCES, BANDS, getPresetById } from './presets.js';
import { Visualizer } from './visualizer.js';

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

const LS_FAVORITES  = 'hibiki.favorites';
const LS_CUSTOM     = 'hibiki.custom';
const LS_LAST_PRESET = 'hibiki.lastPreset';
const LS_MIXER      = 'hibiki.mixer';

const TIMER_OPTIONS = [5, 10, 15, 30, 45, 60, 0]; // 0 = ∞
const DEFAULT_ACCENT = '#7b5be1';
const TIMER_UPDATE_INTERVAL_MS = 1000;

// ──────────────────────────────────────────────
// 状態（単一オブジェクト）
// ──────────────────────────────────────────────

const state = {
  // 現在選択中のプリセット
  currentPreset: null,

  // ナビ
  currentView: 'home',           // 'home' | 'favorites' | 'custom'
  currentCategoryId: null,       // null = 全表示

  // お気に入り
  favorites: [],                 // presetId[]

  // カスタム設定
  custom: {
    method: 'binaural',
    carrierHz: 200,
    beatHz: 10,
  },

  // タイマー
  timerMinutes: 0,               // 0 = 無効
  timerIntervalId: null,

  // Wake Lock
  wakeLock: null,
};

// ──────────────────────────────────────────────
// エンジン / ビジュアライザー（モジュールスコープ）
// ──────────────────────────────────────────────

const engine = new AudioEngine();
let visualizer = null;

// ──────────────────────────────────────────────
// DOM ヘルパ
// ──────────────────────────────────────────────

function $(id) {
  return document.getElementById(id);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// ──────────────────────────────────────────────
// localStorage ユーティリティ
// ──────────────────────────────────────────────

function loadFavorites() {
  try {
    const raw = localStorage.getItem(LS_FAVORITES);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveFavorites(ids) {
  try {
    localStorage.setItem(LS_FAVORITES, JSON.stringify(ids));
  } catch (_) { /* quota exceeded 等 */ }
}

function loadCustom() {
  try {
    const raw = localStorage.getItem(LS_CUSTOM);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveCustom(cfg) {
  try {
    localStorage.setItem(LS_CUSTOM, JSON.stringify(cfg));
  } catch (_) {}
}

function loadMixer() {
  try {
    const raw = localStorage.getItem(LS_MIXER);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveMixer() {
  try {
    const mixer = {
      tone:   parseInt($('mix-tone').value, 10),
      noise:  parseInt($('mix-noise').value, 10),
      amb:    parseInt($('mix-amb').value, 10),
      master: parseInt($('master-vol').value, 10),
      noiseType: $('noise-select').value,
      ambType:   $('amb-select').value,
    };
    localStorage.setItem(LS_MIXER, JSON.stringify(mixer));
  } catch (_) {}
}

function saveLastPreset(presetId) {
  try {
    if (presetId) localStorage.setItem(LS_LAST_PRESET, presetId);
  } catch (_) {}
}

// ──────────────────────────────────────────────
// アクセントカラー更新
// ──────────────────────────────────────────────

function updateAccent(colorHex) {
  document.documentElement.style.setProperty('--accent', colorHex || DEFAULT_ACCENT);
  if (visualizer) visualizer.setAccent(colorHex || DEFAULT_ACCENT);
}

// ──────────────────────────────────────────────
// カテゴリタブ描画
// [修正4] class="category-tab" / data-category-id / category-tab--active に統一
// ──────────────────────────────────────────────

function renderCategoryTabs() {
  const container = $('category-tabs');
  if (!container) return;
  container.innerHTML = '';

  // 「すべて」タブ
  const allBtn = el('button', {
    class: 'category-tab' + (state.currentCategoryId === null ? ' category-tab--active' : ''),
    'data-category-id': '',
    text: 'すべて',
  });
  container.appendChild(allBtn);

  for (const cat of CATEGORIES) {
    const btn = el('button', {
      class: 'category-tab' + (state.currentCategoryId === cat.id ? ' category-tab--active' : ''),
      'data-category-id': cat.id,
    });
    btn.textContent = `${cat.emoji} ${cat.name}`;
    container.appendChild(btn);
  }
}

// ──────────────────────────────────────────────
// プリセットカード描画
// ──────────────────────────────────────────────

function renderPresetGrid(categoryId) {
  const grid = $('preset-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filtered = categoryId
    ? PRESETS.filter((p) => p.categoryId === categoryId)
    : PRESETS;

  for (const preset of filtered) {
    const cat = CATEGORIES.find((c) => c.id === preset.categoryId);
    const band = BANDS[preset.band];
    const card = el('button', {
      class: 'preset-card',
      'data-preset-id': preset.id,
    });

    const bandLabel = el('span', { class: 'preset-card__band', text: band ? band.name : preset.band });
    bandLabel.style.color = band ? band.color : DEFAULT_ACCENT;

    const name = el('span', { class: 'preset-card__name', text: preset.name });

    const meta = el('span', { class: 'preset-card__meta' });
    if (cat) {
      meta.appendChild(el('span', { class: 'preset-card__emoji-mono', text: cat.emoji }));
      meta.appendChild(el('span', { class: 'preset-card__meta-text', text: cat.name }));
    }

    card.appendChild(bandLabel);
    card.appendChild(name);
    card.appendChild(meta);
    grid.appendChild(card);
  }
}

// ──────────────────────────────────────────────
// お気に入りグリッド描画
// ──────────────────────────────────────────────

function renderFavoritesGrid() {
  const grid = $('favorites-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.favorites.length === 0) {
    grid.appendChild(el('p', { class: 'empty-msg', text: 'お気に入りがまだありません。プリセットの ♡ ボタンで追加できます。' }));
    return;
  }

  for (const id of state.favorites) {
    const preset = getPresetById(id);
    if (!preset) continue;

    const cat = CATEGORIES.find((c) => c.id === preset.categoryId);
    const band = BANDS[preset.band];
    const card = el('button', {
      class: 'preset-card',
      'data-preset-id': preset.id,
    });

    const bandLabel = el('span', { class: 'preset-card__band', text: band ? band.name : preset.band });
    bandLabel.style.color = band ? band.color : DEFAULT_ACCENT;

    const name = el('span', { class: 'preset-card__name', text: preset.name });

    const meta = el('span', { class: 'preset-card__meta' });
    if (cat) {
      meta.appendChild(el('span', { class: 'preset-card__emoji-mono', text: cat.emoji }));
      meta.appendChild(el('span', { class: 'preset-card__meta-text', text: cat.name }));
    }

    card.appendChild(bandLabel);
    card.appendChild(name);
    card.appendChild(meta);
    grid.appendChild(card);
  }
}

// ──────────────────────────────────────────────
// プレイヤー UI 更新
// [修正8] #player-title-full も同時更新
// [修正7] favBtn は子 .icon-btn__icon の textContent のみ更新
// ──────────────────────────────────────────────

function updatePlayerUI(preset) {
  const titleEl    = $('player-title');
  const titleFullEl = $('player-title-full');
  const bandEl     = $('player-band');
  const scienceEl  = $('science-text');
  const hintEl     = $('headphone-hint');
  const favBtn     = $('fav-btn');

  if (titleEl)     titleEl.textContent     = preset.name;
  if (titleFullEl) titleFullEl.textContent = preset.name;
  if (scienceEl)   scienceEl.textContent   = preset.science || '';

  // 帯域バッジ
  if (bandEl) {
    const band = BANDS[preset.band];
    if (preset.method === 'solfeggio') {
      bandEl.textContent = band ? `${band.name}  ${preset.carrierHz} Hz` : `${preset.carrierHz} Hz`;
    } else {
      bandEl.textContent = band
        ? `${band.name}  ${preset.beatHz != null ? preset.beatHz + ' Hz' : ''}`
        : '';
    }
    bandEl.style.color = (band && band.color) || DEFAULT_ACCENT;
  }

  // ヘッドホンヒント
  if (hintEl) {
    hintEl.hidden = preset.method !== 'binaural';
  }

  // お気に入りボタン（子 span のみ更新）
  if (favBtn) {
    const isFav = state.favorites.includes(preset.id);
    favBtn.setAttribute('aria-pressed', String(isFav));
    const iconSpan = favBtn.querySelector('.icon-btn__icon');
    if (iconSpan) iconSpan.textContent = isFav ? '♥' : '♡';
  }

  // アクセント
  const cat = CATEGORIES.find((c) => c.id === preset.categoryId);
  updateAccent(cat ? cat.accent : DEFAULT_ACCENT);

  // ミキサー初期値をプリセット値にセット
  applyPresetMixerValues(preset);
}

function applyPresetMixerValues(preset) {
  const mixTone  = $('mix-tone');
  const mixNoise = $('mix-noise');
  const mixAmb   = $('mix-amb');
  const noiseSel = $('noise-select');
  const ambSel   = $('amb-select');

  if (mixTone)  { mixTone.value  = Math.round((preset.toneVolume  ?? 0.5) * 100); }
  if (mixNoise) { mixNoise.value = Math.round((preset.noiseVolume ?? 0.25) * 100); }
  if (mixAmb)   { mixAmb.value   = Math.round((preset.ambienceVolume ?? 0.4) * 100); }
  if (noiseSel) { noiseSel.value = preset.noise   || 'off'; }
  if (ambSel)   { ambSel.value   = preset.ambience || 'off'; }

  // エンジンへ反映（まだ再生中でなくても設定を先行適用）
  engine.setToneVolume((preset.toneVolume  ?? 0.5));
  engine.setNoiseVolume((preset.noiseVolume ?? 0.25));
  engine.setAmbienceVolume((preset.ambienceVolume ?? 0.4));
}

// ──────────────────────────────────────────────
// プリセット選択処理
// [修正6] selectPreset 内の visualizer.attach を削除（startPlayback の1回に集約）
// ──────────────────────────────────────────────

async function selectPreset(preset) {
  state.currentPreset = preset;
  saveLastPreset(preset.id);

  // エンジン設定（音量は applyPresetMixerValues でも設定するが tone 設定を先に）
  engine.setTone({
    method:    preset.method,
    carrierHz: preset.carrierHz,
    beatHz:    preset.beatHz ?? undefined,
    waveform:  preset.waveform || 'sine',
  });
  engine.setNoise(preset.noise   ?? null);
  engine.setAmbience(preset.ambience ?? null);

  // ミキサー UI + エンジン音量
  updatePlayerUI(preset);

  // プレイヤーを full 状態で表示
  const player = $('player');
  if (player) player.setAttribute('data-state', 'full');
}

// ──────────────────────────────────────────────
// 再生 / 停止
// [修正3] play-btn-full も updatePlayBtn で更新
// [修正6] startPlayback 内の visualizer.attach を唯一の接続点にする
// ──────────────────────────────────────────────

async function startPlayback() {
  // iOS 対応: 必ずユーザーイベント内で init() → play()
  await engine.init();

  // ビジュアライザー接続（init 後に有効になる、ここが唯一の attach 呼び出し）
  if (visualizer && !visualizer._analyser) {
    visualizer.attach(engine.getAnalyser(), () => engine.getCurrentBeatHz());
  }

  await engine.play({ fadeInSec: 2 });
  if (visualizer) visualizer.start();

  updatePlayBtn(true);
  await requestWakeLock();

  // [修正9] 再生開始時にタイマーを適用（timerMinutes が設定済みなら）
  if (state.timerMinutes > 0) {
    engine.setTimer(state.timerMinutes, () => {
      updatePlayBtn(false);
      stopTimerDisplay();
      releaseWakeLock();
      const remaining = $('timer-remaining');
      if (remaining) remaining.textContent = '完了';
    });
    startTimerDisplay();
  }
}

function stopPlayback() {
  engine.stop({ fadeOutSec: 2 });
  if (visualizer) visualizer.stop();
  updatePlayBtn(false);
  releaseWakeLock();
  stopTimerDisplay();
}

// [修正3] 両ボタン（#play-btn / #play-btn-full）の子 .play-btn__icon と aria-pressed を更新
// [修正7] btn.textContent 直書き禁止、子 span のみ書き換える
function updatePlayBtn(isPlaying) {
  const btns = [$('play-btn'), $('play-btn-full')];
  for (const btn of btns) {
    if (!btn) continue;
    btn.setAttribute('aria-pressed', String(isPlaying));
    const iconSpan = btn.querySelector('.play-btn__icon');
    if (iconSpan) iconSpan.textContent = isPlaying ? '⏸' : '▶';
  }
}

// ──────────────────────────────────────────────
// ミキサー
// [修正5] localStorage 復元時、noiseType/ambType をエンジンにも反映
// ──────────────────────────────────────────────

function initMixer() {
  // スライダー: トーン
  const mixTone = $('mix-tone');
  if (mixTone) {
    mixTone.addEventListener('input', () => {
      engine.setToneVolume(parseInt(mixTone.value, 10) / 100);
      saveMixer();
    });
  }

  // スライダー: ノイズ
  const mixNoise = $('mix-noise');
  if (mixNoise) {
    mixNoise.addEventListener('input', () => {
      engine.setNoiseVolume(parseInt(mixNoise.value, 10) / 100);
      saveMixer();
    });
  }

  // スライダー: 環境音
  const mixAmb = $('mix-amb');
  if (mixAmb) {
    mixAmb.addEventListener('input', () => {
      engine.setAmbienceVolume(parseInt(mixAmb.value, 10) / 100);
      saveMixer();
    });
  }

  // スライダー: マスター
  const masterVol = $('master-vol');
  if (masterVol) {
    masterVol.addEventListener('input', () => {
      engine.setMasterVolume(parseInt(masterVol.value, 10) / 100);
      saveMixer();
    });
  }

  // ノイズ種別セレクト
  const noiseSel = $('noise-select');
  if (noiseSel) {
    noiseSel.addEventListener('change', () => {
      const val = noiseSel.value;
      engine.setNoise(val === 'off' ? null : val);
      saveMixer();
    });
  }

  // 環境音セレクト
  const ambSel = $('amb-select');
  if (ambSel) {
    ambSel.addEventListener('change', () => {
      const val = ambSel.value;
      engine.setAmbience(val === 'off' ? null : val);
      saveMixer();
    });
  }

  // 保存済みミキサー設定を復元
  const saved = loadMixer();
  if (saved) {
    if (mixTone  && saved.tone   != null) { mixTone.value  = saved.tone;   engine.setToneVolume(saved.tone / 100); }
    if (mixNoise && saved.noise  != null) { mixNoise.value = saved.noise;  engine.setNoiseVolume(saved.noise / 100); }
    if (mixAmb   && saved.amb    != null) { mixAmb.value   = saved.amb;    engine.setAmbienceVolume(saved.amb / 100); }
    if (masterVol && saved.master != null) { masterVol.value = saved.master; engine.setMasterVolume(saved.master / 100); }
    // [修正5] noiseType/ambType: select.value の復元に加えてエンジンにも反映
    if (noiseSel && saved.noiseType != null) {
      noiseSel.value = saved.noiseType;
      engine.setNoise(saved.noiseType === 'off' ? null : saved.noiseType);
    }
    if (ambSel && saved.ambType != null) {
      ambSel.value = saved.ambType;
      engine.setAmbience(saved.ambType === 'off' ? null : saved.ambType);
    }
  }
}

// ──────────────────────────────────────────────
// タイマー
// [修正9] chip 選択は state.timerMinutes に保存するだけ。
//         engine.setTimer は再生開始(startPlayback)時に呼ぶ。
//         再生中に chip 変更したら即時 setTimer 更新。∞(0) は clearTimer。
//         残り時間表示は再生中のみ。
// ──────────────────────────────────────────────

function renderTimerChips() {
  const timerSel = $('timer-select');
  if (!timerSel) return;
  timerSel.innerHTML = '';

  for (const min of TIMER_OPTIONS) {
    const chip = el('button', {
      class: 'timer-chip' + (state.timerMinutes === min ? ' active' : ''),
      'data-min': String(min),
      text: min === 0 ? '∞' : `${min}分`,
    });
    timerSel.appendChild(chip);
  }
}

function applyTimer(minutes) {
  state.timerMinutes = minutes;
  renderTimerChips();

  if (minutes === 0) {
    // ∞ 選択: タイマー解除
    engine.clearTimer();
    stopTimerDisplay();
    const remaining = $('timer-remaining');
    if (remaining) remaining.textContent = '';
    return;
  }

  // 再生中の場合のみ即時タイマー更新
  if (engine.isPlaying) {
    engine.setTimer(minutes, () => {
      updatePlayBtn(false);
      stopTimerDisplay();
      releaseWakeLock();
      const remaining = $('timer-remaining');
      if (remaining) remaining.textContent = '完了';
    });
    startTimerDisplay();
  }
  // 未再生時は state.timerMinutes に保存するだけ（startPlayback で適用）
}

function startTimerDisplay() {
  stopTimerDisplay();
  if (state.timerMinutes === 0) return;

  state.timerIntervalId = setInterval(() => {
    const remaining = $('timer-remaining');
    if (!remaining) return;
    const sec = engine.timerRemainingSec;
    if (sec === null) {
      remaining.textContent = '';
      stopTimerDisplay();
      return;
    }
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    remaining.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, TIMER_UPDATE_INTERVAL_MS);
}

function stopTimerDisplay() {
  if (state.timerIntervalId !== null) {
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

// ──────────────────────────────────────────────
// お気に入り
// [修正7] favBtn は子 .icon-btn__icon の textContent のみ更新
// ──────────────────────────────────────────────

function toggleFavorite(presetId) {
  const idx = state.favorites.indexOf(presetId);
  if (idx === -1) {
    state.favorites.push(presetId);
  } else {
    state.favorites.splice(idx, 1);
  }
  saveFavorites(state.favorites);

  // お気に入りボタン UI 更新（子 span のみ書き換える）
  const favBtn = $('fav-btn');
  if (favBtn && state.currentPreset && state.currentPreset.id === presetId) {
    const isFav = state.favorites.includes(presetId);
    favBtn.setAttribute('aria-pressed', String(isFav));
    const iconSpan = favBtn.querySelector('.icon-btn__icon');
    if (iconSpan) iconSpan.textContent = isFav ? '♥' : '♡';
  }

  // お気に入りビュー再描画
  renderFavoritesGrid();
}

// ──────────────────────────────────────────────
// ナビ切替
// [修正2] el.hidden 操作を撤去、classList.toggle('view--active') に統一
// ──────────────────────────────────────────────

function switchView(viewName) {
  state.currentView = viewName;

  const views = {
    home:      $('home-view'),
    favorites: $('favorites-view'),
    custom:    $('custom-view'),
  };

  for (const [name, viewEl] of Object.entries(views)) {
    if (viewEl) viewEl.classList.toggle('view--active', name === viewName);
  }

  // ナビボタンのアクティブ状態
  const navBtns = document.querySelectorAll('.nav-btn[data-view]');
  for (const btn of navBtns) {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  }

  // お気に入りビューに切替時は再描画
  if (viewName === 'favorites') renderFavoritesGrid();
}

// ──────────────────────────────────────────────
// カスタム周波数
// [修正10] スライダー value を Hz として直接使用、#custom-carrier-val/#custom-beat-val に Hz 表示
//          method=solfeggio 時は #custom-beat-group を隠す
// [修正8]  カスタム再生時も #player-title-full を更新
// ──────────────────────────────────────────────

function initCustom() {
  const methodSel  = $('custom-method');
  const carrierEl  = $('custom-carrier');
  const carrierVal = $('custom-carrier-val');
  const beatEl     = $('custom-beat');
  const beatVal    = $('custom-beat-val');
  const playBtn    = $('custom-play');
  const beatGroup  = $('custom-beat-group');

  // 保存済みカスタム設定を復元
  const saved = loadCustom();
  if (saved) {
    state.custom = { ...state.custom, ...saved };
  }

  if (methodSel)  methodSel.value  = state.custom.method;
  // スライダー value は Hz 値そのまま
  if (carrierEl)  carrierEl.value  = state.custom.carrierHz;
  if (carrierVal) carrierVal.textContent = state.custom.carrierHz;
  if (beatEl)     beatEl.value     = state.custom.beatHz;
  if (beatVal)    beatVal.textContent = state.custom.beatHz;

  // 初期表示: solfeggio 時はビート欄を隠す
  if (beatGroup) beatGroup.hidden = (state.custom.method === 'solfeggio');

  if (methodSel) {
    methodSel.addEventListener('change', () => {
      state.custom.method = methodSel.value;
      // solfeggio 時はビート設定欄を隠す
      if (beatGroup) beatGroup.hidden = (state.custom.method === 'solfeggio');
      saveCustom(state.custom);
    });
  }

  if (carrierEl) {
    carrierEl.addEventListener('input', () => {
      // value を Hz として直接使用
      state.custom.carrierHz = parseFloat(carrierEl.value);
      if (carrierVal) carrierVal.textContent = state.custom.carrierHz;
      saveCustom(state.custom);
    });
  }

  if (beatEl) {
    beatEl.addEventListener('input', () => {
      // value を Hz として直接使用
      state.custom.beatHz = parseFloat(beatEl.value);
      if (beatVal) beatVal.textContent = state.custom.beatHz;
      saveCustom(state.custom);
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      // カスタム再生（プリセット選択と同様に扱う）
      const cfg = {
        method:    state.custom.method,
        carrierHz: state.custom.carrierHz,
        beatHz:    state.custom.method !== 'solfeggio' ? state.custom.beatHz : undefined,
        waveform:  'sine',
      };

      engine.setTone(cfg);
      engine.setNoise(null);
      engine.setAmbience(null);

      // ヘッドホンヒント
      const hintEl = $('headphone-hint');
      if (hintEl) hintEl.hidden = (cfg.method !== 'binaural');

      // プレイヤー表示
      const player = $('player');
      if (player) player.setAttribute('data-state', 'full');

      // [修正8] #player-title と #player-title-full を両方更新
      const titleEl = $('player-title');
      if (titleEl) titleEl.textContent = 'カスタム周波数';
      const titleFullEl = $('player-title-full');
      if (titleFullEl) titleFullEl.textContent = 'カスタム周波数';

      const bandEl = $('player-band');
      if (bandEl) {
        if (cfg.method === 'solfeggio') {
          bandEl.textContent = `${cfg.carrierHz} Hz`;
        } else {
          bandEl.textContent = `${cfg.carrierHz} Hz / ビート ${cfg.beatHz} Hz`;
        }
      }

      const scienceEl = $('science-text');
      if (scienceEl) scienceEl.textContent = 'カスタム周波数設定での再生中。';

      updateAccent(DEFAULT_ACCENT);

      if (!engine.isPlaying) {
        await startPlayback();
      } else {
        // 再生中なら音だけ切り替え（すでに startPlayback で init 済み）
      }
    });
  }
}

// ──────────────────────────────────────────────
// Wake Lock
// ──────────────────────────────────────────────

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
    });
  } catch (_) {
    // 非対応またはフォーカスなしで失敗 → 無視
  }
}

async function releaseWakeLock() {
  if (state.wakeLock) {
    try {
      await state.wakeLock.release();
    } catch (_) {}
    state.wakeLock = null;
  }
}

// visibilitychange: バックグラウンドに行ったらリリース、戻ったら再取得
function initVisibilityHandler() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      releaseWakeLock();
      // AudioContext はバックグラウンドでも継続を試みる（停止しない）
    } else {
      // フォアグラウンドに戻った時、再生中なら Wake Lock 再取得
      if (engine.isPlaying) {
        await requestWakeLock();
      }
    }
  });
}

// ──────────────────────────────────────────────
// ノイズ/環境音セレクト: 初期 option 生成
// ──────────────────────────────────────────────

function populateSelectOptions() {
  const noiseSel = $('noise-select');
  if (noiseSel) {
    noiseSel.innerHTML = '';
    noiseSel.appendChild(el('option', { value: 'off', text: 'オフ' }));
    for (const n of NOISES) {
      noiseSel.appendChild(el('option', { value: n.id, text: n.name }));
    }
  }

  const ambSel = $('amb-select');
  if (ambSel) {
    ambSel.innerHTML = '';
    ambSel.appendChild(el('option', { value: 'off', text: 'オフ' }));
    for (const a of AMBIENCES) {
      ambSel.appendChild(el('option', { value: a.id, text: `${a.emoji} ${a.name}` }));
    }
  }
}

// ──────────────────────────────────────────────
// トースト（軽い通知）
// ──────────────────────────────────────────────

function showToast(message, durationMs = 2500) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), durationMs);
}

// ──────────────────────────────────────────────
// メインの初期化
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // [修正1] Service Worker 登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[SW]', e));
  }

  // ── ビジュアライザー初期化
  const canvas = $('visualizer');
  if (canvas) {
    visualizer = new Visualizer(canvas);
    // 待機アニメーション開始（再生前のゆっくり呼吸）
    visualizer.start();
  }

  // ── localStorage から復元
  state.favorites = loadFavorites();

  // ── セレクトボックスに選択肢を生成
  populateSelectOptions();

  // ── カテゴリタブ描画
  renderCategoryTabs();

  // ── プリセットグリッド描画
  renderPresetGrid(null);

  // ── タイマーチップ描画
  renderTimerChips();

  // ── ミキサー初期化
  initMixer();

  // ── カスタム初期化
  initCustom();

  // ── visibilitychange
  initVisibilityHandler();

  // ── ウィンドウリサイズ → Visualizer.resize()
  window.addEventListener('resize', () => {
    if (visualizer) visualizer.resize();
  });

  // ─────────────────────────────────────────────
  // イベント: カテゴリタブ（委譲）
  // [修正4] セレクタを .category-tab、dataset.categoryId に統一
  // ─────────────────────────────────────────────
  const categoryTabsEl = $('category-tabs');
  if (categoryTabsEl) {
    categoryTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-tab');
      if (!btn) return;
      const catId = btn.dataset.categoryId || null;
      state.currentCategoryId = catId || null;
      renderCategoryTabs();
      renderPresetGrid(state.currentCategoryId);
    });
  }

  // ─────────────────────────────────────────────
  // イベント: プリセットカード（委譲 / home-view）
  // ─────────────────────────────────────────────
  const homeView = $('home-view');
  if (homeView) {
    homeView.addEventListener('click', async (e) => {
      const card = e.target.closest('.preset-card[data-preset-id]');
      if (!card) return;
      const preset = getPresetById(card.dataset.presetId);
      if (!preset) return;
      await selectPreset(preset);
    });
  }

  // ─────────────────────────────────────────────
  // イベント: プリセットカード（委譲 / favorites-view）
  // ─────────────────────────────────────────────
  const favoritesView = $('favorites-view');
  if (favoritesView) {
    favoritesView.addEventListener('click', async (e) => {
      const card = e.target.closest('.preset-card[data-preset-id]');
      if (!card) return;
      const preset = getPresetById(card.dataset.presetId);
      if (!preset) return;
      await selectPreset(preset);
    });
  }

  // ─────────────────────────────────────────────
  // イベント: 再生/停止ボタン（#play-btn）
  // ─────────────────────────────────────────────
  const playBtn = $('play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      if (engine.isPlaying) {
        stopPlayback();
      } else {
        await startPlayback();
      }
    });
  }

  // ─────────────────────────────────────────────
  // イベント: 再生/停止ボタン（#play-btn-full）
  // [修正3] #play-btn-full にも同じトグルハンドラを付与
  // ─────────────────────────────────────────────
  const playBtnFull = $('play-btn-full');
  if (playBtnFull) {
    playBtnFull.addEventListener('click', async () => {
      if (engine.isPlaying) {
        stopPlayback();
      } else {
        await startPlayback();
      }
    });
  }

  // ─────────────────────────────────────────────
  // イベント: お気に入りボタン
  // ─────────────────────────────────────────────
  const favBtn = $('fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      if (!state.currentPreset) return;
      toggleFavorite(state.currentPreset.id);
      const isFav = state.favorites.includes(state.currentPreset.id);
      showToast(isFav ? 'お気に入りに追加しました' : 'お気に入りから削除しました');
    });
  }

  // ─────────────────────────────────────────────
  // イベント: タイマーチップ（委譲）
  // ─────────────────────────────────────────────
  const timerSelectEl = $('timer-select');
  if (timerSelectEl) {
    timerSelectEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.timer-chip[data-min]');
      if (!chip) return;
      const minutes = parseInt(chip.dataset.min, 10);
      applyTimer(minutes);
    });
  }

  // ─────────────────────────────────────────────
  // イベント: ボトムナビ（委譲）
  // ─────────────────────────────────────────────
  const nav = $('nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn[data-view]');
      if (!btn) return;
      switchView(btn.dataset.view);
    });
  }

  // ─────────────────────────────────────────────
  // 初期ビュー
  // ─────────────────────────────────────────────
  switchView('home');

  // プレイヤーは最初は hidden
  const player = $('player');
  if (player && !player.hasAttribute('data-state')) {
    player.setAttribute('data-state', 'hidden');
  }
});
