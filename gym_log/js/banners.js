// 画面上部の案内（バックアップ、ホーム画面への追加、アプリの更新）。表示内容は index.html にある。

import * as db from './db.js';
import { isBackupDue } from './domain.js';
import { isStandalone } from './pwa.js';
import { ref } from './ui.js';

export function initBanners() {
  const install = ref(document, 'banner-install');
  ref(install, 'install-dismiss').addEventListener('click', async () => {
    install.hidden = true;
    await db.setMeta('installHintDismissed', true);
  });
}

export async function refreshBanners() {
  const [lastBackupAt, firstRecordAt, dismissed] = await Promise.all([
    db.getMeta('lastBackupAt'),
    db.firstRecordAt(),
    db.getMeta('installHintDismissed'),
  ]);
  ref(document, 'banner-backup').hidden = !isBackupDue(lastBackupAt, firstRecordAt);
  ref(document, 'backup-message').textContent = lastBackupAt
    ? '最後のバックアップから7日以上経っています。'
    : 'まだバックアップしていません。記録が端末にしかないので、書き出しておきましょう。';
  ref(document, 'banner-install').hidden = isStandalone() || dismissed === true;
}

export function showUpdateBanner(onUpdate) {
  const banner = ref(document, 'banner-update');
  banner.hidden = false;
  ref(banner, 'update-button').addEventListener('click', onUpdate, { once: true });
}
