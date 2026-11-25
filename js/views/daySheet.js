// Tagesübersicht: Antippen eines Tages (Woche unter «Heute», Kalender unter «Fortschritt») zeigt,
// was an dem Tag eingetragen wurde: Essen, Training, Cardio, Apple-Health-Werte, Gewicht – und den Plan des Tages
// (ändern, ab hier verschieben, Cardio planen; auch für kommende Tage).
import { esc, num, today, addDays, icon, I, parseNum } from '../util.js';
import { t, longDate } from '../i18n.js';
import { goals, sumEntries, dayEntries } from '../nutrition.js';
import { volume, workingSets } from '../workout.js';
import { healthWorkoutsBetween } from '../health.js';
import { energy, healthSourceName } from '../ui.js';
import * as planEdit from './planEdit.js';
import * as cardioEdit from './cardioEdit.js';
import { cardioSessions } from '../cardio.js';

const MAX_AHEAD = 90; // so weit kann man in die Zukunft blättern

let day = null;
let openWorkout = null; // aufgeklapptes Training (Übungen und Sätze sichtbar)

const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')} h`;
const tile = (label, value, sub = '') => `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(label)}</span><b>${esc(value)}</b><span class="tiny muted">${esc(sub)}</span></div>`;

function sheet(state) {
  if (!day) return null;
  const d = day;
  const isToday = d === today();
  const head = `<div class="row between day-head">
    <button class="icon-btn" data-act="day-step" data-v="-1" aria-label="${esc(t('common.prev'))}">${icon(I.back)}</button>
    <div style="text-align:center"><h2>${esc(longDate(d))}</h2>${isToday ? `<div class="tiny" style="color:var(--accent);font-weight:700">${esc(t('common.today'))}</div>` : `<button type="button" class="link tiny" data-act="day-today">${esc(t('common.toToday'))}</button>`}</div>
    ${d >= addDays(today(), MAX_AHEAD) ? `<button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button>`
      : `<button class="icon-btn" data-act="day-step" data-v="1" aria-label="${esc(t('common.next'))}">${icon(I.chevron)}</button>`}</div>`;
  const parts = [];
  const future = d > today();
  const planCard = planEdit.dayPlanCard(state, d);
  if (!future && d === today() && planCard) parts.push(planCard);

  // Essen
  const entries = dayEntries(state, d);
  if (entries.length) {
    const tot = sumEntries(entries);
    const g = goals(state);
    // Nur die vier Werte, alle gleich aufgebaut (Wert / Ziel); die einzelnen Mahlzeiten stehen im Tagebuch
    parts.push(`<section class="card tight"><div class="card-head"><h3>${esc(t('nav.food'))}</h3><a class="link" href="#/food?date=${esc(d)}">${esc(t('day.openFood'))}</a></div>
      <div class="grid2">${tile(t('n.kcal'), `${energy(state, tot.kcal)}`, `/ ${energy(state, g.kcal)}`)}${tile(t('n.p'), `${num(tot.p)} g`, `/ ${num(g.p)} g`)}
        ${tile(t('n.c'), `${num(tot.c)} g`, `/ ${num(g.c)} g`)}${tile(t('n.f'), `${num(tot.f)} g`, `/ ${num(g.f)} g`)}</div></section>`);
  }

  // Training + Cardio
  const rows = [];
  for (const w of state.workouts.filter((x) => x.date === d)) {
    const plan = state.plans.find((p) => p.id === w.planId);
    const sets = w.exercises.reduce((s, ex) => s + workingSets(ex).length, 0);
    const open = openWorkout === w.id;
    const mins = w.startedAt && w.finishedAt ? Math.round((new Date(w.finishedAt) - new Date(w.startedAt)) / 60000) : null;
    // Antippen klappt die Übungen mit allen Sätzen auf (W = Aufwärmsatz)
    const detail = open ? `<div class="list" style="padding:0 0 4px 30px">${w.exercises.map((ex) => `<div class="item" style="padding:6px 0"><div class="grow">
        <div class="small" style="font-weight:600">${esc(ex.name)}</div>
        <div class="meta">${ex.sets.map((s) => `${s.warmup ? 'W ' : ''}${num(s.kg, 2)} kg × ${num(s.reps)}`).join(' · ') || '–'}</div></div>
        <span class="tiny muted">${workingSets(ex).length}</span></div>`).join('')}
        ${w.note ? `<div class="small muted" style="padding-top:6px">${esc(w.note)}</div>` : ''}</div>` : '';
    rows.push(`<button type="button" class="item item-btn" data-act="day-workout" data-id="${esc(w.id)}" aria-expanded="${open}" style="width:100%;text-align:left">${icon(I.check)}<div class="grow"><div style="font-weight:600">${esc(plan?.name || t('training.workout'))}</div>
      <div class="meta">${esc(t('training.exCount', { n: w.exercises.length }))} · ${num(sets)} ${esc(t('day.sets'))} · ${num(volume(w))} kg${mins ? ` · ${num(mins)} min` : ''}</div></div>${icon(open ? I.down : I.chevron)}</button>${detail}`);
  }
  // Cardio: Uhr und von Hand zusammengeführt (dieselbe Einheit nur einmal, Uhr-Werte gelten; js/cardio.js)
  for (const c of cardioSessions(state, d, d)) {
    rows.push(`<div class="item">${c.source === 'watch' ? '⌚' : icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div><div class="meta">${num(c.minutes)} min${c.km ? ` · ${num(c.km, 1)} km` : ''}${c.kcal ? ` · ${energy(state, c.kcal)}` : ''}${c.avgHr ? ` · Ø ${c.avgHr} bpm` : ''}</div></div></div>`);
  }
  // Krafttraining nur von der Uhr (ohne Training in der App an diesem Tag)
  for (const w of healthWorkoutsBetween(state, d, d).filter((x) => x.kind === 'strength')) {
    rows.push(`<div class="item">⌚<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + w.kind))}</div><div class="meta">${num(w.minutes)} min${w.kcal ? ` · ${energy(state, w.kcal)}` : ''}</div></div></div>`);
  }
  if (rows.length) parts.push(`<section class="card tight"><h3>${esc(t('nav.training'))}</h3><div class="list">${rows.join('')}</div></section>`);
  // Vergangene Tage: geplantes Cardio, das noch offen ist (iPhone: „✓ Erledigt“, Android: kommt von der Uhr)
  if (d < today()) {
    const open = cardioEdit.plannedCardioList(state, d, { onlyOpen: true });
    if (open) parts.push(`<section class="card tight"><h3>${esc(t('cardio.plannedTitle'))}</h3><div class="list">${open}</div></section>`);
  }

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
  if (weight) tiles.push(tile(t('body.weight'), `${num(weight.kg, 1)} kg`, weight.source === 'health' ? healthSourceName() : ''));
  if (bf != null) tiles.push(tile(t('measure.bf'), `${num(bf, 1)} %`));
  if (tiles.length) parts.push(`<section class="card tight"><h3>${esc(t('day.body'))}</h3><div class="grid3">${tiles.join('')}</div></section>`);

  if (future) return `${head}${planCard}`;
  if (d < today() && planCard) parts.push(planCard);
  if (!parts.length) {
    parts.push(`<div class="empty">${esc(t('day.nothing'))}</div>
      <a class="btn" href="#/food?date=${esc(d)}">${esc(t('day.openFood'))}</a>`);
  }
  return `${head}${parts.join('')}`;
}

