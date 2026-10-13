// ホーム画面アプリ（PWA）まわり：Service Worker の登録、データの永続化、起動方法の判定。

export function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

// データを消されにくくするよう、ブラウザに永続化を求める（Safari は確認画面を出さずに自動で判断する）
export async function requestPersistence() {
  if (!navigator.storage?.persist) return;
  if (await navigator.storage.persisted()) return;
  await navigator.storage.persist();
}

// true / false / null（確認できない）
export async function persistenceStatus() {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

// 開発中（localhost）は、古いファイルがキャッシュから出てこないよう登録しない。
// localhost でも試したいときは、URL に ?sw をつけて開く。
export function registerServiceWorker(onUpdateAvailable) {
  if (!('serviceWorker' in navigator)) return;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal && !new URLSearchParams(location.search).has('sw')) return;

  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((registration) => {
    const offerUpdate = () =>
      onUpdateAvailable(() => {
        updating = true;
        registration.waiting?.postMessage('skipWaiting');
      });

    // 初回のインストールでは controller がないので、更新の案内は出さない
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
      });
    });
  });
}
