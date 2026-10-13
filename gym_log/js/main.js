// 起動処理と画面の切り替え（ハッシュルーティング）。
// URL に対応する views/<画面名>.html を読み込んで差し込み、js/views/<画面名>.js の init を呼ぶ。

import { initBanners, refreshBanners, showUpdateBanner } from './banners.js';
import * as db from './db.js';
import { initRecordEditor } from './record-editor.js';
import { CARDIO_EXERCISES, MUSCLES } from './seed.js';
import { registerServiceWorker, requestPersistence } from './pwa.js';
import { ref } from './ui.js';
import * as exerciseEdit from './views/exercise-edit.js';
import * as graph from './views/graph.js';
import * as history from './views/history.js';
import * as record from './views/record.js';
import * as settings from './views/settings.js';

const screens = { record, history, graph, settings, 'exercise-edit': exerciseEdit };
const view = ref(document, 'view');
const htmlCache = new Map();

// 例：#/exercise/abc?from=record → { name: 'exercise-edit', tab: 'settings', params: { id: 'abc', from: 'record' } }
function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const [first, second] = path.split('/');
  if (first === 'exercise') {
    return { name: 'exercise-edit', tab: 'settings', params: { ...params, id: second === 'new' ? null : second } };
  }
  const name = ['record', 'history', 'graph', 'settings'].includes(first) ? first : 'record';
  return { name, tab: name, params };
}

async function loadHTML(name) {
  if (!htmlCache.has(name)) {
    // ブラウザに古い画面が残って JS と食い違わないよう、毎回更新を確かめる
    const response = await fetch(`views/${name}.html`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`views/${name}.html を読み込めませんでした`);
    htmlCache.set(name, await response.text());
  }
  return htmlCache.get(name);
}

let renderCount = 0;
async function render() {
  const count = ++renderCount;
  const { name, tab, params } = parseHash();
  try {
    const html = await loadHTML(name);
    if (count !== renderCount) return; // 読み込み中に別の画面へ移った
    // 前の画面で開いていたシート（記録の修正など）は閉じる
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    view.innerHTML = html;
    document.querySelectorAll('[data-tab]').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    await screens[name].init(view, params);
  } catch (error) {
    console.error(error);
    view.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'error',
      textContent: `画面を表示できませんでした：${error.message}`,
    }));
  }
}

async function start() {
  await db.seedMuscles(MUSCLES);
  await db.seedExercises(CARDIO_EXERCISES);
  initRecordEditor();
  initBanners();
  window.addEventListener('hashchange', render);
  await render();
  await refreshBanners();
  requestPersistence();
  registerServiceWorker(showUpdateBanner);
}

start();
