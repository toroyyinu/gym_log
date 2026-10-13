// CSV（分析用）とバックアップ JSON（復元用）の書き出し・読み込み。
// 形式は機能設計書「7. 書き出し・読み込みの形式」のとおり。

import {
  dateKey, difficultyLabel, exerciseGroups, formatTime, kindLabel, kindOf, setNumbers, sortByTime, toLocalISO,
} from './domain.js';

export const SCHEMA_VERSION = 1;

const CSV_COLUMNS = [
  'date', 'time', 'exercise', 'kind', 'muscles', 'groups',
  'set_no', 'weight_kg', 'reps',
  'duration_min', 'speed_kmh', 'incline_pct', 'level', 'rpm', 'distance_km', 'kcal',
  'difficulty', 'difficulty_label', 'note',
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCSV(records, exercises, muscles) {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const muscleMap = new Map(muscles.map((m) => [m.id, m]));
  const numbers = setNumbers(records);
  const rows = sortByTime(records).map((r) => {
    const ex = exerciseMap.get(r.exerciseId);
    return [
      dateKey(r.performedAt),
      formatTime(r.performedAt),
      ex?.name ?? '(削除された種目)',
      ex ? kindLabel(kindOf(ex)) : '',
      ex ? ex.muscleIds.map((id) => muscleMap.get(id)?.name).filter(Boolean).join(';') : '',
      ex ? exerciseGroups(ex, muscleMap).join(';') : '',
      numbers.get(r.id),
      r.weightKg,
      r.reps,
      r.durationMin,
      r.speedKmh,
      r.inclinePct,
      r.level,
      r.rpm,
      r.distanceKm,
      r.kcal,
      r.difficulty,
      difficultyLabel(r.difficulty),
      r.note,
    ];
  });
  const lines = [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(','));
  // BOM をつけると Mac の Excel でも文字化けしにくい
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function buildBackup({ exercises, muscles, records }, now = new Date()) {
  return {
    app: 'gym_log',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: toLocalISO(now),
    exercises,
    muscles,
    records,
  };
}

// 読み込んだ JSON を確かめる。問題があれば理由つきの Error を投げる
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('ファイルを JSON として読み込めませんでした。');
  }
  if (data?.app !== 'gym_log') throw new Error('このアプリのバックアップファイルではありません。');
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('このアプリより新しい形式のファイルです。アプリを更新してから読み込んでください。');
  }
  for (const key of ['exercises', 'muscles', 'records']) {
    if (!Array.isArray(data[key])) throw new Error(`ファイルに ${key} がありません。`);
    if (data[key].some((item) => typeof item?.id !== 'string')) throw new Error(`${key} に ID のないデータがあります。`);
  }
  const names = data.exercises.map((e) => e.name);
  if (new Set(names).size !== names.length) throw new Error('同じ名前の種目が2つ以上あります。ファイルが壊れている可能性があります。');
  const exerciseIds = new Set(data.exercises.map((e) => e.id));
  if (data.records.some((r) => !exerciseIds.has(r.exerciseId))) {
    throw new Error('種目が見つからない記録があります。ファイルが壊れている可能性があります。');
  }
  return { exercises: data.exercises, muscles: data.muscles, records: data.records };
}

// ファイル名用の日付（例：20261012）
export function fileStamp(now = new Date()) {
  return dateKey(now).replace(/-/g, '');
}

// iPhone では共有シート（「ファイルに保存」や AirDrop）を開く。使えなければダウンロードする。
// 保存しなかった（共有シートを閉じた）ときは false を返す。
export async function saveFile(filename, text, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      // それ以外（許可されなかったなど）はダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
