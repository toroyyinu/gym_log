// domain.js・io.js・chart.js の関数を確かめる。ブラウザで tests/index.html を開くと実行される。

import { niceTicks } from '../js/chart.js';
import {
  dailyMax, dailyValues, dateKey, formatDay, fromInputDateTime, initialValues, isBackupDue, lastPerformed, matchesFilter, parseNumber,
  difficultyHint, recordSummary, validateCardio,
  periodStart, previousSession, setMark, setNumbers, sortExercises, stepValue, toInputDateTime, toLocalISO,
  todaySets, validateExercise, validateMuscle, validateSet,
} from '../js/domain.js';
import { buildBackup, parseBackup, recordsToCSV } from '../js/io.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function equal(actual, expected) {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== e) throw new Error(`期待：${e}\n実際：${a}`);
}

// 現地時刻で作った日時（テストを動かす場所の時差に左右されないように）
const at = (y, m, d, h = 12, min = 0) => toLocalISO(new Date(y, m - 1, d, h, min));
const rec = (id, exerciseId, performedAt, weightKg, reps = 10, difficulty = 3) =>
  ({ id, exerciseId, performedAt, weightKg, reps, difficulty, note: '' });

test('dateKey と toLocalISO は現地時刻の日付になる', () => {
  const iso = at(2026, 10, 12, 23, 59);
  equal(dateKey(iso), '2026-10-12');
  equal(iso.slice(0, 19), '2026-10-12T23:59:00');
});

test('datetime-local との変換が往復で一致する', () => {
  const iso = at(2026, 1, 5, 7, 3);
  equal(toInputDateTime(iso), '2026-01-05T07:03');
  equal(fromInputDateTime('2026-01-05T07:03'), iso);
  equal(fromInputDateTime(''), null);
});

test('formatDay は今年なら年を省く', () => {
  const now = new Date(2026, 9, 12);
  equal(formatDay('2026-10-08', now), '10/8(木)');
  equal(formatDay('2025-12-31', now), '2025/12/31(水)');
});

test('setMark は ①〜⑳、21以上は数字', () => {
  equal([setMark(1), setMark(3), setMark(20), setMark(21)], ['①', '③', '⑳', '21.']);
});

test('種目は最近記録したものが上、記録のない種目は後ろに名前順', () => {
  const list = [
    { id: 'a', name: 'レッグプレス' },
    { id: 'b', name: 'ダンベルカール' },
    { id: 'c', name: 'チェストプレス' },
    { id: 'd', name: 'アブドミナル' },
  ];
  const records = [
    rec('1', 'b', at(2026, 10, 10, 19, 0), 10, 10, 3),
    rec('2', 'a', at(2026, 10, 12, 19, 0), 60, 10, 3),
    rec('3', 'b', at(2026, 10, 12, 18, 0), 10, 10, 3),
  ];
  equal(sortExercises(list, lastPerformed(records)).map((e) => e.name), ['レッグプレス', 'ダンベルカール', 'アブドミナル', 'チェストプレス']);
  equal(sortExercises(list).map((e) => e.name), ['アブドミナル', 'ダンベルカール', 'チェストプレス', 'レッグプレス']);
});

test('絞り込みは部位と筋肉の両方で効く', () => {
  const muscleMap = new Map([['a', { group: '胸' }], ['b', { group: '腕' }]]);
  const ex = { muscleIds: ['a', 'b'] };
  equal([matchesFilter(ex, '', muscleMap), matchesFilter(ex, 'g:腕', muscleMap), matchesFilter(ex, 'g:脚・お尻', muscleMap),
    matchesFilter(ex, 'm:a', muscleMap), matchesFilter(ex, 'm:z', muscleMap)], [true, true, false, true, false]);
});

test('前回記録は今日より前で一番新しい日、今日の記録は別に取れる', () => {
  const records = [
    rec('1', 'x', at(2026, 10, 1), 50),
    rec('2', 'x', at(2026, 10, 8, 19), 60),
    rec('3', 'x', at(2026, 10, 8, 18), 55),
    rec('4', 'x', at(2026, 10, 12), 62.5),
  ];
  const previous = previousSession(records, '2026-10-12');
  equal(previous.date, '2026-10-08');
  equal(previous.records.map((r) => r.id), ['3', '2']); // 時刻順
  equal(todaySets(records, '2026-10-12').map((r) => r.id), ['4']);
  equal(previousSession([records[3]], '2026-10-12'), null);
});

