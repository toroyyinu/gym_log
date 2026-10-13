// 記録のルール（前回記録、セット番号、入力チェックなど）。
// 画面にもデータベースにも触らない関数だけを置き、tests/ から確かめられるようにする。

export const APP_VERSION = '0.2.0';

export const GROUPS = ['胸', '背中', '肩', '腕', '体幹', '脚・お尻'];

// 種目の種類。有酸素はマシンの型によって記録する項目が変わる
export const KINDS = [
  { value: 'strength', label: '筋トレ' },
  { value: 'treadmill', label: 'トレッドミル型' },
  { value: 'bike', label: 'バイク型' },
];
export const CARDIO_GROUP = '有酸素'; // 絞り込みや種目の説明で、筋肉の部位と並べて使う

// 有酸素の記録項目。範囲は業務用マシンの仕様より広めにとる（機能設計書「有酸素の記録項目」）
// stepper が true の項目は記録画面で −／＋ ボタンをつける。total が true の項目はグラフで1日の合計を出す（他は最大）
export const CARDIO_FIELDS = {
  durationMin: { label: '時間', unit: '分', min: 1, max: 300, step: 1, decimals: 0, required: true, stepper: true, total: true },
  speedKmh: { label: '速度', unit: 'km/h', min: 0.1, max: 30, step: 0.5, decimals: 1, stepper: true },
  inclinePct: { label: '傾斜', unit: '%', min: -5, max: 40, step: 0.5, decimals: 1, stepper: true },
  level: { label: 'レベル', unit: '', min: 0, max: 30, step: 1, decimals: 0, stepper: true },
  rpm: { label: '回転数', unit: 'rpm', min: 0, max: 200, step: 5, decimals: 0, stepper: true },
  distanceKm: { label: '距離', unit: 'km', min: 0, max: 100, step: 0.1, decimals: 2, total: true },
  kcal: { label: 'カロリー', unit: 'kcal', min: 0, max: 3000, step: 10, decimals: 0, total: true },
};
export const KIND_FIELDS = {
  strength: ['weightKg', 'reps'],
  treadmill: ['durationMin', 'speedKmh', 'inclinePct', 'distanceKm', 'kcal'],
  bike: ['durationMin', 'level', 'rpm', 'distanceKm', 'kcal'],
};

// hint は筋トレ、cardioHint は有酸素の目安（機能設計書「3. 辛さの定義」）
export const DIFFICULTIES = [
  { value: 1, label: '余裕', hint: 'まだかなり回数を重ねられる', cardioHint: '会話しながら楽に続けられる' },
  { value: 2, label: 'やや楽', hint: '少し余力がある', cardioHint: '少し息が上がるが、まだ余裕がある' },
  { value: 3, label: '普通', hint: 'ほどよくきつい', cardioHint: '息は上がるが、続けられる' },
  { value: 4, label: 'きつい', hint: 'あと1〜2回が限界', cardioHint: '会話がつらい。あと少しで限界' },
  { value: 5, label: '限界', hint: 'もう1回もできない', cardioHint: 'これ以上は続けられない' },
];

export function difficultyHint(value, kind = 'strength') {
  const d = DIFFICULTIES.find((x) => x.value === value);
  if (!d) return '押すと目安が出ます';
  return `${d.label}：${kind === 'strength' ? d.hint : d.cardioHint}`;
}

export const LIMITS = {
  weightMin: 0,
  weightMax: 100,
  repsMin: 1,
  repsMax: 100,
  stepMin: 0.5,
  stepMax: 10,
};

export const DEFAULT_WEIGHT_STEP = 2.5;
export const BACKUP_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = '日月火水木金土';

// ---------- ID ----------

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // randomUUID が使えない環境（HTTP で開いたときなど）向けの予備
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- 日時 ----------

const pad = (n) => String(n).padStart(2, '0');

