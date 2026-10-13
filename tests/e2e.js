// アプリを iframe で開き、実際にボタンを押して一連の操作を確かめる。
// 注意：このブラウザのアプリのデータに、テスト用の種目と記録が追加される（新しいプロフィールで実行すること）。

const frame = document.querySelector('[data-ref="app"]');
const results = [];
const $ = (selector) => frame.contentDocument.querySelector(selector);
const ref = (name) => $(`[data-ref="${name}"]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check, label) {
  for (let i = 0; i < 100; i++) {
    try {
      const value = check();
      if (value) return value;
    } catch { /* まだ表示されていない */ }
    await sleep(50);
  }
  throw new Error(`待っても条件が満たされませんでした：${label}`);
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    throw error;
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

async function run() {
  if (!LOCAL_HOSTS.includes(location.hostname)) {
    throw new Error('公開先のデータを守るため、通しテストは Mac の localhost でだけ動きます。');
  }
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
  frame.src = '../index.html#/record';
  await loaded;

  await step('初回は「種目を選ぶ」が出る', async () => {
    await waitFor(() => !ref('empty').hidden, '空の状態');
  });

  await step('記録画面から種目を登録すると、その種目が選ばれた状態で戻る', async () => {
    frame.contentWindow.location.hash = '#/exercise/new?from=record';
    await waitFor(() => ref('name'), '種目編集画面');
    type(ref('name'), 'チェストプレス');
    const chest = [...frame.contentDocument.querySelectorAll('.check')].find((l) => l.textContent.includes('大胸筋'));
    chest.querySelector('input').click();
    ref('submit').click();
    await waitFor(() => ref('exercise-name')?.textContent === 'チェストプレス', '記録画面に種目名');
  });

  await step('前回記録がない種目は、前回欄なし・入力欄は空欄・記録ボタンは押せない', async () => {
    if (!ref('prev-section').hidden) throw new Error('前回欄が出ている');
    if (ref('weight').value !== '' || ref('reps').value !== '') throw new Error('入力欄が空欄でない');
    if (!ref('submit').disabled) throw new Error('記録ボタンが押せる');
  });

  await step('1セット記録すると「今日」に出て、入力欄はその値になる', async () => {
    type(ref('weight'), '40');
    type(ref('reps'), '10');
    $('[data-ref="difficulty"] [data-difficulty="3"]').click();
    ref('note').value = 'シート4';
    if (ref('submit').disabled) throw new Error(`記録ボタンが押せない：${ref('hint').textContent}`);
    ref('submit').click();
    await waitFor(() => ref('today-sets').children.length === 1, '今日の記録が1件');
    const row = ref('today-sets').textContent.replace(/\s+/g, '');
    if (!row.includes('①40kg×10回普通シート4')) throw new Error(`行の表示：${row}`);
    if (ref('weight').value !== '40' || ref('note').value !== '') throw new Error('入力欄の初期値が違う');
  });

  await step('＋ボタンで刻み幅（2.5kg）ずつ増える', async () => {
    ref('weight-plus').click();
    if (ref('weight').value !== '42.5') throw new Error(`重量：${ref('weight').value}`);
  });

  await step('100kgを超えると記録できない', async () => {
    type(ref('weight'), '101');
    $('[data-ref="difficulty"] [data-difficulty="4"]').click();
    if (!ref('submit').disabled) throw new Error('記録ボタンが押せる');
    if (!ref('hint').textContent.includes('0〜100kg')) throw new Error(ref('hint').textContent);
  });

  await step('記録をタップすると修正シートが開き、修正できる', async () => {
    ref('today-sets').querySelector('button').click();
    const editor = await waitFor(() => (ref('record-editor').open ? ref('record-editor') : null), '修正シート');
    type(ref('editor-weight'), '45');
    editor.querySelector('[type="submit"]').click();
    await waitFor(() => !ref('record-editor').open && ref('today-sets').textContent.includes('45'), '修正の反映');
  });

  await step('履歴に日付と種目が出る', async () => {
    frame.contentWindow.location.hash = '#/history';
    await waitFor(() => ref('list')?.textContent.includes('チェストプレス'), '履歴の一覧');
  });

  await step('履歴を「脚・お尻」で絞り込むと何も出ない', async () => {
    ref('filter').value = 'g:脚・お尻';
    ref('filter').dispatchEvent(new Event('change'));
    await waitFor(() => !ref('empty').hidden, '空の表示');
    ref('filter').value = '';
    ref('filter').dispatchEvent(new Event('change'));
  });

  await step('グラフに点が出る', async () => {
    frame.contentWindow.location.hash = '#/graph';
    await waitFor(() => ref('chart')?.querySelectorAll('.chart-dot').length === 1, 'グラフの点');
  });

  await step('設定に記録の件数と種目が出る', async () => {
    frame.contentWindow.location.hash = '#/settings';
    await waitFor(() => ref('record-count')?.textContent === '1件', '記録の件数');
    if (!ref('exercise-list').textContent.includes('チェストプレス')) throw new Error('種目一覧にない');
  });

  await step('記録がある種目は削除できず、非表示にできる', async () => {
    ref('exercise-list').querySelector('a').click();
    await waitFor(() => ref('title')?.textContent === '種目を編集', '編集画面');
    await waitFor(() => !ref('manage').hidden, '管理ボタン');
    if (!ref('delete').hidden) throw new Error('削除ボタンが出ている');
  });

  await step('種目の登録画面で「その他の筋肉」を追加すると、チェックされて筋肉リストにも残る', async () => {
    frame.contentWindow.location.hash = '#/exercise/new';
    await waitFor(() => ref('title')?.textContent === '種目を登録', '登録画面');
    type(ref('name'), 'ケーブルプルオーバー');
    type(ref('new-muscle-name'), '前鋸筋');
    ref('add-muscle').click();
    if (ref('muscle-error').textContent !== '部位を選んでください') throw new Error('部位なしで追加できた');
    ref('new-muscle-group').value = '体幹';
    ref('add-muscle').click();
    const added = [...frame.contentDocument.querySelectorAll('.check')].find((l) => l.textContent.includes('前鋸筋'));
    if (!added?.querySelector('input').checked) throw new Error('追加した筋肉がチェックされていない');
    ref('submit').click();
    await waitFor(() => ref('record-count'), '設定画面に戻る');
    await waitFor(() => ref('muscle-groups').textContent.includes('前鋸筋'), '設定の筋肉一覧');
    await waitFor(() => ref('exercise-list').textContent.includes('ケーブルプルオーバー'), '種目一覧');
  });

  const muscleRow = (name) => [...ref('muscle-groups').querySelectorAll('.muscle-item')].find((li) => li.textContent.includes(name));
  const deletedRow = (name) => [...ref('deleted-muscles').querySelectorAll('.muscle-item')].find((li) => li.textContent.includes(name));
  const checkLabel = (name) => [...frame.contentDocument.querySelectorAll('.check')].find((l) => l.textContent.includes(name));

  await step('使っている筋肉は「使用中」で削除できず、使っていない筋肉は削除して戻せる', async () => {
    const chest = muscleRow('大胸筋');
    if (chest.querySelector('[data-field="used"]').hidden || !chest.querySelector('[data-field="delete"]').hidden) throw new Error('大胸筋が使用中になっていない');
    muscleRow('僧帽筋').querySelector('[data-field="delete"]').click();
    await waitFor(() => !muscleRow('僧帽筋') && deletedRow('僧帽筋'), '削除した筋肉に移る');
    deletedRow('僧帽筋').querySelector('[data-field="restore"]').click();
    await waitFor(() => muscleRow('僧帽筋') && ref('deleted-block').hidden, '一覧に戻る');
  });

  await step('削除した筋肉は登録画面に出ず、「その他の筋肉」で同じ名前を入れると戻る', async () => {
    muscleRow('脊柱起立筋').querySelector('[data-field="delete"]').click();
    await waitFor(() => deletedRow('脊柱起立筋'), '削除');
    frame.contentWindow.location.hash = '#/exercise/new';
    await waitFor(() => ref('title')?.textContent === '種目を登録', '登録画面');
    if (checkLabel('脊柱起立筋')) throw new Error('削除した筋肉が出ている');
    type(ref('name'), 'バックエクステンション');
    type(ref('new-muscle-name'), '脊柱起立筋');
    ref('add-muscle').click();
    if (!checkLabel('脊柱起立筋')?.querySelector('input').checked) throw new Error('戻した筋肉がチェックされていない');
    ref('submit').click();
    await waitFor(() => ref('record-count'), '設定画面に戻る');
    await waitFor(() => muscleRow('脊柱起立筋') && ref('deleted-block').hidden, '一覧に戻る');
  });

  await step('有酸素：「有酸素」で絞り込んでトレッドミルを選ぶと、時間・速度などの欄が出る', async () => {
    frame.contentWindow.location.hash = '#/record';
    await waitFor(() => ref('pick') && !ref('main').hidden, '記録画面');
    ref('pick').click();
    const chip = await waitFor(() => [...ref('group-chips').querySelectorAll('.chip')].find((c) => c.textContent === '有酸素'), '有酸素のチップ');
    chip.click();
    const names = [...ref('exercise-list').querySelectorAll('.exercise-item-name')].map((n) => n.textContent);
    if (names.join() !== 'エアロバイク,トレッドミル,リカンベントバイク') throw new Error(`有酸素の一覧が違う：${names}`);
    [...ref('exercise-list').querySelectorAll('.exercise-item')].find((b) => b.textContent.includes('トレッドミル')).click();
    await waitFor(() => ref('exercise-name').textContent === 'トレッドミル', 'トレッドミルを選択');
    await waitFor(() => ref('strength-fields').hidden && ref('cardio-steppers').querySelectorAll('input').length === 3, '時間・速度・傾斜の欄');
    if (ref('cardio-extras').querySelectorAll('input').length !== 2) throw new Error('距離・カロリーの欄がない');
    if (!ref('submit').disabled) throw new Error('時間なしで記録できる');
  });

  await step('有酸素：時間と辛さだけで記録でき、今日の欄に出る', async () => {
    const [time, speed] = ref('cardio-steppers').querySelectorAll('input');
    type(time, '30');
    ref('cardio-steppers').querySelectorAll('.step')[3].click(); // 速度の＋（0.5km/h）
    if (speed.value !== '0.5') throw new Error(`速度の＋が効かない：${speed.value}`);
    type(speed, '8');
    ref('difficulty').querySelector('[data-difficulty="3"]').click();
    if (ref('submit').disabled) throw new Error(`記録できない：${ref('hint').textContent}`);
    ref('submit').click();
    await waitFor(() => ref('today-sets').textContent.includes('30分 ・ 8km/h'), '今日の記録');
    if (time.value !== '30') throw new Error('入力欄が今の記録の値になっていない');
  });

  await step('有酸素：グラフで項目を切り替えられる', async () => {
    frame.contentWindow.location.hash = '#/graph';
    await waitFor(() => ref('metrics') && !ref('metrics').hidden, '項目ボタン');
    const labels = [...ref('metrics').querySelectorAll('button')].map((b) => b.textContent);
    if (labels.join() !== '時間,速度,傾斜,距離,カロリー') throw new Error(`項目が違う：${labels}`);
    await waitFor(() => ref('caption').textContent === 'その日の合計時間（分）', '時間の説明');
    ref('metrics').querySelectorAll('button')[1].click();
    await waitFor(() => ref('caption').textContent === 'その日の最大速度（km/h）' && ref('chart').querySelectorAll('.chart-dot').length === 1, '速度のグラフ');
    ref('metrics').querySelectorAll('button')[2].click();
    await waitFor(() => !ref('empty').hidden, '傾斜は記録がないので空');
  });

  await step('記録の直後に「取り消す」を押すと、その記録が消える', async () => {
    frame.contentWindow.location.hash = '#/record';
    await waitFor(() => ref('exercise-name')?.textContent === 'トレッドミル', 'トレッドミルの記録画面');
    ref('difficulty').querySelector('[data-difficulty="4"]').click();
    if (!ref('difficulty-hint').textContent.startsWith('きつい：会話がつらい')) throw new Error(`有酸素の目安が出ない：${ref('difficulty-hint').textContent}`);
    ref('submit').click();
    await waitFor(() => ref('today-sets').children.length === 2, '2回目の記録');
    await waitFor(() => !ref('toast-action').hidden, '取り消すボタン');
    ref('toast-action').click();
    await waitFor(() => ref('today-sets').children.length === 1, '取り消し後は1件');
  });

  await step('入力の途中でほかの画面へ移って戻っても、入力が残る', async () => {
    const [time] = ref('cardio-steppers').querySelectorAll('input');
    type(time, '45');
    type(ref('note'), '途中まで');
    frame.contentWindow.location.hash = '#/history';
    await waitFor(() => ref('mode-day'), '履歴画面');
    frame.contentWindow.location.hash = '#/record';
    await waitFor(() => ref('exercise-name')?.textContent === 'トレッドミル' && ref('note').value === '途中まで', '備考が戻る');
    if (ref('cardio-steppers').querySelector('input').value !== '45') throw new Error('時間が戻っていない');
  });

  await step('前回の行を押すと、その値が入力欄に入る', async () => {
    // 今日の記録を昨日に動かして「前回」にする
    ref('today-sets').querySelector('button').click();
    const editor = await waitFor(() => $('[data-ref="record-editor"][open]'), '修正シート');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    type(ref('editor-datetime'), `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}T10:00`);
    editor.querySelector('[type="submit"]').click();
    await waitFor(() => !ref('prev-section').hidden && ref('today-section').hidden, '前回の欄');
    type(ref('cardio-steppers').querySelector('input'), '10');
    ref('prev-sets').querySelector('button').click();
    if (ref('cardio-steppers').querySelector('input').value !== '30') throw new Error('前回の時間が入らない');
    if ($('[data-ref="record-editor"][open]')) throw new Error('修正シートが開いた');
  });

  frame.contentWindow.location.hash = '#/record';
  await waitFor(() => ref('exercise-name'), '記録画面に戻る');
}

run()
  .catch((error) => {
    if (results.length === 0) results.push({ name: '実行できませんでした', ok: false, detail: error.message });
  })
  .finally(() => {
    const list = document.querySelector('[data-ref="results"]');
    const template = document.querySelector('template[data-tpl="result"]');
    for (const r of results) {
      const item = template.content.firstElementChild.cloneNode(true);
      item.className = r.ok ? 'pass' : 'fail';
      item.querySelector('[data-field="mark"]').textContent = r.ok ? '✓' : '✗';
      item.querySelector('[data-field="name"]').textContent = r.name;
      item.querySelector('[data-field="detail"]').textContent = r.detail ?? '';
      list.append(item);
    }
    const failed = results.filter((r) => !r.ok).length;
    const summary = document.querySelector('[data-ref="summary"]');
    summary.textContent = failed ? `${results.length}件中 ${failed}件 失敗` : `${results.length}件すべて成功`;
  });
