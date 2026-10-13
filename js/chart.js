// SVG の折れ線グラフ。入力は [{ date: 'YYYY-MM-DD', value }] だけで、データベースには触らない。
// 図形の位置を計算して作る必要があるため、例外としてここで SVG を組み立てる（アーキテクチャ設計書「7.1」）。

const NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 24 * 60 * 60 * 1000;

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

function dayTime(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// 目盛りの値（1, 2, 2.5, 5 × 10^n 刻み）
export function niceTicks(min, max, count = 4) {
  if (min === max) {
    min = Math.max(0, min - 5);
    max += 5;
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = low; v <= high + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function drawLineChart(svg, points, { selectedDate = null, onSelect } = {}) {
  svg.replaceChildren();
  const width = svg.clientWidth || 320;
  const height = svg.clientHeight || 220;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (points.length === 0) return;

  const pad = { left: 40, right: 16, top: 12, bottom: 28 };
  const times = points.map((p) => dayTime(p.date));
  const values = points.map((p) => p.value);
  let [t0, t1] = [Math.min(...times), Math.max(...times)];
  if (t0 === t1) [t0, t1] = [t0 - DAY_MS, t1 + DAY_MS];
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const [v0, v1] = [ticks[0], ticks.at(-1)];

  const x = (t) => pad.left + ((t - t0) / (t1 - t0)) * (width - pad.left - pad.right);
  const y = (v) => height - pad.bottom - ((v - v0) / (v1 - v0)) * (height - pad.top - pad.bottom);

  // 横の目盛り線と重量のラベル
  for (const v of ticks) {
    svgElement('line', { class: 'chart-grid', x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v) }, svg);
    svgElement('text', { class: 'chart-label', x: pad.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v;
  }

  // 日付のラベル（最初・真ん中・最後）
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  for (const i of labelIndexes) {
    const [, m, d] = points[i].date.split('-').map(Number);
    const lx = Math.min(width - pad.right - 14, Math.max(pad.left + 14, x(times[i])));
    svgElement('text', { class: 'chart-label', x: lx, y: height - 8, 'text-anchor': 'middle' }, svg).textContent = `${m}/${d}`;
  }

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i])},${y(p.value)}`).join(' ');
  svgElement('path', { class: 'chart-line', d }, svg);

  points.forEach((p, i) => {
    const selected = p.date === selectedDate;
    const cx = x(times[i]);
    const cy = y(p.value);
    svgElement('circle', { class: selected ? 'chart-dot is-selected' : 'chart-dot', cx, cy, r: selected ? 7 : 5 }, svg);
    // 指で押しやすいように、見えない大きな円で押した位置を拾う
    const hit = svgElement('circle', { class: 'chart-hit', cx, cy, r: 16 }, svg);
    hit.addEventListener('click', () => onSelect?.(p));
  });
}
