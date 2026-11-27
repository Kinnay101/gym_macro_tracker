// Heute: Kalorien & Makros, heutiges Training, Woche, Mahlzeiten, Gewicht
import { esc, num, today, weekStart, icon, I } from '../util.js';
import { t, longDate, shortDate } from '../i18n.js';
import { goals, sumEntries, dayEntries, MEALS, currentWeight } from '../nutrition.js';
import { schedule, planMuscles, activeSplit } from '../plan.js';
import { startWorkout } from '../workout.js';
import { healthWorkoutsBetween, isIOS, runShortcut } from '../health.js';
import * as hc from '../healthConnect.js';
import { header, ring, bar, energy, energyUnit, healthSourceName } from '../ui.js';
import * as daySheet from './daySheet.js';
import * as cardioEdit from './cardioEdit.js';
import * as planPreview from './planPreview.js';
import { weekRow } from './progress.js';

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
    ${header(t('nav.today'), longDate(key), `<a class="head-btn" href="#/profile" aria-label="${esc(t('profile.title'))}">${icon(I.user)}</a>`)}
    <section class="card ring-card" aria-label="${esc(t('today.macros'))}">
      ${ringHtml}
      <div class="macros">
        ${bar(t('n.p'), tot.p, g.p, 'var(--protein)')}
        ${bar(t('n.c'), tot.c, g.c, 'var(--carbs)')}
        ${bar(t('n.f'), tot.f, g.f, 'var(--fat)')}
      </div>
    </section>
    ${g.isDefault ? `<a class="card tight" href="#/body" style="color:inherit"><span class="small hint">${esc(t('today.setGoals'))}</span></a>` : ''}
    ${weightNotice(state, g)}
    ${trainingCard(state, key)}
    ${weekCard(state, key)}
    ${healthCard(state, key)}
    ${mealsCard(state, key, entries)}
    ${weightCard(state)}
  `;
}

/**
 * Gewicht kam aus Apple Health / Health Connect und hat das (automatische) Tagesziel verändert → einmal Bescheid geben,
 * damit sich die Ziele nicht unbemerkt ändern. Ohne Änderung oder nach 3 Tagen: nichts.
 */
function weightNotice(state, g) {
  const n = state.healthWeightNew;
  if (!n || state.profile.goalOverride || g.isDefault) return '';
  if (Date.now() - new Date(n.at).getTime() > 3 * 86400000) return '';
  const old = { ...state, weights: state.weights.filter((w) => w.date !== n.date).concat(n.replaced ? [n.replaced] : []) };
  const prev = goals(old);
  if (prev.isDefault || Math.abs(prev.kcal - g.kcal) < 10) return '';
  return `<section class="card tight"><div class="row" style="gap:8px;align-items:flex-start"><div class="hint small grow">${esc(t('today.weightGoal', { kg: num(n.kg, 1), src: healthSourceName(), kcal: energy(state, g.kcal), before: energy(state, prev.kcal) }))}</div>
    <button class="icon-btn" data-act="weight-notice-ok" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button></div></section>`;
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
  const cardioLine = cardioEdit.cardioLine(state, key);
  if (d.kind === 'rest') {
    return `<section class="card"><div class="tiny muted">${esc(t('today.suggested'))} · ${esc(rhythmName(state))}</div><h2>${esc(d.sick ? `🤒 ${t('plan.sick')}` : d.shifted ? t('plan.pause') : t('training.rest'))}</h2>
      <div class="small muted">${esc(d.sick ? t('today.sickHint') : d.shifted ? t('plan.shiftedHint') : t('today.restHint'))}</div>${cardioLine}<a class="link" href="#/training">${esc(t('today.toTraining'))}</a></section>`;
  }
  const p = plans[d.planId];
  const muscles = planMuscles(p).map((m) => t('m.' + m)).join(' · ');
  const optional = p.ex.filter((e) => e.optional).length;
  return `<section class="card">
    <div class="tiny muted">${esc(t('today.suggested'))} · ${esc(rhythmName(state))}</div>
    <div class="card-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc(muscles)}</div>
      <div class="tiny muted" style="margin-top:4px">${esc(t('training.exCount', { n: p.ex.length }))}${optional ? ' · ' + esc(t('training.optCount', { n: optional })) : ''}</div>
      <button type="button" class="link small plan-peek" data-act="plan-preview" data-plan="${esc(p.id)}">${esc(t('preview.show'))}</button></div>
      <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>
    ${cardioLine}
  </section>`;
}

/** Name des aktiven Splits (Standard-Splits ohne eigenen Namen: „Volle Woche“ / „Locker“). */
export function rhythmName(state) { return splitName(activeSplit(state)); }
export function splitName(sp) {
  if (!sp) return '';
  return sp.name || (sp.id === 'full' || sp.id === 'light' ? t('rhythm.' + sp.id) : t('split.unnamed'));
}

// Diese Woche = gleiche Kacheln wie der Kalender unter Training (Kürzel, geplant, verpasst, krank, Cardio)
function weekCard(state, key) {
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('today.week'))}</h3><a class="link tiny" href="#/training">${esc(t('today.toCalendar'))}</a></div>${weekRow(state, weekStart(key))}</section>`;
}

