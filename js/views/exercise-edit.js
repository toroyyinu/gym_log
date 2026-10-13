// S-7 種目編集画面（表示は views/exercise-edit.html）
// params.id があれば編集、なければ新規登録。params.from が 'record' なら、保存後に記録画面へ戻る。

import * as db from '../db.js';
import {
  CARDIO_FIELDS, DEFAULT_WEIGHT_STEP, GROUPS, KINDS, KIND_FIELDS, kindOf, newId, parseNumber, toLocalISO, validateExercise, validateMuscle,
} from '../domain.js';
import { busy, field, fill, ref, toast, tpl } from '../ui.js';

export async function init(root, params) {
  const [exercises, muscles] = await Promise.all([db.listExercises(), db.listMuscles()]);
  const existing = params.id ? exercises.find((e) => e.id === params.id) : null;
  const backHash = params.from === 'record' ? '#/record' : '#/settings';
  ref(root, 'back').href = backHash;

  if (params.id && !existing) {
    ref(root, 'not-found').hidden = false;
    ref(root, 'form').hidden = true;
    return;
  }

  // 筋肉のチェックボックス（部位ごと）
  const checks = new Map(); // 筋肉ID → チェックボックス
  const lists = new Map(); // 部位 → チェックボックスを並べる場所
  ref(root, 'muscles').append(
    ...GROUPS.map((group) => {
      const block = fill(tpl('muscle-check-group'), { group });
      lists.set(group, field(block, 'checks'));
      return block;
    }),
  );
  function addCheck(muscle, checked) {
    const label = fill(tpl('muscle-check'), { name: muscle.name });
    const checkbox = label.querySelector('input');
    checkbox.checked = checked;
    checks.set(muscle.id, checkbox);
    lists.get(muscle.group)?.append(label);
  }
  // 設定画面で削除した筋肉は出さない（この種目で使っているものは除く）
  muscles
    .filter((m) => !m.hidden || existing?.muscleIds.includes(m.id))
    .forEach((m) => addCheck(m, existing?.muscleIds.includes(m.id) ?? false));

  // その他の筋肉：チェックした状態で一覧に加え、種目を保存するときに筋肉リストにも保存する
  // 削除した筋肉と同じ名前なら、新しく作らずにその筋肉を戻す
  const added = [];
  const groupSelect = ref(root, 'new-muscle-group');
  groupSelect.append(new Option('部位', ''), ...GROUPS.map((g) => new Option(g, g)));
  const nameInput = ref(root, 'new-muscle-name');

  function addMuscle() {
    const muscle = { id: newId(), name: nameInput.value.trim(), group: groupSelect.value, builtin: false, order: Date.now() };
    const sameName = [...muscles, ...added].find((m) => m.name === muscle.name);
    const message = sameName ? '' : validateMuscle(muscle);
    ref(root, 'muscle-error').textContent = message;
    if (message) return;
    if (sameName && checks.has(sameName.id)) {
      checks.get(sameName.id).checked = true;
      toast(`「${sameName.name}」はすでにあるので、チェックしました`);
    } else if (sameName) {
      const restored = { ...sameName, hidden: false, group: muscle.group || sameName.group };
      added.push(restored);
      addCheck(restored, true);
      toast(`削除していた「${sameName.name}」を戻しました`);
    } else {
      added.push(muscle);
      addCheck(muscle, true);
    }
    nameInput.value = '';
    groupSelect.value = '';
  }
  ref(root, 'add-muscle').addEventListener('click', addMuscle);
  // 入力欄で改行キーを押したときは、種目の保存ではなく筋肉の追加にする
  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    addMuscle();
  });

  // 種類。記録がある種目は、記録の項目が合わなくなるので変えられない
  const recordCount = existing ? (await db.recordsOfExercise(existing.id)).length : 0;
  const kindRadios = KINDS.map((k) => {
    const label = fill(tpl('kind-option'), { label: k.label });
    const radio = label.querySelector('input');
    radio.value = k.value;
    radio.checked = k.value === kindOf(existing);
    radio.disabled = recordCount > 0;
    radio.addEventListener('change', showKind);
    ref(root, 'kinds').append(label);
    return radio;
  });
  const selectedKind = () => kindRadios.find((r) => r.checked)?.value;
  function showKind() {
    const kind = selectedKind();
    const cardio = kind !== 'strength';
    ref(root, 'strength-only').hidden = cardio;
    ref(root, 'step-field').hidden = cardio;
    const items = cardio ? KIND_FIELDS[kind].map((key) => CARDIO_FIELDS[key].label).join('・') : '';
    ref(root, 'kind-note').textContent = [
      cardio ? `記録する項目：${items}` : '',
      recordCount > 0 ? '記録がある種目は、種類を変えられません。' : '',
    ].join(' ');
  }
  showKind();

  // 値を入れる
  ref(root, 'title').textContent = existing ? '種目を編集' : '種目を登録';
  ref(root, 'name').value = existing?.name ?? '';
  ref(root, 'step').value = existing?.weightStep ?? DEFAULT_WEIGHT_STEP;
  ref(root, 'fixed-note').value = existing?.fixedNote ?? '';

  ref(root, 'form').addEventListener('submit', (event) => {
    event.preventDefault();
    busy(ref(root, 'submit'), save);
  });

  async function save() {
    const kind = selectedKind();
    const cardio = kind !== 'strength';
    const exercise = {
      id: existing?.id ?? newId(),
      name: ref(root, 'name').value.trim(),
      kind,
      // 有酸素は筋肉・刻み幅を使わない
      muscleIds: cardio ? [] : [...checks].filter(([, checkbox]) => checkbox.checked).map(([id]) => id),
      weightStep: cardio ? existing?.weightStep ?? DEFAULT_WEIGHT_STEP : parseNumber(ref(root, 'step').value),
      fixedNote: ref(root, 'fixed-note').value.trim(),
      hidden: existing?.hidden ?? false,
      createdAt: existing?.createdAt ?? toLocalISO(new Date()),
    };
    const message = validateExercise(exercise, exercises);
    ref(root, 'error').textContent = message;
    if (message) return;
    try {
      // チェックを外した追加分は保存しない
      for (const muscle of added.filter((m) => exercise.muscleIds.includes(m.id))) await db.saveMuscle(muscle);
      await db.saveExercise(exercise);
    } catch (error) {
      ref(root, 'error').textContent = error.name === 'ConstraintError' ? 'この名前の種目はすでにあります' : `保存できませんでした：${error.message}`;
      return;
    }
    // 記録画面から登録したときは、その種目を選んだ状態で戻る
    if (!existing && params.from === 'record') await db.setMeta('lastExerciseId', exercise.id);
    toast(existing ? '保存しました' : `「${exercise.name}」を登録しました`);
    location.hash = backHash;
  }

  if (!existing) return;

  // 記録がある種目は削除できないので、非表示にする
  ref(root, 'manage').hidden = false;
  const toggle = ref(root, 'toggle-hidden');
  toggle.textContent = existing.hidden ? '再び表示する' : '非表示にする';
  toggle.addEventListener('click', async () => {
    await db.saveExercise({ ...existing, hidden: !existing.hidden });
    toast(existing.hidden ? '表示するようにしました' : '非表示にしました');
    location.hash = backHash;
  });
  ref(root, 'delete').hidden = recordCount > 0;
  ref(root, 'manage-note').textContent =
    recordCount > 0 ? `記録が${recordCount}件あるので削除できません。使わなくなったら非表示にしてください。` : '';
  ref(root, 'delete').addEventListener('click', async () => {
    if (!confirm(`「${existing.name}」を削除しますか？`)) return;
    await db.deleteExercise(existing.id);
    toast('削除しました');
    location.hash = backHash;
  });
}