test('入力欄の初期値：今日の直前 > 前回の1セット目 > 空欄', () => {
  const previous = { records: [rec('1', 'x', at(2026, 10, 8), 60, 10)] };
  const todays = [rec('2', 'x', at(2026, 10, 12), 65, 8)];
  equal(initialValues(previous, todays), { weightKg: 65, reps: 8 });
  equal(initialValues(previous, []), { weightKg: 60, reps: 10 });
  equal(initialValues(null, []), { weightKg: null, reps: null });
});

test('セット番号は同じ日・同じ種目ごとに数える', () => {
  const records = [
    rec('a', 'x', at(2026, 10, 12, 10), 60),
    rec('b', 'y', at(2026, 10, 12, 11), 20),
    rec('c', 'x', at(2026, 10, 12, 12), 60),
    rec('d', 'x', at(2026, 10, 13, 10), 60),
  ];
  const n = setNumbers(records);
  equal(['a', 'b', 'c', 'd'].map((id) => n.get(id)), [1, 1, 2, 1]);
});

test('parseNumber は空欄を null、全角数字も読む', () => {
  equal([parseNumber(''), parseNumber(' 12.5 '), parseNumber('６０'), parseNumber('abc')], [null, 12.5, 60, null]);
});

test('stepValue は刻み幅で増減し、範囲に収める', () => {
  equal(stepValue(60, 2.5, 1, 0, 100), 62.5);
  equal(stepValue(null, 2.5, 1, 0, 100), 2.5);
  equal(stepValue(1, 2.5, -1, 0, 100), 0);
  equal(stepValue(99, 2.5, 1, 0, 100), 100);
  equal(stepValue(0.1, 0.2, 1, 0, 100), 0.3); // 小数の誤差が出ない
});

test('validateSet：範囲と未入力を見分ける', () => {
  const ok = { weightKg: 60, reps: 10, difficulty: 3 };
  equal(validateSet(ok), '');
  equal(validateSet({ ...ok, weightKg: null }), '重量を入力してください');
  equal(validateSet({ ...ok, weightKg: 100.5 }), '重量は0〜100kgで入力してください');
  equal(validateSet({ ...ok, weightKg: 60.25 }), '重量は小数第1位まで入力できます');
  equal(validateSet({ ...ok, reps: 0 }), '回数は1〜100の整数で入力してください');
  equal(validateSet({ ...ok, reps: 2.5 }), '回数は1〜100の整数で入力してください');
  equal(validateSet({ ...ok, difficulty: null }), '辛さを選んでください');
  equal(validateSet({ ...ok, weightKg: 0 }), '');
});

test('validateMuscle：名前と部位が必要', () => {
  equal(validateMuscle({ name: '前鋸筋', group: '体幹' }), '');
  equal(validateMuscle({ name: '', group: '体幹' }), '筋肉の名前を入力してください');
  equal(validateMuscle({ name: '前鋸筋', group: '' }), '部位を選んでください');
});

test('validateExercise：名前の重複・筋肉なし・刻み幅', () => {
  const others = [{ id: '1', name: 'チェストプレス' }];
  const ok = { id: '2', name: 'ラットプルダウン', muscleIds: ['back-lats'], weightStep: 2.5 };
  equal(validateExercise(ok, others), '');
  equal(validateExercise({ ...ok, name: 'チェストプレス' }, others), 'この名前の種目はすでにあります');
  equal(validateExercise({ ...ok, id: '1', name: 'チェストプレス' }, others), ''); // 自分自身はよい
  equal(validateExercise({ ...ok, muscleIds: [] }, others), '鍛える筋肉を1つ以上選んでください');
  equal(validateExercise({ ...ok, weightStep: 0 }, others), '重量の刻み幅は0.5〜10kgで入力してください');
});

