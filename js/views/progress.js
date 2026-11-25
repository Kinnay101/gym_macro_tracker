// Fortschritt: 1RM-Verlauf, Bestwerte, Sätze pro Muskel; Umschalter zu Freunde & Rangliste. Der Kalender (calendar) wird von der Trainingsseite angezeigt.
import { esc, num, today, addDays, parseKey, dayKey, daysBetween, icon, I } from '../util.js';
import { t, monthName, shortDate, weekdayHeaders } from '../i18n.js';
import { historyFor, bestFor, setsPerMuscle } from '../workout.js';
import { MUSCLES, dayPlan, planShort } from '../plan.js';
import { header, seg, lineChart } from '../ui.js';
import * as friendsView from './friends.js';
import { healthWorkoutsBetween } from '../health.js';
import * as daySheet from './daySheet.js';

let tab = 'me';
let exName = null;
let monthOffset = 0;

function exerciseNames(state) {
  const names = new Set();
  for (const w of state.workouts) for (const e of w.exercises) names.add(e.name);
  return [...names].sort();
}

export function render(state, params, ctx) {
  return `${header(t('nav.progress'))}
    ${seg('tab', [['me', t('progress.me')], ['friends', t('progress.friends')]], tab)}
    ${tab === 'me' ? me(state) : friendsView.render(state, ctx)}`;
}

