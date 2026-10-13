// S-4 記録編集シート。記録画面・履歴画面・グラフ画面から共通で使う。表示内容は index.html にある。

import * as db from './db.js';
import {
  CARDIO_FIELDS, KIND_FIELDS, fromInputDateTime, kindOf, parseNumber, sortExercises, toInputDateTime, validateRecord,
} from './domain.js';
import { busy, difficultyPicker, fill, fillExerciseSelect, ref, toast, tpl } from './ui.js';

let dialog;
let picker;
let current = null;
let kind = 'strength';
let cardioInputs = new Map(); // 有酸素の項目名 → 入力欄
let onDone = null;

export function initRecordEditor() {
  dialog = ref(document, 'record-editor');
  picker = difficultyPicker(ref(dialog, 'editor-difficulty'), () => {}, ref(dialog, 'editor-difficulty-hint'));

  ref(dialog, 'editor-close').addEventListener('click', () => dialog.close());
  // シートの外側（背景）を押したら閉じる
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  const form = ref(dialog, 'editor-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(form.querySelector('[type="submit"]'), save);
  });
  ref(dialog, 'editor-delete').addEventListener('click', remove);
}

export async function openRecordEditor(record, done) {
  current = record;
  onDone = done;
  const all = await db.listExercises();
  kind = kindOf(all.find((e) => e.id === record.exerciseId));
  // 記録する項目が同じ種類の種目にだけ付け替えられる
  const exercises = sortExercises(all, await db.lastPerformedMap())
    .filter((e) => kindOf(e) === kind && (!e.hidden || e.id === record.exerciseId));
  fillExerciseSelect(ref(dialog, 'editor-exercise'), exercises, record.exerciseId);
  ref(dialog, 'editor-datetime').value = toInputDateTime(record.performedAt);

  ref(dialog, 'editor-strength').hidden = kind !== 'strength';
  ref(dialog, 'editor-weight').value = record.weightKg ?? '';
  ref(dialog, 'editor-reps').value = record.reps ?? '';
  cardioInputs = new Map();
  ref(dialog, 'editor-cardio').replaceChildren(
    ...(kind === 'strength' ? [] : KIND_FIELDS[kind]).map((key) => {
      const f = CARDIO_FIELDS[key];
      const item = fill(tpl('editor-cardio-field'), { label: f.unit ? `${f.label}（${f.unit}）` : f.label });
      const input = item.querySelector('input');
      input.value = record[key] ?? '';
      cardioInputs.set(key, input);
      return item;
    }),
  );
  ref(dialog, 'editor-note').value = record.note;
  ref(dialog, 'editor-error').textContent = '';
  picker.kind = kind;
  picker.value = record.difficulty;
  dialog.showModal();
}

async function save() {
  // 日時を変えていなければ元の値（秒まで）を残す。入力欄は分までなので、変えると同じ分の記録の順番が変わりうる
  const input = ref(dialog, 'editor-datetime').value;
  const performedAt = input === toInputDateTime(current.performedAt) ? current.performedAt : fromInputDateTime(input);
  const updated = {
    ...current,
    exerciseId: ref(dialog, 'editor-exercise').value,
    performedAt,
    ...(kind === 'strength'
      ? { weightKg: parseNumber(ref(dialog, 'editor-weight').value), reps: parseNumber(ref(dialog, 'editor-reps').value) }
      : Object.fromEntries([...cardioInputs].map(([key, input]) => [key, parseNumber(input.value)]))),
    difficulty: picker.value,
    note: ref(dialog, 'editor-note').value.trim(),
  };
  const message = performedAt ? validateRecord(updated, kind) : '日時を入力してください';
  ref(dialog, 'editor-error').textContent = message;
  if (message) return;
  await db.saveRecord(updated);
  dialog.close();
  toast('修正しました');
  onDone?.();
}

async function remove() {
  if (!confirm('この記録を削除しますか？')) return;
  await db.deleteRecord(current.id);
  dialog.close();
  toast('削除しました');
  onDone?.();
}
