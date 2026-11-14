// Gráficas en SVG sin librerías (barras y líneas) con tooltip, más tabla plegable.

import { $, $$, esc } from "./dom.js";

export const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)} %`);
export const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fmtDia = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MES[m - 1]}`; };

function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function showTip(wrap, html, px, py) {
  let tip = $(".tip", wrap);
  if (!tip) { tip = document.createElement("div"); tip.className = "tip"; wrap.appendChild(tip); }
  tip.innerHTML = html;
  tip.style.display = "block";
  const w = tip.offsetWidth;
  const left = Math.min(Math.max(px - w / 2, 0), wrap.clientWidth - w);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(py - tip.offsetHeight - 12, -8)}px`;
}
function hideTip(wrap) { const t = $(".tip", wrap); if (t) t.style.display = "none"; }

/** Barras verticales de una sola serie. data: [{label, value, tip}] */
export function barChart(wrap, data, { height = 170 } = {}) {
  const W = wrap.clientWidth || 600;
  const P = { l: 30, r: 6, t: 10, b: 22 };
  const pw = W - P.l - P.r;
  const ph = height - P.t - P.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const slot = pw / data.length;
  const bw = Math.max(2, slot - 2); // 2px de separación entre barras
  const y = (v) => P.t + ph * (1 - v / top);
  const every = Math.ceil(data.length / Math.max(1, Math.floor(pw / 56)));
  let s = ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/>
    <text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("");
  data.forEach((d, i) => {
    const x = P.l + i * slot + (slot - bw) / 2;
    if (d.value > 0) s += `<path d="${barPath(x, y(d.value), bw, ph + P.t - y(d.value), 4)}" fill="var(--s1)"/>`;
    if (i % every === 0 || i === data.length - 1) {
      s += `<text x="${x + bw / 2}" y="${height - 6}" text-anchor="middle">${esc(d.label)}</text>`;
    }
    s += `<rect class="hit" data-i="${i}" x="${P.l + i * slot}" y="${P.t}" width="${slot}" height="${ph}" fill="transparent"/>`;
  });
  s += `<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ph}" y2="${P.t + ph}" stroke="var(--axis)"/>`;
  wrap.innerHTML = `<svg width="${W}" height="${height}" role="img">${s}</svg>`;
  $$(".hit", wrap).forEach((r) => {
    const i = +r.dataset.i;
    const enter = () => {
      $$(".hit", wrap).forEach((o) => o.setAttribute("fill", "transparent"));
      r.setAttribute("fill", "var(--accent-soft)");
      r.setAttribute("fill-opacity", ".5");
      showTip(wrap, data[i].tip, P.l + i * slot + slot / 2, y(data[i].value));
    };
    r.addEventListener("pointerenter", enter);
    r.addEventListener("pointerdown", enter);
  });
  wrap.onpointerleave = () => { hideTip(wrap); $$(".hit", wrap).forEach((o) => o.setAttribute("fill", "transparent")); };
}

/** Líneas 0–100 %. series: [{name, color, values: [0..1|null]}], labels: [string] */
export function lineChart(wrap, labels, series, { height = 210, fmt = pct, yMax = 1, ticks = [0, 0.25, 0.5, 0.75, 1] } = {}) {
  const W = wrap.clientWidth || 600;
  const endLabels = series.length > 1 && series.length <= 4 && W > 420;
  const P = { l: 40, r: endLabels ? 74 : 12, t: 12, b: 24 };
  const pw = W - P.l - P.r;
  const ph = height - P.t - P.b;
  const n = labels.length;
  const x = (i) => P.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v) => P.t + ph * (1 - v / yMax);
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 64)));
  let s = ticks.map((t) => `<line x1="${P.l}" x2="${P.l + pw}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/>
    <text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("");
  labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(l)}</text>`;
  });
  s += `<line class="xh" x1="0" x2="0" y1="${P.t}" y2="${P.t + ph}" stroke="var(--axis)" stroke-width="1" style="display:none"/>`;
  const ends = [];
  series.forEach((se) => {
    let d = "";
    let pen = false;
    se.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)}`;
      pen = true;
    });
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.values.forEach((v, i) => {
      if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`;
    });
    const li = se.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
    if (li != null) ends.push({ name: se.name, yy: y(se.values[li]), xx: x(li) });
  });
  if (endLabels) {
    ends.sort((a, b) => a.yy - b.yy);
    for (let k = 1; k < ends.length; k++) ends[k].yy = Math.max(ends[k].yy, ends[k - 1].yy + 14);
    ends.forEach((e) => { s += `<text class="lbl" x="${P.l + pw + 10}" y="${e.yy + 4}">${esc(e.name)}</text>`; });
  }
  s += `<rect class="ov" x="${P.l - 10}" y="${P.t}" width="${pw + 20}" height="${ph}" fill="transparent"/>`;
  wrap.innerHTML = `<svg width="${W}" height="${height}" role="img">${s}</svg>`;
  const ov = $(".ov", wrap);
  const xh = $(".xh", wrap);
  const move = (ev) => {
    const r = wrap.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / pw) * (n - 1))));
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.style.display = "";
    const rows = series.map((se) => `<div class="r"><span class="sw" style="background:${se.color}"></span>
      <span>${esc(se.name)}</span><span>${fmt(se.values[i])}</span></div>`).join("");
    const vals = series.map((se) => se.values[i]).filter((v) => v != null);
    showTip(wrap, `<b>${esc(labels[i])}</b>${rows}`, x(i), vals.length ? y(Math.max(...vals)) : P.t);
  };
  ov.addEventListener("pointermove", move);
  ov.addEventListener("pointerdown", move);
  wrap.onpointerleave = () => { hideTip(wrap); xh.style.display = "none"; };
}

export const legend = (series) => `<div class="legend-row">${series.map((s) =>
  `<span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("")}</div>`;

export const tabla = (head, rows) => `<details class="tabla"><summary>Ver tabla</summary><table class="tbl">
  <tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
  ${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></details>`;