/** Schritte, aktive kcal, Training, Schlaf und Uhr-Workouts – immer nur vom aktuellen Tag (Schlaf = Nacht auf heute).
 *  Noch keine Werte von heute (z. B. vor dem Morgen-Abgleich) → "–". Ohne Verbindung zu Apple Health/Health Connect keine Karte. */
function healthCard(state, key) {
  const day = state.healthDays?.[key] || {};
  const night = state.healthSleep?.[key] || null;
  const ws = healthWorkoutsBetween(state, key, key);
  const connected = !!state.healthLastImport || hc.available();
  const hasToday = day.steps != null || day.activeKcal != null || day.exerciseMin != null || night || ws.length;
  if (!connected && !hasToday) return '';
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const h = (m) => `${hm(m)} h`;
  const tiles = [
    [t('health.steps'), day.steps != null ? num(day.steps) : '–', ''],
    [t('health.active'), day.activeKcal != null ? energy(state, day.activeKcal) : '–', ''],
    [t('health.exercise'), day.exerciseMin != null ? `${num(day.exerciseMin)} min` : '–', day.distanceKm ? `${num(day.distanceKm, 1)} km` : ''],
    [t('health.sleep'), night ? h(night.minutes) : '–', night && (night.deep || night.rem) ? `${t('health.deep')} ${hm(night.deep)} · REM ${hm(night.rem)}` : ''], // kurz, damit es auch auf Android nicht umbricht
  ];
  // Aktualisieren: Android-App liest Health Connect, iPhone startet den Kurzbefehl
  const canRefresh = hc.available() || (isIOS() && state.healthLastImport);
  const refresh = canRefresh ? `<button class="link tiny" data-act="health-refresh" aria-label="${esc(t('health.refresh'))}">↻ ${esc(healthSourceName())}</button>` : `<span class="tiny muted">${esc(healthSourceName())}</span>`;
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('health.title'))}</h3>${refresh}</div>
    <div class="grid3">${tiles.map(([l, v, sub], i) => `<div class="stack" style="gap:2px;min-width:0${i === 3 ? ';grid-column:span 2' : ''}"><span class="tiny muted">${esc(l)}</span><b>${esc(v)}</b>${sub ? `<span class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</span>` : ''}</div>`).join('')}</div>
    ${staleHint(state) || (hasToday ? '' : `<div class="tiny muted">${esc(t(hc.available() && !state.healthLastImport ? 'hc.notConnected' : 'health.noToday'))}</div>`)}
    ${ws.map((w) => `<div class="small muted">⌚ ${esc(t('cardio.' + w.kind))} · ${num(w.minutes)} min${w.kcal ? ` · ${energy(state, w.kcal)}` : ''}${w.avgHr ? ` · Ø ${w.avgHr} bpm` : ''}</div>`).join('')}
  </section>`;
}

/** iPhone: Morgen-Kurzbefehl lief länger nicht (z. B. Health bei gesperrtem iPhone nicht lesbar) → Hinweis + Knopf. */
function staleHint(state) {
  const last = state.healthLastImport ? new Date(state.healthLastImport) : null;
  if (!last || !isIOS() || Date.now() - last.getTime() < 20 * 3600 * 1000) return '';
  const when = `${shortDate(dayKeyOf(last))} ${last.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`;
  return `<div class="hint small">${esc(t('health.stale', { when }))}</div>
    <button class="btn sm" data-act="health-refresh">↻ ${esc(t('health.fetchNow'))}</button>`;
}
const dayKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function mealsCard(state, key, entries) {
  const rows = MEALS.map((m) => {
    const list = entries.filter((e) => e.meal === m);
    const kcal = list.reduce((s, e) => s + e.n.kcal, 0);
    // „ · “ statt Komma: BLV-Namen enthalten selbst Kommas („Vollmilch, UHT“) – sonst lesen sich 3 Einträge wie 5
    const names = list.map((e) => e.name).join(' · ') || t('food.nothingYet');
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

export const inputs = { ...daySheet.inputs };
export const changes = { ...daySheet.changes };

export const actions = {
  ...daySheet.actions,
  ...planPreview.actions,
  'toggle-ring'(el, ctx) { showEaten = !showEaten; ctx.render(); },
  'weight-notice-ok'(el, ctx) { ctx.update((s) => { delete s.healthWeightNew; }); },
  async 'health-refresh'(el, ctx) {
    if (!hc.available()) { runShortcut(); return; }
    try { await hc.syncNow(); ctx.render(); ctx.toast(t('hc.synced')); } catch { ctx.toast(t('hc.error')); }
  },
  start(el, ctx) {
    ctx.update((s) => startWorkout(s, el.dataset.plan), { silent: true });
    ctx.go('active');
  },
};