function me(state) {
  const names = exerciseNames(state);
  // Standard: die Übung mit den meisten Trainings (dann gibt es am ehesten eine Kurve)
  if (!names.includes(exName)) {
    exName = [...names].sort((a, b) => historyFor(state, b).length - historyFor(state, a).length)[0] || null;
  }
  const hist = exName ? historyFor(state, exName) : [];
  const pts = hist.map((h) => ({ x: daysBetween(hist[0].date, h.date), y: h.e1rm, label: shortDate(h.date) }));
  const chart = names.length
    ? `<select class="input" data-in="ex" aria-label="${esc(t('progress.exercise'))}">${names.map((n) => `<option ${n === exName ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
       ${lineChart(pts, { unit: '' })}<div class="tiny muted">${esc(t('progress.e1rmHint'))}</div>`
    : `<div class="empty">${esc(t('progress.noData'))}</div>`;

  const prs = names.map((n) => ({ n, b: bestFor(state, n) })).filter((x) => x.b)
    .sort((a, b) => b.b.date.localeCompare(a.b.date)).slice(0, 6);

  const key = today();
  const spm = setsPerMuscle(state, addDays(key, -6), key);
  const maxSets = Math.max(10, ...Object.values(spm));

  return `
    <section class="card"><h3>${esc(t('progress.e1rm'))}</h3>${chart}</section>
    <section class="card tight"><h3>${esc(t('progress.prs'))}</h3>
      ${prs.length ? `<div class="list">${prs.map(({ n, b }) => `<div class="item"><div class="grow"><div class="ellipsis" style="font-weight:600">${esc(n)}</div>
        <div class="meta">${num(b.kg, 2)} kg × ${num(b.reps)} · ${esc(shortDate(b.date))}</div></div><span style="font-weight:700">${num(b.e1rm, 1)} kg</span></div>`).join('')}</div>`
        : `<div class="small muted">${esc(t('progress.noData'))}</div>`}
    </section>
    <section class="card tight"><div class="card-head"><h3>${esc(t('progress.setsPerMuscle'))}</h3><span class="tiny muted">${esc(t('progress.last7'))}</span></div>
      ${MUSCLES.map((m) => `<div class="bar-row"><div class="top"><span>${esc(t('m.' + m))}</span><span class="muted">${num(spm[m] || 0)}</span></div><div class="bar"><i style="width:${((spm[m] || 0) / maxSets) * 100}%;background:var(--accent)"></i></div></div>`).join('')}
    </section>`;
  // Kalender steht unter Training (calendar() wird dort benutzt)
}

const MONTHS_AHEAD = 3;

/**
 * Kalender: vergangene Tage wie erfasst (Training = grün gefüllt, Cardio = Punkt), ab heute der Plan
 * (Kürzel des Trainings, Ruhetage blass, geplantes Cardio = Ring). Verpasste Trainings seit Planbeginn sind durchgestrichen.
 * Jeder Tag lässt sich antippen → Tagesübersicht mit Plan (ändern, verschieben, Cardio).
 */
export function calendar(state) {
  const nowKey = today();
  const now = parseKey(nowKey);
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  const strength = new Map(state.workouts.map((w) => [w.date, w]));
  const cardio = new Set([...state.cardio.map((c) => c.date), ...healthWorkoutsBetween(state, '0000', '9999').filter((w) => w.kind !== 'strength').map((w) => w.date)]);
  const planStart = state.training?.anchor?.date || nowKey;
  let count = 0;
  let planned = 0;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= daysIn; d++) {
    const k = dayKey(new Date(first.getFullYear(), first.getMonth(), d));
    const w = strength.get(k);
    const p = state.training ? dayPlan(state, k) : null;
    let cls = 'c';
    let label = '';
    if (w) { count++; cls += ' k'; label = planShort(plans[w.planId]); }
    else if (p?.sick) { cls += ' sick'; label = '🤒'; }
    else if (p && (k >= nowKey || k >= planStart)) {
      if (p.shifted) { cls += ' rest'; label = '↷'; }
      else if (p.kind === 'train') { cls += k < nowKey ? ' miss' : ' plan'; label = planShort(plans[p.planId]); if (k >= nowKey) planned++; }
      else cls += ' rest';
    }
    if (k === nowKey) cls += ' today';
    const dot = cardio.has(k) ? '<i class="dot"></i>' : p && k >= nowKey && p.cardio.length ? '<i class="dot plan"></i>' : '';
    cells.push(`<button type="button" class="${cls}" data-act="day-open" data-d="${k}"><span>${d}</span>${label ? `<small>${esc(label)}</small>` : ''}${dot}</button>`);
  }
  // Immer 6 Wochenzeilen → der Kalender ist jeden Monat gleich hoch, die Pfeile springen beim Blättern nicht
  while (cells.length < 42) cells.push('<span class="c pad" aria-hidden="true"></span>');
  const sub = [count || monthOffset <= 0 ? t('progress.trainings', { n: count }) : '', planned ? t('progress.planned', { n: planned }) : ''].filter(Boolean).join(' · ');
  return `<section class="card tight">
    <div class="card-head"><button class="icon-btn" data-act="month" data-v="-1" aria-label="${esc(t('common.prev'))}">${icon(I.back)}</button>
      <div style="text-align:center"><h3>${esc(monthName(first))}</h3><div class="tiny muted" style="height:16px;line-height:16px;white-space:nowrap">${esc(sub)}${monthOffset !== 0 ? `${sub ? ' · ' : ''}<button type="button" class="link tiny" data-act="month-today">${esc(t('common.toToday'))}</button>` : ''}</div></div>
      <button class="icon-btn" data-act="month" data-v="1" ${monthOffset >= MONTHS_AHEAD ? 'disabled style="opacity:.35"' : ''} aria-label="${esc(t('common.next'))}">${icon(I.chevron)}</button></div>
    <div class="cal">${weekdayHeaders().map((h) => `<span class="h">${esc(h)}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-legend tiny muted">
      <span><i class="lg k"></i>${esc(t('progress.strength'))}</span><span><i class="lg plan"></i>${esc(t('progress.legendPlan'))}</span>
      <span><i class="lg miss"></i>${esc(t('progress.legendMissed'))}</span><span><i class="lgdot"></i>${esc(t('progress.cardio'))}</span><span><i class="lgdot plan"></i>${esc(t('progress.legendCardioPlan'))}</span><span><i class="lg sick"></i>${esc(t('progress.legendSick'))}</span>
    </div>
    <div class="tiny muted">${esc(t('progress.calHint'))}</div>
  </section>`;
}

/** Blättern im Kalender – auch von der Trainingsseite benutzt. */
export const calendarActions = {
  month(el, ctx) { monthOffset = Math.min(MONTHS_AHEAD, monthOffset + Number(el.dataset.v)); ctx.render(); },
  'month-today'(el, ctx) { monthOffset = 0; ctx.render(); },
};

export const actions = {
  ...friendsView.actions,
  ...daySheet.actions,
  tab(el, ctx) {
    tab = el.dataset.v;
    if (tab === 'friends') friendsView.load(ctx, { quiet: true });
    ctx.render();
  },
  ...calendarActions,
};
export const inputs = { ...daySheet.inputs };
export const changes = {
  ...daySheet.changes,
  ex(el, ctx) { exName = el.value; ctx.render(); },
};
