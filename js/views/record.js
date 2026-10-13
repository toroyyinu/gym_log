// S-1 記録画面 / S-2 種目選択シート（表示は views/record.html）

import { refreshBanners } from '../banners.js';
import * as db from '../db.js';
import {
  CARDIO_FIELDS, CARDIO_GROUP, GROUPS, KIND_FIELDS, LIMITS, dateKey, exerciseGroups, formatDay, initialValues, kindOf,
  newId, parseNumber, previousSession, setMark, sortExercises, stepValue, toLocalISO, todaySets, validateRecord,
} from '../domain.js';
import { openRecordEditor } from '../record-editor.js';
import { busy, difficultyPicker, field, fill, ref, setRow, toast, tpl } from '../ui.js';

let groupFilter = ''; // 種目選択シートの部位の絞り込み（'' はすべて）
// 入力中の値。ほかの画面へ移って戻ってきたときに入力欄を元に戻すため、画面の外に覚えておく
let draft = null;

export async function init(root) {
  const [exercises, muscles, lastUsed] = await Promise.all([db.listExercises(), db.listMuscles(), db.lastPerformedMap()]);
  const muscleMap = new Map(muscles.map((m) => [m.id, m]));
  const visible = sortExercises(exercises.filter((e) => !e.hidden), lastUsed);
  const lastId = await db.getMeta('lastExerciseId');
  let exercise = visible.find((e) => e.id === lastId) ?? null;
  const savedDraft = draft;
  let todays = [];
  let inputs = new Map(); // 記録する項目名 → 入力欄（種目の種類で変わる）

  const weight = ref(root, 'weight');
  const reps = ref(root, 'reps');
  const note = ref(root, 'note');
  const kind = () => kindOf(exercise);
  const picker = difficultyPicker(ref(root, 'difficulty'), updateSubmit, ref(root, 'difficulty-hint'));

  const subText = (e) => exerciseGroups(e, muscleMap).join(' ・ ');

  // ---------- 種目選択シート ----------

  const sheet = ref(root, 'exercise-sheet');
  const chips = ['', ...GROUPS, CARDIO_GROUP].map((group) => {
    const chip = fill(tpl('chip'), { label: group || 'すべて' });
    chip.addEventListener('click', () => {
      groupFilter = group;
      renderSheet();
    });
    ref(root, 'group-chips').append(chip);
    return { chip, group };
  });

  function renderSheet() {
    chips.forEach(({ chip, group }) => chip.setAttribute('aria-pressed', String(group === groupFilter)));
    const list = visible.filter((e) => !groupFilter || exerciseGroups(e, muscleMap).includes(groupFilter));
    ref(root, 'exercise-list').replaceChildren(
      ...list.map((e) => {
        const item = fill(tpl('exercise-item'), { name: e.name, sub: subText(e) });
        item.querySelector('button').addEventListener('click', () => {
          sheet.close();
          selectExercise(e);
        });
        return item;
      }),
    );
    ref(root, 'no-exercise').hidden = list.length > 0;
  }

  function openSheet() {
    renderSheet();
    sheet.showModal();
  }

  ref(root, 'pick').addEventListener('click', openSheet);
  ref(root, 'pick-empty').addEventListener('click', openSheet);
  ref(root, 'sheet-close').addEventListener('click', () => sheet.close());
  ref(root, 'add-exercise').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });

  // ---------- 記録画面 ----------

  async function selectExercise(e) {
    exercise = e;
    buildInputs();
    await db.setMeta('lastExerciseId', e.id);
    await refresh(true);
  }

  // resetInputs が true なら、入力欄を初期値に戻す
  async function refresh(resetInputs) {
    ref(root, 'empty').hidden = exercise !== null;
    ref(root, 'main').hidden = exercise === null;
    if (!exercise) return;

    ref(root, 'exercise-name').textContent = exercise.name;
    ref(root, 'exercise-sub').textContent = subText(exercise);
    const fixedNote = ref(root, 'fixed-note');
    fixedNote.textContent = exercise.fixedNote;
    fixedNote.hidden = !exercise.fixedNote;

    const records = await db.recordsOfExercise(exercise.id);
    const today = dateKey(new Date());
    const previous = previousSession(records, today);
    todays = todaySets(records, today);
    const reload = () => refresh(false);

    // 前回の行は、その値を入力欄に入れる（前回の記録の修正は履歴画面から）
    ref(root, 'prev-section').hidden = !previous;
    if (previous) {
      ref(root, 'prev-date').textContent = formatDay(previous.date);
      ref(root, 'prev-sets').replaceChildren(...previous.records.map((r, i) => setRow(r, i + 1, () => copyValues(r, i + 1), kind())));
    }
    ref(root, 'today-section').hidden = todays.length === 0;
    ref(root, 'today-sets').replaceChildren(...todays.map((r, i) => setRow(r, i + 1, (rec) => openRecordEditor(rec, reload), kind())));

    if (resetInputs) {
      const initial = initialValues(previous, todays, kind());
      for (const [key, input] of inputs) input.value = initial[key] ?? '';
      picker.value = null;
      note.value = '';
    }
    updateSubmit();
  }

  function copyValues(record, no) {
    for (const [key, input] of inputs) input.value = record[key] ?? '';
    updateSubmit();
    toast(`前回の${setMark(no)}の値を入れました`);
  }

  // 種目の種類に合わせて入力欄を用意する。筋トレは画面にある欄、有酸素はテンプレートから作る
  function buildInputs() {
    const cardio = kind() !== 'strength';
    ref(root, 'strength-fields').hidden = cardio;
    ref(root, 'cardio-note').hidden = !cardio;
    picker.kind = kind();
    ref(root, 'submit').textContent = cardio ? '記録する' : 'このセットを記録';
    const steppers = [];
    const extras = [];
    inputs = new Map();
    if (!cardio) {
      inputs.set('weightKg', weight).set('reps', reps);
    } else {
      for (const key of KIND_FIELDS[kind()]) {
        const f = CARDIO_FIELDS[key];
        if (f.stepper) {
          const item = fill(tpl('cardio-stepper'), { label: f.label, unit: f.unit });
          const input = item.querySelector('input');
          input.setAttribute('aria-label', f.label);
          field(item, 'minus').setAttribute('aria-label', `${f.label}を減らす`);
          field(item, 'plus').setAttribute('aria-label', `${f.label}を増やす`);
          field(item, 'minus').addEventListener('click', () => step(input, f.step, -1, f.min, f.max));
          field(item, 'plus').addEventListener('click', () => step(input, f.step, 1, f.min, f.max));
          steppers.push(item);
          inputs.set(key, input);
        } else {
          const item = fill(tpl('cardio-extra'), { label: `${f.label}（${f.unit}・任意）` });
          extras.push(item);
          inputs.set(key, item.querySelector('input'));
        }
      }
      for (const input of inputs.values()) input.addEventListener('input', updateSubmit);
    }
    ref(root, 'cardio-steppers').replaceChildren(...steppers);
    ref(root, 'cardio-extras').replaceChildren(...extras);
  }

  const currentValues = () => ({
    ...Object.fromEntries([...inputs].map(([key, input]) => [key, parseNumber(input.value)])),
    difficulty: picker.value,
  });

  function updateSubmit() {
    const message = validateRecord(currentValues(), kind());
    ref(root, 'hint').textContent = message;
    ref(root, 'submit').disabled = message !== '';
    saveDraft();
  }

  function saveDraft() {
    if (!exercise) return;
    draft = {
      exerciseId: exercise.id,
      date: dateKey(new Date()),
      values: Object.fromEntries([...inputs].map(([key, input]) => [key, input.value])),
      difficulty: picker.value,
      note: note.value,
    };
  }

  // 同じ日に同じ種目を入力していた途中なら、その値に戻す
  function restoreDraft(saved) {
    if (!exercise || saved?.exerciseId !== exercise.id || saved.date !== dateKey(new Date())) return;
    for (const [key, input] of inputs) input.value = saved.values[key] ?? '';
    picker.value = saved.difficulty;
    note.value = saved.note;
    updateSubmit();
  }

  function step(input, size, direction, min, max) {
    input.value = stepValue(parseNumber(input.value), size, direction, min, max);
    updateSubmit();
  }
  const { weightMin, weightMax, repsMin, repsMax } = LIMITS;
  ref(root, 'weight-minus').addEventListener('click', () => step(weight, exercise.weightStep, -1, weightMin, weightMax));
  ref(root, 'weight-plus').addEventListener('click', () => step(weight, exercise.weightStep, 1, weightMin, weightMax));
  ref(root, 'reps-minus').addEventListener('click', () => step(reps, 1, -1, repsMin, repsMax));
  ref(root, 'reps-plus').addEventListener('click', () => step(reps, 1, 1, repsMin, repsMax));
  weight.addEventListener('input', updateSubmit);
  reps.addEventListener('input', updateSubmit);
  note.addEventListener('input', saveDraft);

  ref(root, 'form').addEventListener('submit', (event) => {
    event.preventDefault();
    busy(ref(root, 'submit'), async () => {
      const values = currentValues();
      if (validateRecord(values, kind())) return;
      const id = newId();
      await db.saveRecord({
        id,
        exerciseId: exercise.id,
        performedAt: toLocalISO(new Date()),
        ...values,
        note: note.value.trim(),
      });
      const message = kind() === 'strength' ? `${setMark(todays.length + 1)}を記録しました` : '記録しました';
      toast(message, {
        label: '取り消す',
        onClick: async () => {
          await db.deleteRecord(id);
          toast('取り消しました');
          await refresh(false);
          await refreshBanners();
        },
      });
      await refresh(true);
      await refreshBanners();
    });
  });

  if (exercise) buildInputs();
  await refresh(true);
  restoreDraft(savedDraft);
}
