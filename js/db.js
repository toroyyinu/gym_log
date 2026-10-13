// IndexedDB の読み書き。画面からは必ずこのファイルの関数を通して使う。
// 構成はアーキテクチャ設計書「5.1 IndexedDB の構成」のとおり。

import { lastPerformed } from './domain.js';

const DB_NAME = 'gym_log';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('exercises')) {
        const store = db.createObjectStore('exercises', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: true });
      }
      if (!db.objectStoreNames.contains('muscles')) {
        const store = db.createObjectStore('muscles', { keyPath: 'id' });
        store.createIndex('group', 'group');
      }
      if (!db.objectStoreNames.contains('records')) {
        const store = db.createObjectStore('records', { keyPath: 'id' });
        store.createIndex('exerciseId', 'exerciseId');
        store.createIndex('performedAt', 'performedAt');
        store.createIndex('exerciseId_performedAt', ['exerciseId', 'performedAt']);
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // 新しい版のアプリが DB_VERSION を上げようとしたら、こちらは閉じて移行を止めないようにする
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

const result = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function read(storeName, fn) {
  const db = await open();
  return result(fn(db.transaction(storeName).objectStore(storeName)));
}

// 書き込みは、トランザクションが確定してから完了とする
async function write(storeNames, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    fn(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------- 種目 ----------

export const listExercises = () => read('exercises', (s) => s.getAll());
export const getExercise = (id) => read('exercises', (s) => s.get(id));
// 同じ名前の種目があると ConstraintError で失敗する
export const saveExercise = (exercise) => write(['exercises'], (tx) => tx.objectStore('exercises').put(exercise));
export const deleteExercise = (id) => write(['exercises'], (tx) => tx.objectStore('exercises').delete(id));

// 有酸素マシンを1回だけ登録する（同じ名前の種目がすでにあれば、その分は登録しない）
export async function seedExercises(list) {
  if (await getMeta('cardioSeeded')) return;
  const names = new Set((await listExercises()).map((e) => e.name));
  await write(['exercises', 'meta'], (tx) => {
    list.filter((e) => !names.has(e.name)).forEach((e) => tx.objectStore('exercises').put(e));
    tx.objectStore('meta').put({ key: 'cardioSeeded', value: true });
  });
}

// ---------- 筋肉 ----------

// 初期値は筋肉リストの順、追加したものはその後ろ（追加した順）
export const listMuscles = async () => (await read('muscles', (s) => s.getAll())).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const saveMuscle = (muscle) => write(['muscles'], (tx) => tx.objectStore('muscles').put(muscle));

// 筋肉が1つもなければ初期値を入れる
export async function seedMuscles(muscles) {
  const count = await read('muscles', (s) => s.count());
  if (count > 0) return;
  await write(['muscles'], (tx) => muscles.forEach((m) => tx.objectStore('muscles').put(m)));
}

// ---------- 記録 ----------

export const listRecords = () => read('records', (s) => s.getAll());
// 種目ごとの最後に記録した日時（種目一覧の並び替えに使う）
export const lastPerformedMap = async () => lastPerformed(await listRecords());
export const saveRecord = (record) => write(['records'], (tx) => tx.objectStore('records').put(record));
export const deleteRecord = (id) => write(['records'], (tx) => tx.objectStore('records').delete(id));

// 1つの種目の記録を、日時の古い順に返す
export function recordsOfExercise(exerciseId) {
  const range = IDBKeyRange.bound([exerciseId, ''], [exerciseId, '￿']);
  return read('records', (s) => s.index('exerciseId_performedAt').getAll(range));
}

export async function countRecords() {
  return read('records', (s) => s.count());
}

// 一番古い記録の日時（記録がなければ null）
export async function firstRecordAt() {
  const cursor = await read('records', (s) => s.index('performedAt').openCursor());
  return cursor?.value.performedAt ?? null;
}

// ---------- 設定値 ----------

export async function getMeta(key) {
  const row = await read('meta', (s) => s.get(key));
  return row?.value ?? null;
}

export const setMeta = (key, value) => write(['meta'], (tx) => tx.objectStore('meta').put({ key, value }));

// ---------- まとめて読み書き ----------

export async function exportAll() {
  const [exercises, muscles, records] = await Promise.all([listExercises(), listMuscles(), listRecords()]);
  return { exercises, muscles, records };
}

// 種目・筋肉・記録をすべて置き換える（バックアップからの復元）。
// 設定値は、データに結びついたものだけ直す（アーキテクチャ設計書「設定値（meta）」）
export function replaceAll({ exercises, muscles, records }, restoredAt) {
  const names = ['exercises', 'muscles', 'records'];
  return write([...names, 'meta'], (tx) => {
    names.forEach((n) => tx.objectStore(n).clear());
    exercises.forEach((e) => tx.objectStore('exercises').put(e));
    muscles.forEach((m) => tx.objectStore('muscles').put(m));
    records.forEach((r) => tx.objectStore('records').put(r));
    const meta = tx.objectStore('meta');
    meta.delete('lastExerciseId'); // 復元したデータにない種目を指しているかもしれない
    meta.delete('cardioSeeded'); // 有酸素マシンを追加する前のバックアップなら、もう一度登録する
    meta.put({ key: 'lastBackupAt', value: restoredAt }); // 今のデータは、読み込んだファイルと同じ内容
  });
}
