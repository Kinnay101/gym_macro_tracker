// Fortschritt: 1RM-Verlauf, Bestwerte, Sätze pro Muskel, Kalender; Umschalter zu Freunde & Rangliste
import { esc, num, today, addDays, parseKey, dayKey, daysBetween, icon, I } from '../util.js';
import { t, monthName, shortDate, weekdayHeaders } from '../i18n.js';
import { historyFor, bestFor, setsPerMuscle } from '../workout.js';
import { MUSCLES } from '../plan.js';
import { header, seg, lineChart } from '../ui.js';
import * as friendsView from './friends.js';
import { healthWorkoutsBetween } from '../health.js';

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
    </section>
    ${calendar(state)}`;
}

function calendar(state) {
  const now = parseKey(today());
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const strength = new Set(state.workouts.map((w) => w.date));
  const cardio = new Set([...state.cardio.map((c) => c.date), ...healthWorkoutsBetween(state, '0000', '9999').filter((w) => w.kind !== 'strength').map((w) => w.date)]);
  let count = 0;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= daysIn; d++) {
    const k = dayKey(new Date(first.getFullYear(), first.getMonth(), d));
    const s = strength.has(k);
    if (s) count++;
    cells.push(`<span class="c ${s ? 'k' : ''} ${k === today() ? 'today' : ''}">${d}${cardio.has(k) ? '<i class="dot"></i>' : ''}</span>`);
  }
  return `<section class="card tight">
    <div class="card-head"><button class="icon-btn" data-act="month" data-v="-1" aria-label="${esc(t('common.prev'))}">${icon(I.back)}</button>
      <div style="text-align:center"><h3>${esc(monthName(first))}</h3><div class="tiny muted">${esc(t('progress.trainings', { n: count }))}</div></div>
      <button class="icon-btn" data-act="month" data-v="1" ${monthOffset >= 0 ? 'disabled style="opacity:.35"' : ''} aria-label="${esc(t('common.next'))}">${icon(I.chevron)}</button></div>
    <div class="cal">${weekdayHeaders().map((h) => `<span class="h">${esc(h)}</span>`).join('')}${cells.join('')}</div>
    <div class="row tiny muted"><span class="tag pr">&nbsp;</span>${esc(t('progress.strength'))} <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:var(--cardio)"></span>${esc(t('progress.cardio'))}</div>
  </section>`;
}

export const actions = {
  ...friendsView.actions,
  tab(el, ctx) {
    tab = el.dataset.v;
    if (tab === 'friends') friendsView.load(ctx, { quiet: true });
    ctx.render();
  },
  month(el, ctx) { monthOffset = Math.min(0, monthOffset + Number(el.dataset.v)); ctx.render(); },
};
export const changes = {
  ex(el, ctx) { exName = el.value; ctx.render(); },
};