// 端末の現地時刻での日付（例：2026-10-12）
export function dateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 時差つきの ISO 8601 文字列（例：2026-10-12T19:42:00+09:00）
export function toLocalISO(value) {
  const d = new Date(value);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${dateKey(d)}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// <input type="datetime-local"> 用の値（例：2026-10-12T19:42）
export function toInputDateTime(value) {
  const d = new Date(value);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputDateTime(text) {
  if (!text) return null;
  const d = new Date(text); // 時差のない書式は現地時刻として読まれる
  return Number.isNaN(d.getTime()) ? null : toLocalISO(d);
}

export function formatTime(value) {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 例：10/8(水)。今年でなければ年もつける
export function formatDay(key, now = new Date()) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const year = y === now.getFullYear() ? '' : `${y}/`;
  return `${year}${m}/${d}(${weekday})`;
}

export function formatDateTime(value) {
  if (!value) return '';
  return `${formatDay(dateKey(value))} ${formatTime(value)}`;
}

// 表示期間の始まりの日付。'all' なら null
export function periodStart(period, now = new Date()) {
  const months = { '1m': 1, '3m': 3 }[period];
  if (!months) return null;
  return dateKey(new Date(now.getFullYear(), now.getMonth() - months, now.getDate()));
}

// ---------- 表示用 ----------

// ①〜⑳。21以上は「21.」
export function setMark(n) {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x245f + n) : `${n}.`;
}

export function difficultyLabel(value) {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? '';
}

// 種類が入っていない種目（種類を作る前に登録したもの）は筋トレ
export const kindOf = (exercise) => exercise?.kind ?? 'strength';
export const isCardio = (exercise) => kindOf(exercise) !== 'strength';

export function kindLabel(kind) {
  return KINDS.find((k) => k.value === kind)?.label ?? '';
}

// 種目に紐づいた筋肉の部位（GROUPS の順、重複なし）。有酸素は「有酸素」
export function exerciseGroups(exercise, muscleMap) {
  if (isCardio(exercise)) return [CARDIO_GROUP];
  return GROUPS.filter((g) => exercise.muscleIds.some((id) => muscleMap.get(id)?.group === g));
}

// 数値を表示用に（小数の誤差を消し、余分な 0 をつけない）
const formatNumber = (n, decimals) => String(Number(n.toFixed(decimals)));

// 1回分の記録を1行で（例：40kg × 10回、30分 ・ 8km/h ・ 傾斜 2% ・ 3.2km）
export function recordSummary(record, kind) {
  if (kind === 'strength') return `${record.weightKg}kg × ${record.reps}回`;
  return KIND_FIELDS[kind]
    .filter((key) => record[key] != null)
    .map((key) => {
      const f = CARDIO_FIELDS[key];
      const value = formatNumber(record[key], f.decimals);
      if (key === 'inclinePct') return `傾斜 ${value}%`;
      if (key === 'level') return `レベル ${value}`;
      return `${value}${f.unit}`;
    })
    .join(' ・ ');
}

// ---------- 種目 ----------

// 種目ごとの最後に記録した日時（種目ID → performedAt）
export function lastPerformed(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.exerciseId) || r.performedAt > map.get(r.exerciseId)) map.set(r.exerciseId, r.performedAt);
  }
  return map;
}

// 最近記録した種目が上。記録のない種目はその後ろに名前順
export function sortExercises(list, lastUsed = new Map()) {
  return [...list].sort((a, b) => {
    const ta = lastUsed.get(a.id) ?? '';
    const tb = lastUsed.get(b.id) ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.name.localeCompare(b.name, 'ja');
  });
}

// filter は ''（すべて）、'g:部位名'、'm:筋肉ID' のいずれか
export function matchesFilter(exercise, filter, muscleMap) {
  if (!filter) return true;
  if (!exercise) return false;
  const [kind, value] = [filter.slice(0, 1), filter.slice(2)];
  if (kind === 'g') return exerciseGroups(exercise, muscleMap).includes(value);
  if (kind === 'm') return exercise.muscleIds.includes(value);
  return true;
}

// ---------- 記録 ----------

export function sortByTime(records) {
  return [...records].sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
}

