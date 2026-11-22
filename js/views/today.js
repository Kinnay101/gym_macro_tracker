// Heute: Kalorien & Makros, heutiges Training, Woche, Mahlzeiten, Gewicht
import { esc, num, today, addDays, weekStart, parseKey, icon, I } from '../util.js';
import { t, weekdayShort, longDate } from '../i18n.js';
import { goals, sumEntries, dayEntries, MEALS, currentWeight } from '../nutrition.js';
import { schedule, planMuscles } from '../plan.js';
import { startWorkout } from '../workout.js';
import { lastNight, healthWorkoutsBetween } from '../health.js';
import { header, ring, bar, energy, energyUnit } from '../ui.js';
import * as daySheet from './daySheet.js';

let showEaten = false;

export function render(state) {
  const key = today();
  const g = goals(state);
  const entries = dayEntries(state, key);
  const tot = sumEntries(entries);
  const left = g.kcal - tot.kcal;

  const ringHtml = showEaten
    ? ring(tot.kcal, g.kcal, energy(state, tot.kcal, false), t('today.ofGoal', { goal: energy(state, g.kcal) }), 'toggle-ring')
    : ring(tot.kcal, g.kcal, energy(state, Math.abs(left), false), left >= 0 ? t('today.left', { unit: energyUnit(state) }) : t('today.over', { unit: energyUnit(state) }), 'toggle-ring');

  return `
    ${header(t('nav.today'), longDate(key), `<a class="head-btn" href="#/body" aria-label="${esc(t('nav.body'))}">${icon(I.user)}</a>`)}
    <section class="card ring-card" aria-label="${esc(t('today.macros'))}">
      ${ringHtml}
      <div class="macros">
        ${bar(t('n.p'), tot.p, g.p, 'var(--protein)')}
        ${bar(t('n.c'), tot.c, g.c, 'var(--carbs)')}
        ${bar(t('n.f'), tot.f, g.f, 'var(--fat)')}
      </div>
    </section>
    ${g.isDefault ? `<a class="card tight" href="#/body"><span class="small">${esc(t('today.setGoals'))}</span></a>` : ''}
    ${trainingCard(state, key)}
    ${weekCard(state, key)}
    ${healthCard(state, key)}
    ${mealsCard(state, key, entries)}
    ${weightCard(state)}
  `;
}

function trainingCard(state, key) {
  if (state.active) {
    const plan = state.plans.find((p) => p.id === state.active.planId);
    return `<section class="card"><div class="card-head"><div><div class="tiny muted">${esc(t('today.running'))}</div><h2>${esc(plan?.name || '')}</h2></div>
      <a class="btn primary" href="#/active">${esc(t('today.continue'))}</a></div></section>`;
  }
  const [d] = schedule(state, key, 3);
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  if (d.kind === 'done') {
    return `<section class="card"><div class="tiny muted">${esc(t('today.doneToday'))}</div><div class="row between"><h2>${esc(plans[d.planId]?.name || t('training.workout'))}</h2>${icon(I.check)}</div></section>`;
  }
  if (d.kind === 'rest') {
    return `<section class="card"><div class="tiny muted">${esc(t('today.suggested'))}</div><h2>${esc(t('training.rest'))}</h2>
      <div class="small muted">${esc(t('today.restHint'))}</div><a class="link" href="#/training">${esc(t('today.toTraining'))}</a></section>`;
  }
  const p = plans[d.planId];
  const muscles = planMuscles(p).map((m) => t('m.' + m)).join(' · ');
  const optional = p.ex.filter((e) => e.optional).length;
  return `<section class="card">
    <div class="tiny muted">${esc(t('today.suggested'))} · ${esc(rhythmName(state))}</div>
    <div class="card-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc(muscles)}</div>
      <div class="tiny muted" style="margin-top:4px">${esc(t('training.exCount', { n: p.ex.length }))}${optional ? ' · ' + esc(t('training.optCount', { n: optional })) : ''}</div></div>
      <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>
  </section>`;
}

export function rhythmName(state) {
  const r = state.profile.rhythm;
  return state.profile.rhythmNames?.[r] || t('rhythm.' + r);
}

