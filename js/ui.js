// Wiederverwendbare Bausteine für die Ansichten.
import { esc, num, icon, I } from './util.js';
import { t } from './i18n.js';
import { kcalToKj } from './nutrition.js';
import { isUniTrack, trackBase } from './workout.js';

/** Symbol passend zur Cardio-Art (Velo, Schwimmen, Rudern, Treppe; Laufen/Gehen/Laufband/Crosstrainer = Läufer). */
export function cardioIcon(type) {
  const k = { bike: 'bike', swim: 'swim', row: 'row', stairs: 'stairs', other: 'pulse', hiit: 'pulse' }[type] || 'run';
  return icon(I[k] || I.run);
}

/** Anzeigename einer Übungs-Spur: einseitig mit Zusatz („Leg Curl · einseitig“). */
export const trackLabel = (key) => (isUniTrack(key) ? `${trackBase(key)} · ${t('active.uniShort')}` : key);

/** Energie in der gewählten Einheit (kcal oder kJ). */
export function energy(state, kcal, withUnit = true) {
  const kj = state.profile.energyUnit === 'kj';
  const v = num(Math.round(kj ? kcalToKj(kcal) : kcal));
  return withUnit ? `${v} ${kj ? 'kJ' : 'kcal'}` : v;
}
/** Kleines Herz: Wert stammt aus Apple Health bzw. Health Connect (nicht unbedingt von der Uhr) */
export function healthMark() { return '<span class="hk" title="Apple Health / Health Connect" aria-label="Health">♥︎</span>'; }
/** Name der Gesundheits-App des Geräts (Android: Health Connect, sonst Apple Health) */
export function healthSourceName() { return window.GymHC || /Android/i.test(navigator.userAgent) ? 'Health Connect' : 'Apple Health'; }
/** Quelle von Uhr-Workouts: iPhone „Apple Watch“, Android „Health Connect“ (Galaxy Watch, Fitbit, Garmin …). */
export function watchSourceName() { return window.GymHC || /Android/i.test(navigator.userAgent) ? 'Health Connect' : 'Apple Watch'; }
export function energyUnit(state) { return state.profile.energyUnit === 'kj' ? 'kJ' : 'kcal'; }

/** Seitenkopf. `subExtra` = fertiges HTML hinter der Unterzeile (z. B. Link „Zu heute“). */
export function header(title, sub = '', right = '', subExtra = '') {
  return `<header class="head"><div class="stack" style="gap:2px">${sub ? `<span class="sub">${esc(sub)}${subExtra}</span>` : ''}<h1>${esc(title)}</h1></div>${right}</header>`;
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
/** Liniengrafik; `points2` = optionale zweite Linie (z. B. rechte Seite), gleiche x-Werte. */
/** Runde Schrittweite für Achsen (1, 2, 2.5, 5 × 10ⁿ), so dass etwa `target` Abschnitte entstehen. */
export function niceStep(span, target = 3) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

/**
 * Säulen (z. B. pro Woche): bars = [{ v, label, top? }], v = null → keine Daten. goal = waagrechte Ziel-Linie.
 * fmt formatiert die Achsenwerte. `top` steht klein über der Säule (z. B. Anzahl Trainings).
 */
/**
 * Daten für die Werte-Anzeige beim Antippen/Ziehen (js/chartTouch.js): pro Punkt x/y im SVG, Titel, Wert(e).
 * Steht als JSON im Attribut data-pts am <svg>.
 */
const ptsAttr = (list) => esc(JSON.stringify(list.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), t: p.t, v: p.v, ...(p.y2 != null ? { y2: +p.y2.toFixed(1), v2: p.v2 } : {}) }))));

/**
 * Balkendiagramm. bars: [{ v, label, top?, dim?, tip? (Titel beim Antippen, sonst label), sub? (Zusatz) }].
 * valFmt = genauer Wert beim Antippen (die Achse zeigt gerundet, z. B. 8k).
 */
