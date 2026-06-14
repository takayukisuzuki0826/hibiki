/**
 * Hibiki（響）Service Worker
 * app-shell を cache-first でプリキャッシュ。
 * ナビゲーション（html）はネット優先 → キャッシュ fallback。
 * CACHE_VERSION を上げると旧キャッシュを破棄して再取得。
 */

const CACHE_VERSION = 'hibiki-v4';

/** プリキャッシュするアセット一覧 */
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/audio-engine.js',
  './js/presets.js',
  './js/visualizer.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon-180.png',
];

// ----- install: プリキャッシュ -----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // 個別に addAll — 1つ失敗してもサービスワーカー自体を壊さない
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] プリキャッシュ失敗: ${url}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ----- activate: 旧キャッシュ削除 -----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => {
            console.warn(`[SW] 旧キャッシュ削除: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ----- fetch: ストラテジー振り分け -----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // chrome-extension などは無視
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // ナビゲーション（HTML）: ネット優先 → キャッシュ fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // 同一オリジンのアセット: キャッシュ優先 → ネット → キャッシュなければ 404
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetworkFallback(request));
    return;
  }

  // 外部オリジン（CDN 等）: そのままフェッチ（失敗は呼び出し元に任せる）
});

/**
 * ネット優先 → キャッシュ fallback
 * ナビゲーションリクエスト向け。
 */
async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // 完全オフラインかつキャッシュなし → index.html を返す（SPA fallback）
    const indexFallback = await caches.match('./index.html');
    return indexFallback || new Response('Hibiki はオフラインです。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * キャッシュ優先 → ネット fallback
 * CSS / JS / アイコン等の静的アセット向け。
 */
async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn(`[SW] フェッチ失敗: ${request.url}`, err);
    return new Response('', { status: 503 });
  }
}