function weekCard(state, key) {
  const start = weekStart(key);
  const plan = schedule(state, key, 7);
  const byDate = Object.fromEntries(plan.map((p) => [p.date, p]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const trained = state.workouts.some((w) => w.date === d);
    const cardio = state.cardio.some((c) => c.date === d) || healthWorkoutsBetween(state, d, d).some((w) => w.kind !== 'strength');
    let cls = '';
    if (trained) cls = 'done';
    else if (d === key) cls = 'today';
    else if (d < key || byDate[d]?.kind === 'rest') cls = 'rest';
    const inner = `<span style="${d === key ? 'color:var(--accent)' : ''}">${esc(weekdayShort(d))}</span><span class="c ${cls}">${parseKey(d).getDate()}</span><span class="dot ${cardio ? 'on' : ''}"></span>`;
    // Vergangene Tage und heute antippbar → Tagesübersicht
    days.push(d <= key ? `<button type="button" class="d" data-act="day-open" data-d="${esc(d)}" aria-label="${esc(longDate(d))}">${inner}</button>` : `<div class="d">${inner}</div>`);
  }
  return `<section class="card"><div class="card-head"><h3>${esc(t('today.week'))}</h3><span class="tiny muted">${esc(t('today.weekLegend'))}</span></div><div class="week">${days.join('')}</div></section>`;
}

/** Schritte, aktive kcal, Schlaf und Watch-Workouts aus Apple Health (nur wenn Daten da sind). */
function healthCard(state, key) {
  const days = state.healthDays || {};
  const has = (x) => x && (x.steps != null || x.activeKcal != null || x.exerciseMin != null);
  const d = has(days[key]) ? key : (has(days[addDays(key, -1)]) ? addDays(key, -1) : null);
  const night = lastNight(state);
  const ws = healthWorkoutsBetween(state, key, key);
  if (!d && !night && !ws.length) return '';
  const h = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
  const tiles = [];
  if (d && days[d].steps != null) tiles.push([t('health.steps'), num(days[d].steps), d === key ? t('common.today') : t('health.yesterday')]);
  if (d && days[d].activeKcal != null) tiles.push([t('health.active'), energy(state, days[d].activeKcal), d === key ? t('common.today') : t('health.yesterday')]);
  if (d && days[d].exerciseMin != null) tiles.push([t('health.exercise'), `${num(days[d].exerciseMin)} min`, days[d].distanceKm ? `${num(days[d].distanceKm, 1)} km` : '']);
  if (night) tiles.push([t('health.sleep'), h(night.minutes), night.deep || night.rem ? `${t('health.deep')} ${h(night.deep)} · REM ${h(night.rem)}` : '']);
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('health.title'))}</h3><span class="tiny muted">Apple Health</span></div>
    <div class="grid3">${tiles.map(([l, v, sub]) => `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(l)}</span><b>${esc(v)}</b><span class="tiny muted">${esc(sub)}</span></div>`).join('')}</div>
    ${ws.map((w) => `<div class="small muted">⌚ ${esc(t('cardio.' + w.kind))} · ${num(w.minutes)} min${w.kcal ? ` · ${energy(state, w.kcal)}` : ''}${w.avgHr ? ` · Ø ${w.avgHr} bpm` : ''}</div>`).join('')}
  </section>`;
}

function mealsCard(state, key, entries) {
  const rows = MEALS.map((m) => {
    const list = entries.filter((e) => e.meal === m);
    const kcal = list.reduce((s, e) => s + e.n.kcal, 0);
    const names = list.map((e) => e.name).join(', ') || t('food.nothingYet');
    return `<div class="item"><a class="grow" href="#/food" style="color:inherit"><div style="font-weight:600">${esc(t('meal.' + m))}</div><div class="meta ellipsis">${esc(names)}</div></a>
      <span class="small muted">${list.length ? energy(state, kcal) : '–'}</span>
      <a class="icon-btn" href="#/food/add?meal=${m}" aria-label="${esc(t('food.addTo', { meal: t('meal.' + m) }))}">${icon(I.plus)}</a></div>`;
  }).join('');
  return `<section class="card tight"><h3>${esc(t('today.meals'))}</h3><div class="list">${rows}</div></section>`;
}

function weightCard(state) {
  const kg = currentWeight(state);
  return `<a class="card tight" href="#/body" style="color:inherit"><div class="row between"><div><div class="tiny muted">${esc(t('body.weight'))}</div>
    <div class="big">${kg ? num(kg, 1) + ' kg' : '–'}</div></div><span class="link">${esc(kg ? t('body.addWeight') : t('body.firstWeight'))}</span></div></a>`;
}

export const actions = {
  ...daySheet.actions,
  'toggle-ring'(el, ctx) { showEaten = !showEaten; ctx.render(); },
  start(el, ctx) {
    ctx.update((s) => startWorkout(s, el.dataset.plan), { silent: true });
    ctx.go('active');
  },
};
