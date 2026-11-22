// Tagesübersicht: Antippen eines Tages (Woche unter «Heute», Kalender unter «Fortschritt») zeigt,
// was an dem Tag eingetragen wurde: Essen, Training, Cardio, Apple-Health-Werte, Gewicht.
import { esc, num, today, addDays, icon, I } from '../util.js';
import { t, longDate } from '../i18n.js';
import { goals, sumEntries, dayEntries, MEALS } from '../nutrition.js';
import { volume, workingSets } from '../workout.js';
import { healthWorkoutsBetween } from '../health.js';
import { energy } from '../ui.js';

let day = null;

const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')} h`;
const tile = (label, value, sub = '') => `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(label)}</span><b>${esc(value)}</b><span class="tiny muted">${esc(sub)}</span></div>`;

function sheet(state) {
  if (!day) return null;
  const d = day;
  const isToday = d === today();
  const head = `<div class="row between">
    <button class="icon-btn" data-act="day-step" data-v="-1" aria-label="${esc(t('common.prev'))}">${icon(I.back)}</button>
    <div style="text-align:center"><h2>${esc(longDate(d))}</h2>${isToday ? `<div class="tiny muted">${esc(t('common.today'))}</div>` : ''}</div>
    ${isToday ? `<button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button>`
      : `<button class="icon-btn" data-act="day-step" data-v="1" aria-label="${esc(t('common.next'))}">${icon(I.chevron)}</button>`}</div>`;
  const parts = [];

  // Essen
  const entries = dayEntries(state, d);
  if (entries.length) {
    const tot = sumEntries(entries);
    const g = goals(state);
    const meals = MEALS.map((m) => {
      const list = entries.filter((e) => e.meal === m);
      if (!list.length) return '';
      return `<div class="item"><div class="grow"><div style="font-weight:600">${esc(t('meal.' + m))}</div><div class="meta">${esc(list.map((e) => e.name).join(', '))}</div></div>
        <span class="small muted">${energy(state, list.reduce((s, e) => s + e.n.kcal, 0))}</span></div>`;
    }).join('');
    parts.push(`<section class="card tight"><div class="card-head"><h3>${esc(t('nav.food'))}</h3><a class="link" href="#/food?date=${esc(d)}">${esc(t('day.openFood'))}</a></div>
      <div class="grid3">${tile('kcal', `${energy(state, tot.kcal)}`, `/ ${energy(state, g.kcal)}`)}${tile(t('n.p'), `${num(tot.p)} g`, `/ ${num(g.p)} g`)}${tile(`${t('n.c')} · ${t('n.f')}`, `${num(tot.c)} · ${num(tot.f)} g`)}</div>
      <div class="list">${meals}</div></section>`);
  }

  // Training + Cardio
  const rows = [];
  for (const w of state.workouts.filter((x) => x.date === d)) {
    const plan = state.plans.find((p) => p.id === w.planId);
    const sets = w.exercises.reduce((s, ex) => s + workingSets(ex).length, 0);
    rows.push(`<div class="item">${icon(I.check)}<div class="grow"><div style="font-weight:600">${esc(plan?.name || t('training.workout'))}</div>
      <div class="meta">${esc(t('training.exCount', { n: w.exercises.length }))} · ${num(sets)} ${esc(t('day.sets'))} · ${num(volume(w))} kg</div></div></div>`);
  }
  for (const c of state.cardio.filter((x) => x.date === d)) {
    rows.push(`<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div><div class="meta">${num(c.minutes)} min${c.km ? ` · ${num(c.km, 1)} km` : ''}</div></div></div>`);
  }
  for (const w of healthWorkoutsBetween(state, d, d)) {
    rows.push(`<div class="item">⌚<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + w.kind))}</div><div class="meta">${num(w.minutes)} min${w.kcal ? ` · ${energy(state, w.kcal)}` : ''}</div></div></div>`);
  }
  if (rows.length) parts.push(`<section class="card tight"><h3>${esc(t('nav.training'))}</h3><div class="list">${rows.join('')}</div></section>`);

  // Apple Health + Körper
  const h = state.healthDays?.[d] || {};
  const night = state.healthSleep?.[d];
  const weight = state.weights.find((w) => w.date === d);
  const measure = (state.measures || []).find((m) => m.date === d);
  const bf = h.bodyFat ?? measure?.bf;
  const tiles = [];
  if (h.steps != null) tiles.push(tile(t('health.steps'), num(h.steps)));
  if (h.activeKcal != null) tiles.push(tile(t('health.active'), energy(state, h.activeKcal)));
  if (h.exerciseMin != null) tiles.push(tile(t('health.exercise'), `${num(h.exerciseMin)} min`));
  if (night) tiles.push(tile(t('health.sleep'), hm(night.minutes), night.deep || night.rem ? `${t('health.deep')} ${hm(night.deep)} · REM ${hm(night.rem)}` : ''));
  if (weight) tiles.push(tile(t('body.weight'), `${num(weight.kg, 1)} kg`, weight.source === 'health' ? 'Apple Health' : ''));
  if (bf != null) tiles.push(tile(t('measure.bf'), `${num(bf, 1)} %`));
  if (tiles.length) parts.push(`<section class="card tight"><h3>${esc(t('day.body'))}</h3><div class="grid3">${tiles.join('')}</div></section>`);

  if (!parts.length) {
    parts.push(`<div class="empty">${esc(t('day.nothing'))}</div>
      <a class="btn" href="#/food?date=${esc(d)}">${esc(t('day.openFood'))}</a>`);
  }
  return `${head}${parts.join('')}`;
}

export function open(ctx, date) { day = date; ctx.openSheet(sheet); }

export const actions = {
  'day-open'(el, ctx) { open(ctx, el.dataset.d); },
  'day-step'(el, ctx) {
    const next = addDays(day, Number(el.dataset.v));
    if (next > today()) return;
    day = next;
    ctx.refreshSheet();
    const s = document.querySelector('#sheet-root .sheet');
    if (s) s.scrollTop = 0;
  },
};
