/**
 * presets.js — Hibiki（響） プリセット/カテゴリ/科学テキストのデータ
 * [W2] 担当ファイル。このファイル以外は触らない。
 * DESIGN.md §3 の契約スキーマに厳密に準拠。
 */

// ──────────────────────────────────────────────
// 脳波帯域メタ
// ──────────────────────────────────────────────
export const BANDS = {
  delta:     { name: 'デルタ波',    range: '0.5–4 Hz',    use: '深い睡眠',       color: '#5b6ee1' },
  theta:     { name: 'シータ波',    range: '4–8 Hz',      use: '瞑想・入眠',     color: '#7b5be1' },
  alpha:     { name: 'アルファ波',  range: '8–14 Hz',     use: 'リラックス集中', color: '#5be1c4' },
  beta:      { name: 'ベータ波',    range: '14–30 Hz',    use: '覚醒・集中',     color: '#e1b15b' },
  gamma:     { name: 'ガンマ波',    range: '30–100 Hz',   use: '高度認知',       color: '#e15b7b' },
  solfeggio: { name: 'ソルフェジオ', range: '396–963 Hz', use: '調律・癒し',     color: '#e1c95b' },
};

// ──────────────────────────────────────────────
// カテゴリ（ホームのタブ／セクション）
// ──────────────────────────────────────────────
export const CATEGORIES = [
  {
    id: 'sleep',
    name: '深い睡眠',
    emoji: '🌙',
    tagline: '意識がほどけ、波のように眠りへ沈む。',
    accent: '#5b6ee1',
  },
  {
    id: 'relax',
    name: 'リラックス',
    emoji: '🌊',
    tagline: '呼吸とともに、力みが溶けていく。',
    accent: '#5be1c4',
  },
  {
    id: 'focus',
    name: '集中',
    emoji: '🎯',
    tagline: '雑念を静め、ただ今この瞬間に入る。',
    accent: '#e1b15b',
  },
  {
    id: 'meditate',
    name: '瞑想',
    emoji: '🧘',
    tagline: '内側の静寂が、静かに広がっていく。',
    accent: '#7b5be1',
  },
  {
    id: 'anxiety',
    name: '不安解放',
    emoji: '🍃',
    tagline: '緊張を手放し、安心が根を張る。',
    accent: '#7be15b',
  },
  {
    id: 'tinnitus',
    name: '耳鳴り緩和',
    emoji: '🔔',
    tagline: '音に音を重ねて、静けさを取り戻す。',
    accent: '#9b9bb0',
  },
  {
    id: 'balance',
    name: '内なるバランス',
    emoji: '☯️',
    tagline: '周波数が共鳴し、全体が整っていく。',
    accent: '#e1c95b',
  },
];

// ──────────────────────────────────────────────
// ノイズのメタ（UI表示用）
// ──────────────────────────────────────────────
export const NOISES = [
  { id: 'white', name: 'ホワイトノイズ', desc: '全帯域。集中・耳鳴りマスキング' },
  { id: 'pink',  name: 'ピンクノイズ',   desc: '自然でやわらか。睡眠向き' },
  { id: 'brown', name: 'ブラウンノイズ', desc: '低音リッチ。深いリラックス' },
];

// ──────────────────────────────────────────────
// 環境音のメタ（UI表示用）
// ──────────────────────────────────────────────
export const AMBIENCES = [
  { id: 'rain',   name: '雨',   emoji: '🌧️' },
  { id: 'waves',  name: '波',   emoji: '🌊' },
  { id: 'forest', name: '森',   emoji: '🌲' },
  { id: 'night',  name: '夜',   emoji: '🌌' },
  { id: 'sakura', name: '桜',   emoji: '🌸' },
];