export function open(ctx, date) { day = date; ctx.openSheet(sheet); }

export const actions = {
  ...planEdit.actions,
  ...cardioEdit.actions,
  // Geplantes Cardio erledigt → Cardio-Fenster mit Art, Dauer und Datum vorausgefüllt; danach zurück zur Tagesübersicht
  'cardio-done'(el, ctx) {
    const { d, type, min } = el.dataset;
    const fromSheet = !!el.closest('#sheet-root');
    cardioEdit.openCardio(ctx, { date: d, type, minutes: parseNum(min) || null }, fromSheet ? () => open(ctx, d) : null);
  },
  'day-open'(el, ctx) { openWorkout = null; open(ctx, el.dataset.d); },
  'day-workout'(el, ctx) { openWorkout = openWorkout === el.dataset.id ? null : el.dataset.id; ctx.refreshSheet(); },
  'day-today'(el, ctx) {
    day = today();
    ctx.refreshSheet();
    const s = document.querySelector('#sheet-root .sheet');
    if (s) s.scrollTop = 0;
  },
  'day-step'(el, ctx) {
    const next = addDays(day, Number(el.dataset.v));
    if (next > addDays(today(), MAX_AHEAD)) return;
    day = next;
    ctx.refreshSheet();
    const s = document.querySelector('#sheet-root .sheet');
    if (s) s.scrollTop = 0;
  },
};

export const inputs = { ...planEdit.inputs };
export const changes = { ...planEdit.changes };
