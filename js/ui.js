// Wiederverwendbare Bausteine für die Ansichten.
import { esc, num, icon, I } from './util.js';
import { t } from './i18n.js';
import { kcalToKj } from './nutrition.js';

/** Energie in der gewählten Einheit (kcal oder kJ). */
export function energy(state, kcal, withUnit = true) {
  const kj = state.profile.energyUnit === 'kj';
  const v = num(Math.round(kj ? kcalToKj(kcal) : kcal));
  return withUnit ? `${v} ${kj ? 'kJ' : 'kcal'}` : v;
}
export function energyUnit(state) { return state.profile.energyUnit === 'kj' ? 'kJ' : 'kcal'; }

export function header(title, sub = '', right = '') {
  return `<header class="head"><div class="stack" style="gap:2px">${sub ? `<span class="sub">${esc(sub)}</span>` : ''}<h1>${esc(title)}</h1></div>${right}</header>`;
}

export function ring(value, max, centerVal, centerLbl, act = '') {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max;
  return `<button type="button" class="ring" ${act ? `data-act="${act}"` : ''} aria-label="${esc(centerVal + ' ' + centerLbl)}">
    <svg viewBox="0 0 168 168" aria-hidden="true">
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="var(--track)" stroke-width="14"/>
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="${over ? 'var(--bad)' : 'var(--accent)'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(frac * circ).toFixed(1)} ${circ.toFixed(1)}"/>
    </svg>
    <span class="center"><span class="val">${esc(centerVal)}</span><span class="lbl">${esc(centerLbl)}</span></span>
  </button>`;
}

export function bar(label, value, max, color, unit = 'g') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar-row"><div class="top"><span style="font-weight:600">${esc(label)}</span><span class="muted">${num(value)} / ${num(max)} ${unit}</span></div><div class="bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></div></div>`;
}

export function seg(name, options, value) {
  return `<div class="seg" role="group">${options.map(([v, label]) => `<button type="button" data-act="${name}" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(label)}</button>`).join('')}</div>`;
}

export function sheetHead(title) {
  return `<div class="row between"><h2>${esc(title)}</h2><button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button></div>`;
}

/** Kleine Liniengrafik (SVG). points: [{ x: Zahl, y: Zahl, label }] */
export function lineChart(points, { height = 160, unit = '' } = {}) {
  if (points.length < 2) return `<div class="empty">${esc(t('progress.needTwo'))}</div>`;
  const W = 340; const H = height; const pad = { l: 34, r: 8, t: 10, b: 20 };
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = Math.min(...ys); let y1 = Math.max(...ys);
  if (y1 - y0 < 1) { y0 -= 1; y1 += 1; }
  const span = y1 - y0; y0 -= span * 0.1; y1 += span * 0.1;
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (y) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('progress.chart'))}">
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text x="2" y="${(sy(v) + 3).toFixed(1)}">${num(v, 1)}${unit}</text>`).join('')}
    <path class="line" d="${d}"/>
    ${points.map((p) => `<circle class="pt" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3"/>`).join('')}
    <text x="${pad.l}" y="${H - 4}">${esc(points[0].label)}</text>
    <text x="${W - pad.r}" y="${H - 4}" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>`;
}