// ──────────────────────────────────────────────
// プリセット（18個・全7カテゴリをカバー）
// ──────────────────────────────────────────────
export const PRESETS = [

  // ────────────────────────────────────────────
  // sleep（3プリセット）
  // ────────────────────────────────────────────
  {
    id: 'deep-sleep-delta',
    categoryId: 'sleep',
    name: '深い眠りへ',
    method: 'binaural',
    carrierHz: 100,
    beatHz: 2.5,
    waveform: 'sine',
    band: 'delta',
    ambience: 'rain',
    noise: 'brown',
    toneVolume: 0.50,
    noiseVolume: 0.25,
    ambienceVolume: 0.40,
    headphones: true,
    duration: 45,
    science: 'デルタ波（0.5–4 Hz）は深いノンレム睡眠（ステージ3–4）に多く見られる脳波で、成長ホルモンの分泌や身体の回復プロセスと関連があるとされています。2.5 Hzのバイノーラルビートを聴くことで、この帯域の脳波活動をサポートする可能性があると言われています。ブラウンノイズと雨音は外部の雑音をマスキングし、眠りやすい音環境づくりをサポートします。',
  },
  {
    id: 'sleep-theta-entry',
    categoryId: 'sleep',
    name: '入眠のまどろみ',
    method: 'binaural',
    carrierHz: 120,
    beatHz: 6.0,
    waveform: 'sine',
    band: 'theta',
    ambience: 'waves',
    noise: 'pink',
    toneVolume: 0.45,
    noiseVolume: 0.20,
    ambienceVolume: 0.45,
    headphones: true,
    duration: 30,
    science: 'シータ波（4–8 Hz）は覚醒と睡眠の境界域にあたる脳波で、入眠直前のまどろみ状態に多く現れます。6 Hzのビートは意識がゆっくりとほどける感覚をサポートするとされています。穏やかな波音とピンクノイズが心拍数をゆるやかに落ち着かせる音環境を整えます。',
  },
  {
    id: 'sleep-isochronic-delta',
    categoryId: 'sleep',
    name: '静寂の深淵',
    method: 'isochronic',
    carrierHz: 130,
    beatHz: 1.5,
    waveform: 'sine',
    band: 'delta',
    ambience: 'night',
    noise: 'brown',
    toneVolume: 0.40,
    noiseVolume: 0.20,
    ambienceVolume: 0.35,
    headphones: false,
    duration: 60,
    science: 'アイソクロニックトーンはヘッドホン不要で脳波誘導をサポートできる手法として研究されています。1.5 Hzのデルタ帯域は最も深い睡眠ステージと関連する周波数帯域です。夜の虫の音を模した環境音が、自然な睡眠リズムへの移行をゆっくりとサポートします。',
  },

  // ────────────────────────────────────────────
  // relax（3プリセット）
  // ────────────────────────────────────────────
  {
    id: 'relax-alpha-flow',
    categoryId: 'relax',
    name: 'アルファ波の流れ',
    method: 'binaural',
    carrierHz: 110,
    beatHz: 10.0,
    waveform: 'sine',
    band: 'alpha',
    ambience: 'waves',
    noise: null,
    toneVolume: 0.50,
    noiseVolume: 0.00,
    ambienceVolume: 0.50,
    headphones: true,
    duration: 20,
    science: 'アルファ波（8–14 Hz）は目を閉じてリラックスしているときや、穏やかな集中状態に現れる脳波です。10 Hzのバイノーラルビートはこの帯域の活動をサポートし、ストレス解消とリラックスを促すとされています。波音との組み合わせが、副交感神経の働きをサポートする音環境を作ります。',
  },
  {
    id: 'relax-forest-alpha',
    categoryId: 'relax',
    name: '森のやすらぎ',
    method: 'isochronic',
    carrierHz: 140,
    beatHz: 8.0,
    waveform: 'sine',
    band: 'alpha',
    ambience: 'forest',
    noise: 'pink',
    toneVolume: 0.35,
    noiseVolume: 0.15,
    ambienceVolume: 0.55,
    headphones: false,
    duration: 25,
    science: '8 Hzはアルファ波の下限にあたり、リラックスと内なる静けさをサポートする周波数帯域です。森の環境音は自律神経のバランスを整え、コルチゾール（ストレスホルモン）レベルの低下をサポートする可能性があると報告されています。ピンクノイズは1/fゆらぎを持ち、自然界の音に近い心地よさがあると言われています。',
  },
  {
    id: 'relax-sakura-alpha',
    categoryId: 'relax',
    name: '桜風に揺れて',
    method: 'binaural',
    carrierHz: 95,
    beatHz: 9.0,
    waveform: 'sine',
    band: 'alpha',
    ambience: 'sakura',
    noise: null,
    toneVolume: 0.40,
    noiseVolume: 0.00,
    ambienceVolume: 0.55,
    headphones: true,
    duration: 20,
    science: '9 Hzのアルファ波領域は、穏やかな覚醒状態とリラックスが共存する心地よいゾーンとされています。桜風をイメージしたゆったりとした音の揺らぎは、呼吸をゆっくり整える効果をサポートすると言われています。バイノーラルビートとアンビエントサウンドの重ね合わせが、深いくつろぎをサポートします。',
  },

  // ────────────────────────────────────────────
  // focus（3プリセット）
  // ────────────────────────────────────────────
  {
    id: 'focus-beta-work',
    categoryId: 'focus',
    name: '深い集中モード',
    method: 'binaural',
    carrierHz: 200,
    beatHz: 18.0,
    waveform: 'sine',
    band: 'beta',
    ambience: null,
    noise: 'white',
    toneVolume: 0.45,
    noiseVolume: 0.30,
    ambienceVolume: 0.00,
    headphones: true,
    duration: 30,
    science: 'ベータ波（14–30 Hz）は覚醒・集中・論理的思考と関連する脳波です。18 Hzのバイノーラルビートは、タスクへの集中力をサポートするとされています。ホワイトノイズは周囲の環境音をマスキングし、一定の作業効率をサポートすることが複数の研究で示唆されています。',
  },
  {
    id: 'focus-gamma-insight',
    categoryId: 'focus',
    name: 'ガンマ閃き',
    method: 'binaural',
    carrierHz: 200,
    beatHz: 40.0,
    waveform: 'sine',
    band: 'gamma',
    ambience: null,
    noise: 'pink',
    toneVolume: 0.40,
    noiseVolume: 0.25,
    ambienceVolume: 0.00,
    headphones: true,
    duration: 20,
    science: 'ガンマ波（30–100 Hz）、特に40 Hzは記憶の統合や高度な認知処理と関連があるとされています。40 Hzのガンマ振動はアルツハイマー研究においても注目されており、認知機能の維持をサポートする可能性が示唆されています。クリエイティブな思考や洞察力を必要とする作業のサポートに活用されることがあります。',
  },
  {
    id: 'focus-beta-flow',
    categoryId: 'focus',
    name: 'フロー状態',
    method: 'isochronic',
    carrierHz: 180,
    beatHz: 16.0,
    waveform: 'sine',
    band: 'beta',
    ambience: 'forest',
    noise: null,
    toneVolume: 0.40,
    noiseVolume: 0.00,
    ambienceVolume: 0.30,
    headphones: false,
    duration: 45,
    science: '16 Hzはベータ波帯域の中でも覚醒感と集中力のバランスが良い周波数帯域とされています。フロー状態（作業に完全に没入した状態）では、ベータ波とアルファ波が適切に組み合わさるとされており、この周波数がそのサポートをすると言われています。森の穏やかな環境音が、長時間集中時の精神的疲労を和らげるサポートをします。',
  },

  // ────────────────────────────────────────────
  // meditate（2プリセット）
  // ────────────────────────────────────────────
  {
    id: 'meditate-theta-deep',
    categoryId: 'meditate',
    name: '深い瞑想',
    method: 'binaural',
    carrierHz: 110,
    beatHz: 6.0,
    waveform: 'sine',
    band: 'theta',
    ambience: null,
    noise: null,
    toneVolume: 0.55,
    noiseVolume: 0.00,
    ambienceVolume: 0.00,
    headphones: true,
    duration: 20,
    science: 'シータ波（4–8 Hz）は深い瞑想状態や創造的なインスピレーション、そして半睡眠状態に多く現れる脳波です。6 Hzのシータビートは、経験豊富な瞑想者が報告する「深い内省状態」に近い脳波パターンをサポートするとされています。純粋なバイノーラルトーンのみを使用することで、意識の深みへと集中しやすい環境をサポートします。',
  },
  {
    id: 'meditate-theta-journey',
    categoryId: 'meditate',
    name: '内なる旅',
    method: 'binaural',
    carrierHz: 90,
    beatHz: 5.5,
    waveform: 'sine',
    band: 'theta',
    ambience: 'sakura',
    noise: null,
    toneVolume: 0.50,
    noiseVolume: 0.00,
    ambienceVolume: 0.30,
    headphones: true,
    duration: 30,
    science: '5.5 Hzのシータ波は、マインドフルネス瞑想や意識拡張の実践においてしばしば見られる周波数です。シータ状態では記憶や感情との繋がりが深まり、内省や自己探求をサポートするとされています。静かな桜風のアンビエントサウンドが、心を落ち着かせ、瞑想への集中をサポートします。',
  },

  // ────────────────────────────────────────────
  // anxiety（2プリセット）
  // ────────────────────────────────────────────
  {
    id: 'anxiety-alpha-solfeggio396',
    categoryId: 'anxiety',
    name: '恐れを手放す 396 Hz',
    method: 'solfeggio',
    carrierHz: 396,
    beatHz: null,
    waveform: 'sine',
    band: 'solfeggio',
    ambience: 'forest',
    noise: null,
    toneVolume: 0.50,
    noiseVolume: 0.00,
    ambienceVolume: 0.45,
    headphones: false,
    duration: 15,
    science: '396 Hzはソルフェジオ周波数のひとつで、「恐れや罪悪感を手放す」周波数として古くから音楽の伝統の中で用いられてきました。直接的な医学的効能を示す科学的根拠は現時点では限られていますが、この周波数の純音が心身のリラックスをサポートする可能性があると言われています。森の環境音と組み合わせることで、穏やかな気持ちへの移行をサポートします。',
  },
  {
    id: 'anxiety-alpha-calming',
    categoryId: 'anxiety',
    name: '穏やかな繋がり 639 Hz',
    method: 'solfeggio',
    carrierHz: 639,
    beatHz: null,
    waveform: 'sine',
    band: 'solfeggio',
    ambience: 'waves',
    noise: null,
    toneVolume: 0.45,
    noiseVolume: 0.00,
    ambienceVolume: 0.50,
    headphones: false,
    duration: 15,
    science: '639 Hzはソルフェジオ周波数の中で「人間関係の調和・繋がり」を意図して用いられる周波数です。不安な状態では交感神経が優位になりがちですが、心地よい音楽や特定の周波数は副交感神経の働きをサポートすることが示唆されています。波音との組み合わせが、緊張をゆるめ安心感をサポートします。',
  },

  // ────────────────────────────────────────────
  // tinnitus（2プリセット）
  // ────────────────────────────────────────────
  {
    id: 'tinnitus-white-masking',
    categoryId: 'tinnitus',
    name: '耳鳴りマスキング（白）',
    method: 'isochronic',
    carrierHz: 150,
    beatHz: 10.0,
    waveform: 'sine',
    band: 'alpha',
    ambience: null,
    noise: 'white',
    toneVolume: 0.30,
    noiseVolume: 0.55,
    ambienceVolume: 0.00,
    headphones: false,
    duration: 45,
    science: 'ホワイトノイズは全周波数帯域の音を均一に含み、耳鳴りの音をマスキングする用途で広く用いられています。耳鳴り（ティニタス）のマスキング療法では、不快な耳鳴り音を背景音でかき消すことで苦痛を緩和するサポートをします。音響療法としてのホワイトノイズの使用は聴覚専門機関でも紹介されており、日常生活の質改善をサポートする手段のひとつです。',
  },
  {
    id: 'tinnitus-pink-soothe',
    categoryId: 'tinnitus',
    name: '耳鳴り緩和（桃色の静寂）',
    method: 'isochronic',
    carrierHz: 150,
    beatHz: 8.0,
    waveform: 'sine',
    band: 'alpha',
    ambience: 'rain',
    noise: 'pink',
    toneVolume: 0.25,
    noiseVolume: 0.50,
    ambienceVolume: 0.35,
    headphones: false,
    duration: 30,
    science: 'ピンクノイズは低周波ほどエネルギーが高い1/fゆらぎを持ち、自然界の音に近い心地よさがあるとされています。ホワイトノイズより高音が抑えられているため、耳への刺激が穏やかで長時間の使用に向いていると言われています。雨音と組み合わせることで、耳鳴りへの注意を自然にそらし、リラックスをサポートする音環境を整えます。',
  },

  // ────────────────────────────────────────────
  // balance（3プリセット）
  // ────────────────────────────────────────────
  {
    id: 'balance-solfeggio528',
    categoryId: 'balance',
    name: 'DNA修復と愛 528 Hz',
    method: 'solfeggio',
    carrierHz: 528,
    beatHz: null,
    waveform: 'sine',
    band: 'solfeggio',
    ambience: 'sakura',
    noise: null,
    toneVolume: 0.55,
    noiseVolume: 0.00,
    ambienceVolume: 0.35,
    headphones: false,
    duration: 20,
    science: '528 Hzは「ラブ周波数」や「奇跡の音」として知られるソルフェジオ周波数のひとつです。現時点では「DNA修復」に関する直接的な科学的根拠は限られていますが、この周波数が細胞レベルのリラクゼーションや内なる調和感をサポートする可能性があると言われています。心地よい純音として穏やかな気持ちの整えをサポートするために活用されています。',
  },
  {
    id: 'balance-solfeggio432',
    categoryId: 'balance',
    name: '自然の律動 432 Hz',
    method: 'solfeggio',
    carrierHz: 432,
    beatHz: null,
    waveform: 'sine',
    band: 'solfeggio',
    ambience: 'forest',
    noise: null,
    toneVolume: 0.55,
    noiseVolume: 0.00,
    ambienceVolume: 0.40,
    headphones: false,
    duration: 20,
    science: '432 Hzは標準ピッチ（440 Hz）より低く、自然界の振動と調和するとされる周波数として音楽家や瞑想実践者の間で長く用いられてきました。一部の研究では440 Hzより穏やかに聴こえると感じる人が多いとも報告されており、心身のバランスをサポートする音として活用されています。森の環境音と重ねることで、より深い調和感をサポートします。',
  },
  {
    id: 'balance-binaural-schumann',
    categoryId: 'balance',
    name: '地球の共鳴（シューマン共振）',
    method: 'binaural',
    carrierHz: 100,
    beatHz: 7.83,
    waveform: 'sine',
    band: 'theta',
    ambience: 'night',
    noise: null,
    toneVolume: 0.50,
    noiseVolume: 0.00,
    ambienceVolume: 0.40,
    headphones: true,
    duration: 25,
    science: 'シューマン共振（約7.83 Hz）は地球の電離層と地表の間で発生する自然の電磁共振周波数です。この周波数が人体のシータ波と近い帯域にあり、人間の生体リズムとの関連が研究されています。地球の固有振動数に近い周波数を聴くことで、自然とのつながりや全体的なバランス感をサポートするとされています。',
  },
];

// ──────────────────────────────────────────────
// ヘルパ関数
// ──────────────────────────────────────────────

/**
 * IDでプリセットを取得する。
 * @param {string} id - プリセットのID（kebab-case）
 * @returns {object|undefined} 一致するプリセットオブジェクト、見つからない場合はundefined
 */
export function getPresetById(id) {
  return PRESETS.find((p) => p.id === id);
}

/**
 * カテゴリIDに属するプリセット一覧を取得する。
 * @param {string} categoryId - カテゴリのID
 * @returns {object[]} 一致するプリセットオブジェクトの配列（空配列の可能性あり）
 */
export function getPresetsByCategory(categoryId) {
  return PRESETS.filter((p) => p.categoryId === categoryId);
}