export function barChart(bars, { height = 150, goal = null, fmt = (v) => num(v), valFmt = null } = {}) {
  const W = 340; const H = height; const pad = { l: 40, r: 6, t: 14, b: 20 };
  const vals = bars.map((b) => b.v).filter((v) => v != null);
  if (!vals.length) return '';
  const max = Math.max(...vals, goal || 0) || 1;
  const step = niceStep(max, 3);
  const y1 = Math.ceil(max / step) * step;
  const sy = (v) => H - pad.b - (v / y1) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.min(26, slot * 0.6);
  const ticks = [];
  for (let v = 0; v <= y1 + step / 1000; v += step) ticks.push(v);
  const vf = valFmt || fmt;
  const pts = bars.map((b, i) => (b.v != null ? { x: pad.l + slot * i + slot / 2, y: sy(Math.max(0, b.v)), t: b.tip || b.label, v: vf(b.v) + (b.sub ? ` · ${b.sub}` : '') } : null)).filter(Boolean);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('progress.chart'))}" data-pts="${ptsAttr(pts)}" data-top="${pad.t}" data-bottom="${H - pad.b}">
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text x="2" y="${(sy(v) + 3).toFixed(1)}">${esc(fmt(v))}</text>`).join('')}
    ${bars.map((b, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const bar = b.v != null && b.v > 0 ? `<rect class="col${b.dim ? ' dim' : ''}" data-x="${cx.toFixed(1)}" x="${(cx - bw / 2).toFixed(1)}" y="${sy(b.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(0) - sy(b.v)).toFixed(1)}" rx="3"/>` : '';
      const top = b.top != null && b.v != null ? `<text x="${cx.toFixed(1)}" y="${(sy(b.v) - 4).toFixed(1)}" text-anchor="middle">${esc(b.top)}</text>` : '';
      return `${bar}${top}<text x="${cx.toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(b.label)}</text>`;
    }).join('')}
    ${goal ? `<line class="goal" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(goal).toFixed(1)}" y2="${sy(goal).toFixed(1)}"/>` : ''}
  </svg>`;
}

/**
 * Liniendiagramm. points: [{ x, y, label, tip? }], optional zweite Linie points2 (gleiche x, z. B. rechte Seite).
 * valFmt = Wert beim Antippen (Standard: 1 Nachkommastelle + unit).
 */
export function lineChart(points, { height = 160, unit = '', points2 = null, valFmt = null } = {}) {
  if (points.length < 2) return `<div class="empty">${esc(t('progress.needTwo'))}</div>`;
  const W = 340; const H = height; const pad = { l: 34, r: 8, t: 10, b: 20 };
  const xs = points.map((p) => p.x); const ys = [...points, ...(points2 || [])].map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = Math.min(...ys); let y1 = Math.max(...ys);
  if (y1 - y0 < 1) { y0 -= 1; y1 += 1; }
  // Achse auf runde Werte erweitern (z. B. 55 / 60 statt 53.6 / 58.8, Prüfbericht D9)
  const step = niceStep(y1 - y0);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  const dec = Number.isInteger(step) ? 0 : 1;
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (y) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const d = path(points);
  const ticks = [];
  for (let v = y0; v <= y1 + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const vf = valFmt || ((v) => `${num(v, 1)}${unit}`);
  const pts = points.map((p, i) => ({ x: sx(p.x), y: sy(p.y), t: p.tip || p.label, v: vf(p.y),
    ...(points2?.[i] ? { y2: sy(points2[i].y), v2: vf(points2[i].y) } : {}) }));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('progress.chart'))}" data-pts="${ptsAttr(pts)}" data-top="${pad.t}" data-bottom="${H - pad.b}">
    ${ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text x="2" y="${(sy(v) + 3).toFixed(1)}">${num(v, dec)}${unit}</text>`).join('')}
    <path class="line" d="${d}"/>
    ${points.map((p) => `<circle class="pt" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3"/>`).join('')}
    ${points2 ? `<path class="line alt" d="${path(points2)}"/>${points2.map((p) => `<circle class="pt alt" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3"/>`).join('')}` : ''}
    <text x="${pad.l}" y="${H - 4}">${esc(points[0].label)}</text>
    <text x="${W - pad.r}" y="${H - 4}" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>`;
}

// Umschalter (.seg): markiertes Feld als gleitender Hintergrund. Die Seite wird beim Umschalten neu gezeichnet →
// vorher Position merken, danach vom alten zum neuen Feld gleiten lassen.
const segKey = (s) => [...s.querySelectorAll('button')].map((b) => b.dataset.act + '=' + b.dataset.v).join('|');
export function segRects(root) {
  const m = new Map();
  root.querySelectorAll('.seg').forEach((s) => {
    const b = s.querySelector('button[aria-pressed="true"]');
    if (b) m.set(segKey(s), { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
  });
  return m;
}
export function placeSegs(root, prev) {
  root.querySelectorAll('.seg').forEach((s) => {
    const b = s.querySelector('button[aria-pressed="true"]');
    let ind = s.querySelector(':scope > .seg-ind');
    if (!b || !b.offsetWidth) { ind?.remove(); s.classList.remove('ind-on'); return; }
    if (!ind) { ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); s.prepend(ind); }
    s.classList.add('ind-on');
    const to = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
    const from = prev?.get(segKey(s));
    const set = (r) => { ind.style.transform = `translate(${r.x}px, ${r.y}px)`; ind.style.width = r.w + 'px'; ind.style.height = r.h + 'px'; };
    ind.style.transition = 'none';
    set(from || to);
    if (from && (from.x !== to.x || from.y !== to.y || from.w !== to.w)) {
      void ind.offsetWidth; // Startposition übernehmen, dann gleiten
      ind.style.transition = '';
      set(to);
    }
  });
}