test('dailyMax は日ごとの最大重量を古い順に返し、期間で絞れる', () => {
  const records = [
    rec('1', 'x', at(2026, 9, 1), 50),
    rec('2', 'x', at(2026, 10, 8, 10), 60),
    rec('3', 'x', at(2026, 10, 8, 11), 65),
  ];
  equal(dailyMax(records).map((p) => [p.date, p.value]), [['2026-09-01', 50], ['2026-10-08', 65]]);
  equal(dailyMax(records, '2026-10-01').map((p) => p.date), ['2026-10-08']);
});

test('有酸素：時間と辛さだけ必須、ほかは空欄でよいが範囲は確かめる', () => {
  const ok = { durationMin: 30, speedKmh: 8, inclinePct: null, distanceKm: 3.25, kcal: null, difficulty: 3 };
  equal(validateCardio(ok, 'treadmill'), '');
  equal(validateCardio({ ...ok, durationMin: null }, 'treadmill'), '時間を入力してください');
  equal(validateCardio({ ...ok, difficulty: null }, 'treadmill'), '辛さを選んでください');
  equal(validateCardio({ ...ok, speedKmh: 31 }, 'treadmill'), '速度は0.1〜30km/hで入力してください');
  equal(validateCardio({ ...ok, inclinePct: -6 }, 'treadmill'), '傾斜は-5〜40%で入力してください');
  equal(validateCardio({ ...ok, durationMin: 30.5 }, 'treadmill'), '時間は整数で入力してください');
  equal(validateCardio({ ...ok, distanceKm: 3.255 }, 'treadmill'), '距離は小数第2位まで入力できます');
  equal(validateCardio({ durationMin: 20, level: 31, difficulty: 2 }, 'bike'), 'レベルは0〜30で入力してください');
});

test('有酸素の記録の表示と、入力欄の初期値', () => {
  const r = { durationMin: 30, speedKmh: 8, inclinePct: 2.5, distanceKm: 3.2, kcal: null };
  equal(recordSummary(r, 'treadmill'), '30分 ・ 8km/h ・ 傾斜 2.5% ・ 3.2km');
  equal(recordSummary({ durationMin: 20, level: 8, rpm: 70 }, 'bike'), '20分 ・ レベル 8 ・ 70rpm');
  equal(recordSummary({ weightKg: 40, reps: 10 }, 'strength'), '40kg × 10回');
  const previous = { date: '2026-10-08', records: [{ ...r, kcal: 250 }] };
  equal(initialValues(previous, [], 'treadmill'), { durationMin: 30, speedKmh: 8, inclinePct: 2.5, distanceKm: 3.2, kcal: 250 });
});

test('グラフの値：時間・距離・カロリーは1日の合計、設定は最大、値のない日は除く', () => {
  const records = [
    { id: '1', exerciseId: 'x', performedAt: at(2026, 10, 8, 10), durationMin: 20, speedKmh: 7 },
    { id: '2', exerciseId: 'x', performedAt: at(2026, 10, 8, 11), durationMin: 15, speedKmh: 8.5 },
    { id: '3', exerciseId: 'x', performedAt: at(2026, 10, 9, 10), durationMin: 30, speedKmh: null },
  ];
  equal(dailyValues(records, 'durationMin', { total: true }).map((p) => [p.date, p.value]), [['2026-10-08', 35], ['2026-10-09', 30]]);
  equal(dailyValues(records, 'speedKmh').map((p) => [p.date, p.value]), [['2026-10-08', 8.5]]);
});

test('絞り込みの「有酸素」は有酸素の種目だけに効く', () => {
  const muscleMap = new Map([['a', { id: 'a', group: '胸' }]]);
  const bike = { kind: 'bike', muscleIds: [] };
  const press = { muscleIds: ['a'] };
  equal([matchesFilter(bike, 'g:有酸素', muscleMap), matchesFilter(press, 'g:有酸素', muscleMap), matchesFilter(bike, 'g:胸', muscleMap)], [true, false, false]);
});

test('辛さの目安は筋トレと有酸素で変わり、未選択なら案内を出す', () => {
  equal(difficultyHint(4), 'きつい：あと1〜2回が限界');
  equal(difficultyHint(4, 'bike'), 'きつい：会話がつらい。あと少しで限界');
  equal(difficultyHint(null), '押すと目安が出ます');
});

