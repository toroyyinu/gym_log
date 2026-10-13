// Service Worker：アプリ本体のファイルをキャッシュして、オフラインでも起動できるようにする。
// 公開の手順はアーキテクチャ設計書「9.1 公開・更新の手順」。ファイルを変えたら VERSION を上げ、増やしたら ASSETS にも足す。

const VERSION = 'v2';
const CACHE = `gym_log-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/banners.js',
  'js/chart.js',
  'js/db.js',
  'js/domain.js',
  'js/io.js',
  'js/pwa.js',
  'js/record-editor.js',
  'js/seed.js',
  'js/ui.js',
  'js/views/exercise-edit.js',
  'js/views/graph.js',
  'js/views/history.js',
  'js/views/record.js',
  'js/views/settings.js',
  'views/exercise-edit.html',
  'views/graph.html',
  'views/history.html',
  'views/record.html',
  'views/settings.html',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
];

self.addEventListener('install', (event) => {
  // ブラウザの HTTP キャッシュに残った古いファイルを入れないよう、サーバーから取り直す
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gym_log-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面の「更新する」ボタンから呼ばれる
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// キャッシュにあればそれを使い、なければネットワークから取る
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request)));
});
