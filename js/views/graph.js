// S-5 グラフ画面（表示は views/graph.html）

import { drawLineChart } from '../chart.js';
import * as db from '../db.js';
import { CARDIO_FIELDS, KIND_FIELDS, dailyValues, formatDay, kindOf, periodStart, sortExercises } from '../domain.js';
import { openRecordEditor } from '../record-editor.js';
import { fill, fillExerciseSelect, ref, setRow, tpl } from '../ui.js';

// 画面を移っても選んだ状態を覚えておく。metric は種類ごとに、見ている項目
const state = { exerciseId: null, lastExerciseId: null, period: '3m', metric: {} };

// グラフにできる項目。筋トレは最大重量だけ、有酸素は記録項目から選ぶ
function metricsOf(kind) {
  if (kind === 'strength') return [{ key: 'weightKg', label: '重量', caption: 'その日の最大重量（kg）', total: false }];
  return KIND_FIELDS[kind].map((key) => {
    const f = CARDIO_FIELDS[key];
    const unit = f.unit ? `（${f.unit}）` : '';
    return { key, label: f.label, caption: `その日の${f.total ? '合計' : '最大'}${f.label}${unit}`, total: Boolean(f.total) };
  });
}

export async function init(root) {
  const lastUsed = await db.lastPerformedMap();
  // 非表示にした種目も、記録があればグラフで見られるようにする
  const exercises = sortExercises((await db.listExercises()).filter((e) => !e.hidden || lastUsed.has(e.id)), lastUsed);
  // まだ1件も記録がなければ、空のグラフではなく案内を出す
  if (!exercises.some((e) => lastUsed.has(e.id))) {
    ref(root, 'no-exercise').hidden = false;
    ref(root, 'content').hidden = true;
    return;
  }
  // 記録画面で種目を選び直していたら、その種目を出す。そうでなければ前に見ていた種目のまま
  const lastId = await db.getMeta('lastExerciseId');
  if (lastId !== state.lastExerciseId && exercises.some((e) => e.id === lastId)) state.exerciseId = lastId;
  state.lastExerciseId = lastId;
  if (!exercises.some((e) => e.id === state.exerciseId)) state.exerciseId = exercises[0].id;

  const select = ref(root, 'exercise');
  const svg = ref(root, 'chart');
  const periodButtons = root.querySelectorAll('[data-period]');
  const metricBox = ref(root, 'metrics');
  let records = [];
  let selectedDate = null;
  let kind = 'strength';
  let metrics = [];

  const currentMetric = () => metrics.find((m) => m.key === state.metric[kind]) ?? metrics[0];

  function buildMetricButtons() {
    kind = kindOf(exercises.find((e) => e.id === state.exerciseId));
    metrics = metricsOf(kind);
    metricBox.hidden = metrics.length < 2;
    metricBox.replaceChildren(
      ...metrics.map((m) => {
        const button = fill(tpl('metric-button'), { label: m.label });
        button.dataset.metric = m.key;
        button.addEventListener('click', () => {
          state.metric[kind] = m.key;
          selectedDate = null;
          draw();
        });
        return button;
      }),
    );
  }

  fillExerciseSelect(select, exercises, state.exerciseId);
  select.addEventListener('change', () => {
    state.exerciseId = select.value;
    load();
  });
  periodButtons.forEach((button) =>
    button.addEventListener('click', () => {
      state.period = button.dataset.period;
      draw();
    }),
  );

  async function load() {
    records = await db.recordsOfExercise(state.exerciseId);
    selectedDate = null;
    buildMetricButtons();
    draw();
  }

  function draw() {
    periodButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === state.period)));
    const metric = currentMetric();
    metricBox.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === metric.key)));
    ref(root, 'caption').textContent = metric.caption;
    const points = dailyValues(records, metric.key, { total: metric.total, since: periodStart(state.period) });
    ref(root, 'empty').hidden = points.length > 0;
    // SVG 要素には hidden プロパティがないので、属性で隠す
    svg.toggleAttribute('hidden', points.length === 0);
    ref(root, 'tap-hint').hidden = points.length === 0;
    drawLineChart(svg, points, {
      selectedDate,
      onSelect: (point) => {
        selectedDate = point.date;
        draw();
      },
    });

    const day = points.find((p) => p.date === selectedDate);
    ref(root, 'detail').hidden = !day;
    if (day) {
      ref(root, 'detail-date').textContent = formatDay(day.date);
      ref(root, 'detail-sets').replaceChildren(...day.records.map((r, i) => setRow(r, i + 1, (rec) => openRecordEditor(rec, load), kind)));
    }
  }

  // 画面の向きが変わったら描き直す（別の画面に移ったら止める）
  const onResize = () => (svg.isConnected ? draw() : window.removeEventListener('resize', onResize));
  window.addEventListener('resize', onResize);

  await load();
}