test('periodStart', () => {
  const now = new Date(2026, 9, 12);
  equal([periodStart('1m', now), periodStart('3m', now), periodStart('all', now)], ['2026-09-12', '2026-07-12', null]);
});

test('バックアップの案内は7日経ったら出る', () => {
  const now = new Date(2026, 9, 12, 12);
  equal(isBackupDue(null, null, now), false);
  equal(isBackupDue(at(2026, 10, 5, 12, 1), null, now), false);
  equal(isBackupDue(at(2026, 10, 5, 12), null, now), true);
  equal(isBackupDue(null, at(2026, 10, 1), now), true); // 一度も書き出していない
});

test('CSV：BOM・列・セット番号・カンマを含む備考', () => {
  const exercises = [{ id: 'x', name: 'チェストプレス', muscleIds: ['m1', 'm2'] }];
  const muscles = [{ id: 'm1', name: '大胸筋', group: '胸' }, { id: 'm2', name: '上腕三頭筋', group: '腕' }];
  const records = [
    { ...rec('1', 'x', at(2026, 10, 12, 19, 42), 40, 10, 3), note: 'シート4, "浅め"' },
    rec('2', 'x', at(2026, 10, 12, 19, 45), 42.5, 8, 4),
  ];
  const lines = recordsToCSV(records, exercises, muscles).split('\r\n');
  equal(lines[0].startsWith('﻿date,time,exercise,kind'), true);
  equal(lines[1], '2026-10-12,19:42,チェストプレス,筋トレ,大胸筋;上腕三頭筋,胸;腕,1,40,10,,,,,,,,3,普通,"シート4, ""浅め"""');
  equal(lines[2], '2026-10-12,19:45,チェストプレス,筋トレ,大胸筋;上腕三頭筋,胸;腕,2,42.5,8,,,,,,,,4,きつい,');
});

test('バックアップは書き出して読み込むと元に戻る', () => {
  const data = {
    exercises: [{ id: 'x', name: 'A', muscleIds: [] }],
    muscles: [{ id: 'm1', name: '大胸筋', group: '胸', builtin: true }],
    records: [rec('1', 'x', at(2026, 10, 12), 40)],
  };
  equal(parseBackup(JSON.stringify(buildBackup(data))), data);
});

test('壊れたバックアップは理由つきで断る', () => {
  const messages = ['{', '{"app":"other"}', '{"app":"gym_log","schemaVersion":99}',
    '{"app":"gym_log","schemaVersion":1,"exercises":[],"muscles":[],"records":[{"id":"1","exerciseId":"zz"}]}',
    '{"app":"gym_log","schemaVersion":1,"exercises":[{"id":"a","name":"X"},{"id":"b","name":"X"}],"muscles":[],"records":[]}']
    .map((text) => {
      try { parseBackup(text); return 'エラーにならなかった'; } catch (e) { return e.message.slice(0, 10); }
    });
  equal(messages.includes('エラーにならなかった'), false);
});

test('niceTicks は見やすい刻みで範囲を覆う', () => {
  equal(niceTicks(52, 68), [50, 55, 60, 65, 70]);
  equal(niceTicks(60, 60), [55, 57.5, 60, 62.5, 65]);
});

// ---------- 実行と表示 ----------

const list = document.querySelector('[data-ref="results"]');
const template = document.querySelector('template[data-tpl="result"]');
let failed = 0;
for (const { name, fn } of tests) {
  const item = template.content.firstElementChild.cloneNode(true);
  item.querySelector('[data-field="name"]').textContent = name;
  try {
    fn();
    item.className = 'pass';
    item.querySelector('[data-field="mark"]').textContent = '✓';
  } catch (error) {
    failed += 1;
    item.className = 'fail';
    item.querySelector('[data-field="mark"]').textContent = '✗';
    item.querySelector('[data-field="detail"]').textContent = error.message;
  }
  list.append(item);
}
const summary = document.querySelector('[data-ref="summary"]');
summary.textContent = failed ? `${tests.length}件中 ${failed}件 失敗` : `${tests.length}件すべて成功`;
summary.dataset.result = failed ? 'fail' : 'pass';
