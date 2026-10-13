// 画面の部品を扱う共通関数。
// 要素は data-ref（画面内の要素）、data-tpl（<template>）、data-field（テンプレート内の差し込み先）で探す。

import { DIFFICULTIES, difficultyHint, difficultyLabel, recordSummary, setMark } from './domain.js';

export function ref(root, name) {
  return root.querySelector(`[data-ref="${name}"]`);
}

// <template data-tpl="name"> の中身を複製する
export function tpl(name) {
  const template = document.querySelector(`template[data-tpl="${name}"]`);
  return template.content.firstElementChild.cloneNode(true);
}

export function field(node, name) {
  return node.querySelector(`[data-field="${name}"]`);
}

// data-field に値を入れる（textContent なので、入力された文字が HTML として解釈されることはない）
export function fill(node, values) {
  for (const [name, value] of Object.entries(values)) {
    const element = field(node, name);
    if (element) element.textContent = value ?? '';
  }
  return node;
}

let toastTimer;
let toastAction = null;
// 画面下に短い通知を出す。action（{ label, onClick }）を渡すと、通知の中にボタンを出し、表示を長めにする
export function toast(message, action = null) {
  const element = ref(document, 'toast');
  const button = ref(element, 'toast-action');
  ref(element, 'toast-message').textContent = message;
  if (toastAction) button.removeEventListener('click', toastAction);
  toastAction = action
    ? () => {
        element.hidden = true;
        action.onClick();
      }
    : null;
  button.hidden = !action;
  button.textContent = action?.label ?? '';
  if (toastAction) button.addEventListener('click', toastAction);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (element.hidden = true), action ? 5000 : 2000);
}

// 辛さ5段階のボタン。value で選択中の値（未選択は null）を読み書きできる。
// hintElement を渡すと、選んだ段階の目安をそこに出す（kind で筋トレ用・有酸素用を切り替える）
export function difficultyPicker(container, onChange = () => {}, hintElement = null) {
  let value = null;
  let kind = 'strength';
  const buttons = DIFFICULTIES.map((d) => {
    const button = fill(tpl('difficulty-button'), { label: d.label });
    button.dataset.difficulty = d.value;
    button.addEventListener('click', () => {
      select(d.value);
      onChange(value);
    });
    container.append(button);
    return button;
  });
  function select(v) {
    value = v;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.difficulty) === v)));
    if (hintElement) hintElement.textContent = difficultyHint(value, kind);
  }
  select(null);
  return {
    get value() {
      return value;
    },
    set value(v) {
      select(v);
    },
    set kind(k) {
      kind = k;
      select(value);
    },
  };
}

// 1セット（有酸素は1回）分の行。kind は種目の種類。onClick を渡すと押せる行になる
export function setRow(record, no, onClick, kind = 'strength') {
  const row = fill(tpl('set-row'), {
    no: setMark(no),
    summary: recordSummary(record, kind),
    difficulty: difficultyLabel(record.difficulty),
    note: record.note,
  });
  field(row, 'difficulty').dataset.difficulty = record.difficulty;
  field(row, 'note').hidden = !record.note;
  const button = row.querySelector('button');
  if (onClick) button.addEventListener('click', () => onClick(record));
  else button.disabled = true;
  return row;
}

export function fillExerciseSelect(select, exercises, selectedId) {
  select.replaceChildren(
    ...exercises.map((e) => new Option(e.hidden ? `${e.name}（非表示）` : e.name, e.id, false, e.id === selectedId)),
  );
}

// 押しっぱなしの二重送信を防ぐため、処理中はボタンを押せなくする
export async function busy(button, task) {
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}
