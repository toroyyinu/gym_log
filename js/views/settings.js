// S-6 設定画面（表示は views/settings.html）

import { refreshBanners } from '../banners.js';
import * as db from '../db.js';
import {
  APP_VERSION, GROUPS, exerciseGroups, formatDateTime, sortExercises, toLocalISO,
} from '../domain.js';
import { buildBackup, fileStamp, parseBackup, recordsToCSV, saveFile } from '../io.js';
import { isStandalone, persistenceStatus } from '../pwa.js';
import { CARDIO_EXERCISES } from '../seed.js';
import { busy, field, fill, ref, toast, tpl } from '../ui.js';

export async function init(root) {
  ref(root, 'version').textContent = `v${APP_VERSION}`;
  ref(root, 'export-backup').addEventListener('click', (event) => busy(event.currentTarget, () => exportBackup(root)));
  ref(root, 'export-csv').addEventListener('click', (event) => busy(event.currentTarget, exportCSV));
  ref(root, 'restore-file').addEventListener('change', (event) => restore(root, event.currentTarget));

  await render(root);
}

async function render(root) {
  const [exercises, muscles, recordCount, lastBackupAt, persisted, lastUsed] = await Promise.all([
    db.listExercises(),
    db.listMuscles(),
    db.countRecords(),
    db.getMeta('lastBackupAt'),
    persistenceStatus(),
    db.lastPerformedMap(),
  ]);
  const muscleMap = new Map(muscles.map((m) => [m.id, m]));

  // 種目（非表示のものも出す）
  ref(root, 'exercise-list').replaceChildren(
    ...sortExercises(exercises, lastUsed).map((e) => {
      const item = fill(tpl('exercise-link'), {
        name: e.name,
        sub: exerciseGroups(e, muscleMap).join(' ・ '),
      });
      item.querySelector('a').href = `#/exercise/${e.id}`;
      field(item, 'hidden').hidden = !e.hidden;
      return item;
    }),
  );
  ref(root, 'no-exercise').hidden = exercises.length > 0;

  // 筋肉（どの種目にも使われていなければ削除できる。削除しても消さずに隠すだけなので、後から戻せる）
  const used = new Set(exercises.flatMap((e) => e.muscleIds));
  ref(root, 'muscle-groups').replaceChildren(
    ...GROUPS.map((group) => {
      const block = fill(tpl('muscle-group'), { group });
      field(block, 'muscles').append(
        ...muscles
          .filter((m) => m.group === group && !m.hidden)
          .map((m) => {
            const item = fill(tpl('muscle-item'), { name: m.name });
            field(item, 'used').hidden = !used.has(m.id);
            const button = field(item, 'delete');
            button.hidden = used.has(m.id);
            button.addEventListener('click', async () => {
              await db.saveMuscle({ ...m, hidden: true });
              toast(`「${m.name}」を削除しました（下の「削除した筋肉」から戻せます）`);
              await render(root);
            });
            return item;
          }),
      );
      return block;
    }),
  );

  const deleted = muscles.filter((m) => m.hidden);
  ref(root, 'deleted-block').hidden = deleted.length === 0;
  ref(root, 'deleted-muscles').replaceChildren(
    ...deleted.map((m) => {
      const item = fill(tpl('deleted-muscle'), { name: m.name, group: m.group });
      field(item, 'restore').addEventListener('click', async () => {
        await db.saveMuscle({ ...m, hidden: false });
        toast(`「${m.name}」を戻しました`);
        await render(root);
      });
      return item;
    }),
  );

  // データの状態
  ref(root, 'last-backup').textContent = lastBackupAt ? formatDateTime(lastBackupAt) : 'まだありません';
  ref(root, 'record-count').textContent = `${recordCount}件`;
  ref(root, 'persist').textContent = { true: '許可されています', false: '許可されていません' }[persisted] ?? '確認できません';
  ref(root, 'launch').textContent = isStandalone() ? 'ホーム画面から起動中' : 'ブラウザで開いています';
}

async function exportBackup(root) {
  const backup = buildBackup(await db.exportAll());
  const saved = await saveFile(`gym_log_backup_${fileStamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  if (!saved) return;
  await db.setMeta('lastBackupAt', toLocalISO(new Date()));
  toast('バックアップを書き出しました');
  await render(root);
  await refreshBanners();
}

async function exportCSV() {
  const { exercises, muscles, records } = await db.exportAll();
  await saveFile(`gym_log_records_${fileStamp()}.csv`, recordsToCSV(records, exercises, muscles), 'text/csv');
}

async function restore(root, input) {
  const file = input.files[0];
  input.value = ''; // 同じファイルをもう一度選んでも反応するように
  if (!file) return;
  try {
    const data = parseBackup(await file.text());
    const ok = confirm(
      `種目${data.exercises.length}件・記録${data.records.length}件を読み込みます。\n今のデータはすべて消えて置き換わります。\n（今のデータを残したいときは、キャンセルして先に「バックアップを書き出す」をしてください）\nよろしいですか？`,
    );
    if (!ok) return;
    await db.replaceAll(data, toLocalISO(new Date()));
    await db.seedExercises(CARDIO_EXERCISES);
    toast('復元しました');
    await render(root);
    await refreshBanners();
  } catch (error) {
    alert(`復元できませんでした。\n${error.message}`);
  }
}