// 日付ごとにまとめる。日付は新しい順、各日の中は古い順
export function groupByDay(records) {
  const days = new Map();
  for (const r of sortByTime(records)) {
    const key = dateKey(r.performedAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  }
  return [...days].map(([date, list]) => ({ date, records: list })).sort((a, b) => b.date.localeCompare(a.date));
}

// 記録ID → セット番号（同じ日・同じ種目の中で時刻順に 1, 2, 3…）
export function setNumbers(records) {
  const counters = new Map();
  const numbers = new Map();
  for (const r of sortByTime(records)) {
    const key = `${dateKey(r.performedAt)}|${r.exerciseId}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    numbers.set(r.id, n);
  }
  return numbers;
}

// 1つの種目の記録から、今日より前で一番新しい日の記録を返す
export function previousSession(records, today) {
  return groupByDay(records).find((d) => d.date < today) ?? null;
}

export function todaySets(records, today) {
  return sortByTime(records).filter((r) => dateKey(r.performedAt) === today);
}

// 入力欄の初期値（機能設計書 S-1「入力欄の初期値」）。kind ごとの項目について返す
export function initialValues(previous, todays, kind = 'strength') {
  const base = todays.at(-1) ?? previous?.records[0] ?? null;
  return Object.fromEntries(KIND_FIELDS[kind].map((key) => [key, base?.[key] ?? null]));
}

// グラフの点：日ごとの値を古い順に。total なら合計、そうでなければ最大。値のない日は除く
export function dailyValues(records, key, { total = false, since = null } = {}) {
  return groupByDay(records)
    .filter((d) => !since || d.date >= since)
    .map((d) => {
      const values = d.records.map((r) => r[key]).filter((v) => v != null);
      if (values.length === 0) return null;
      const value = total ? values.reduce((a, b) => a + b, 0) : Math.max(...values);
      return { date: d.date, value: Number(value.toFixed(2)), records: d.records };
    })
    .filter(Boolean)
    .reverse();
}

export function dailyMax(records, since = null) {
  return dailyValues(records, 'weightKg', { since });
}

// ---------- 数値と入力チェック ----------

// 空欄は null。全角数字も受け付ける
export function parseNumber(value) {
  if (value == null) return null;
  const text = String(value)
    .trim()
    .replace(/[０-９．]/g, (c) => (c === '．' ? '.' : String(c.charCodeAt(0) - 0xff10)));
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const hasDecimals = (n, decimals) => Math.abs(n * 10 ** decimals - Math.round(n * 10 ** decimals)) < 1e-9;
const isTenth = (n) => hasDecimals(n, 1);

export function stepValue(value, step, direction, min, max) {
  const next = Math.round(((value ?? 0) + step * direction) * 100) / 100;
  return Math.min(max, Math.max(min, next));
}

// 問題がなければ ''、あれば理由を返す
export function validateSet({ weightKg, reps, difficulty }) {
  const { weightMin, weightMax, repsMin, repsMax } = LIMITS;
  if (weightKg == null) return '重量を入力してください';
  if (weightKg < weightMin || weightKg > weightMax) return `重量は${weightMin}〜${weightMax}kgで入力してください`;
  if (!isTenth(weightKg)) return '重量は小数第1位まで入力できます';
  if (reps == null) return '回数を入力してください';
  if (!Number.isInteger(reps) || reps < repsMin || reps > repsMax) return `回数は${repsMin}〜${repsMax}の整数で入力してください`;
  if (!DIFFICULTIES.some((d) => d.value === difficulty)) return '辛さを選んでください';
  return '';
}

// 有酸素の記録の入力チェック。時間と辛さは必須、ほかは空欄でもよい
export function validateCardio(values, kind) {
  for (const key of KIND_FIELDS[kind]) {
    const f = CARDIO_FIELDS[key];
    const v = values[key];
    if (v == null) {
      if (f.required) return `${f.label}を入力してください`;
      continue;
    }
    if (v < f.min || v > f.max) return `${f.label}は${f.min}〜${f.max}${f.unit}で入力してください`;
    if (!hasDecimals(v, f.decimals)) return f.decimals === 0 ? `${f.label}は整数で入力してください` : `${f.label}は小数第${f.decimals}位まで入力できます`;
  }
  if (!DIFFICULTIES.some((d) => d.value === values.difficulty)) return '辛さを選んでください';
  return '';
}

export function validateRecord(values, kind) {
  return kind === 'strength' ? validateSet(values) : validateCardio(values, kind);
}

// 種目編集画面で筋肉を追加するときの入力チェック（同じ名前があるかは画面側で扱う）
export function validateMuscle({ name, group }) {
  if (!name) return '筋肉の名前を入力してください';
  if (!GROUPS.includes(group)) return '部位を選んでください';
  return '';
}

export function validateExercise(exercise, allExercises) {
  const { stepMin, stepMax } = LIMITS;
  if (!exercise.name) return '種目名を入力してください';
  if (allExercises.some((e) => e.name === exercise.name && e.id !== exercise.id)) return 'この名前の種目はすでにあります';
  if (!KINDS.some((k) => k.value === kindOf(exercise))) return '種類を選んでください';
  if (isCardio(exercise)) return '';
  if (exercise.muscleIds.length === 0) return '鍛える筋肉を1つ以上選んでください';
  const step = exercise.weightStep;
  if (step == null || step < stepMin || step > stepMax || !isTenth(step)) {
    return `重量の刻み幅は${stepMin}〜${stepMax}kgで入力してください`;
  }
  return '';
}

// ---------- バックアップ ----------

// 最後のバックアップ（なければ最初の記録）から7日以上経っていれば true
export function isBackupDue(lastBackupAt, firstRecordAt, now = new Date()) {
  const base = lastBackupAt ?? firstRecordAt;
  if (!base) return false;
  return now - new Date(base) >= BACKUP_INTERVAL_DAYS * DAY_MS;
}
