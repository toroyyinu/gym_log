// S-3 履歴画面（表示は views/history.html）

import * as db from '../db.js';
import {
  CARDIO_GROUP, GROUPS, formatDay, groupByDay, kindOf, lastPerformed, matchesFilter, setNumbers, sortExercises,
} from '../domain.js';
import { openRecordEditor } from '../record-editor.js';
import { field, fill, fillExerciseSelect, ref, setRow, tpl } from '../ui.js';

// 画面を移っても選んだ状態を覚えておく
const state = { mode: 'day', filter: '', exerciseId: null };

export async function init(root) {
  const [exercises, muscles] = await Promise.all([db.listExercises(), db.listMuscles()]);
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const muscleMap = new Map(muscles.map((m) => [m.id, m]));
  let records = await db.listRecords();

  // 絞り込みの選択肢：すべて / 部位 / 部位ごとの筋肉
  const filter = ref(root, 'filter');
  const groupOptions = document.createElement('optgroup');
  groupOptions.label = '部位';
  groupOptions.append(...[...GROUPS, CARDIO_GROUP].map((g) => new Option(g, `g:${g}`)));
  const muscleOptions = GROUPS.map((g) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = `筋肉（${g}）`;
    optgroup.append(...muscles.filter((m) => m.group === g && !m.hidden).map((m) => new Option(m.name, `m:${m.id}`)));
    return optgroup;
  });
  filter.append(new Option('すべて', ''), groupOptions, ...muscleOptions);
  filter.value = state.filter;
  filter.addEventListener('change', () => {
    state.filter = filter.value;
    render();
  });

  const exerciseSelect = ref(root, 'exercise');
  exerciseSelect.addEventListener('change', () => {
    state.exerciseId = exerciseSelect.value;
    render();
  });

  const modeButtons = { day: ref(root, 'mode-day'), exercise: ref(root, 'mode-exercise') };
  for (const [mode, button] of Object.entries(modeButtons)) {
    button.addEventListener('click', () => {
      state.mode = mode;
      render();
    });
  }

  async function reload() {
    records = await db.listRecords();
    render();
  }

  // list は1つの種目の記録
  const exerciseBlock = (name, list, numbers) => {
    const block = fill(tpl('exercise-block'), { name });
    field(block, 'name').hidden = !name;
    const kind = kindOf(exerciseMap.get(list[0]?.exerciseId));
    field(block, 'sets').append(...list.map((r) => setRow(r, numbers.get(r.id), (rec) => openRecordEditor(rec, reload), kind)));
    return block;
  };

  function render() {
    for (const [mode, button] of Object.entries(modeButtons)) button.setAttribute('aria-pressed', String(mode === state.mode));

    const numbers = setNumbers(records);
    const matched = (r) => matchesFilter(exerciseMap.get(r.exerciseId), state.filter, muscleMap);
    let days;

    if (state.mode === 'exercise') {
      const candidates = sortExercises(exercises, lastPerformed(records)).filter((e) => matchesFilter(e, state.filter, muscleMap));
      if (!candidates.some((e) => e.id === state.exerciseId)) state.exerciseId = candidates[0]?.id ?? null;
      fillExerciseSelect(exerciseSelect, candidates, state.exerciseId);
      days = groupByDay(records.filter((r) => r.exerciseId === state.exerciseId)).map((day) => ({
        date: day.date,
        blocks: [exerciseBlock('', day.records, numbers)],
      }));
    } else {
      days = groupByDay(records.filter(matched)).map((day) => {
        // その日に行った順に、種目ごとにまとめる
        const byExercise = new Map();
        for (const r of day.records) {
          if (!byExercise.has(r.exerciseId)) byExercise.set(r.exerciseId, []);
          byExercise.get(r.exerciseId).push(r);
        }
        const blocks = [...byExercise].map(([id, list]) => exerciseBlock(exerciseMap.get(id)?.name ?? '(削除された種目)', list, numbers));
        return { date: day.date, blocks };
      });
    }
    ref(root, 'exercise-field').hidden = state.mode !== 'exercise';

    ref(root, 'list').replaceChildren(
      ...days.map((day) => {
        const block = fill(tpl('day-block'), { date: formatDay(day.date) });
        field(block, 'items').append(...day.blocks);
        return block;
      }),
    );
    ref(root, 'empty').hidden = days.length > 0;
  }

  render();
}
