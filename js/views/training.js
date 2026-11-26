// Training: Rhythmus, heutiger Vorschlag (flexibel), 7-Tage-Vorschau, Cardio, Pläne, Verlauf
import { esc, num, today, weekStart, addDays, icon, I, parseNum, uid } from '../util.js';
import { t, weekdayShort, shortDate } from '../i18n.js';
import { schedule, lastDone, planMuscles, CARDIO_TYPES, splitFor, indexOfPlan, restartAt, removeRestart, markDay } from '../plan.js';
import { startWorkout, volume, workingSets, setText } from '../workout.js';
import { header, seg, sheetHead, watchSourceName } from '../ui.js';
import { healthWorkoutsBetween, watchStatsFor } from '../health.js';
import { rhythmName } from './today.js';
import * as daySheet from './daySheet.js';
import * as planEdit from './planEdit.js';
import { calendar, calendarActions } from './progress.js';
import * as cardioEdit from './cardioEdit.js';
import { cardioSessions, cardioMinutes } from '../cardio.js';

export { CARDIO_TYPES };

let continueOther = true; // „Anderes Training“: Plan ab heute von diesem Training aus fortsetzen
let detailId = null;

// Oben „Übersicht | Plan“: täglich Gebrauchtes (Vorschlag, Kalender, Cardio, Verlauf) getrennt von selten Bearbeitetem
// (Splits, Cardio-Plan, Trainings)
const tabOf = (params) => (params?.tab === 'plan' ? 'plan' : 'overview');

export function render(state, params) {
  const key = today();
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  const tabs = seg('training-tab', [['overview', t('training.tabOverview')], ['plan', t('training.tabPlan')]], tabOf(params));
  if (tabOf(params) === 'plan') {
    return `${header(t('nav.training'))}${tabs}${planEdit.manageCards(state)}`;
  }
  const sched = schedule(state, key, 1);
  return `
    ${header(t('nav.training'))}
    ${tabs}
    ${todayCard(state, sched[0], plans)}
    ${calendar(state)}
    ${cardioCard(state, key)}
    ${historyCard(state, plans)}
  `;
}

function todayCard(state, d, plans) {
  if (state.active) {
    return `<section class="card"><div class="tiny muted">${esc(t('today.running'))}</div><div class="card-head"><h2>${esc(plans[state.active.planId]?.name || '')}</h2><a class="btn primary" href="#/active">${esc(t('today.continue'))}</a></div></section>`;
  }
  if (d.kind === 'done') {
    return `<section class="card"><div class="tiny muted">${esc(t('today.doneToday'))}</div><h2>${esc(plans[d.planId]?.name || '')}</h2>
      <button class="btn" data-act="other">${esc(t('training.another'))}</button></section>`;
  }
  const isRest = d.kind === 'rest';
  const p = plans[d.planId];
  let restBtn;
  // Pause (verschoben) oder krank: „Trotzdem trainieren“ hebt das auf → das verschobene Training ist heute dran (K3)
  if (d.shifted || d.sick) restBtn = `<button class="btn" data-act="dp-unmark" data-d="${esc(d.date)}">${esc(t('training.trainAnyway'))}</button>`;
  else if (!isRest && !d.chosen) restBtn = `<button class="btn" data-act="rest-today">${esc(t('training.restToday'))}</button>`;
  // Ruhetag laut Split: Plan rückt vor (heute das nächste Training, danach normal weiter) statt es morgen zu wiederholen (B1)
  else if (isRest && !d.chosen) restBtn = `<button class="btn" data-act="train-anyway">${esc(t('training.trainAnyway'))}</button>`;
  else restBtn = `<button class="btn" data-act="choose" data-v="">${esc(t('training.backToSuggestion'))}</button>`;
  return `<section class="card">
    <div class="tiny muted">${esc(d.chosen ? t('training.yourChoice') : t('today.suggested'))} · ${esc(rhythmName(state))}</div>
    ${isRest
      ? `<h2>${esc(d.sick ? `🤒 ${t('plan.sick')}` : d.shifted ? t('plan.pause') : t('training.rest'))}</h2><div class="small muted">${esc(d.sick ? t('today.sickHint') : d.shifted ? t('plan.shiftedHint') : t('training.restHint'))}</div>`
      : `<div class="card-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
         <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`}
    ${cardioEdit.cardioLine(state, d.date)}
    <div class="grid2"><button class="btn" data-act="other">${esc(t('training.another'))}</button>${restBtn}</div>
  </section>`;
}

/** Heute nicht trainieren: Training fällt weg (Plan bleibt) oder Plan ab heute einen Tag verschieben. */
function restTodaySheet(state) {
  const [d] = schedule(state, today(), 1);
  const name = state.plans.find((p) => p.id === d.planId)?.name || '';
  return `${sheetHead(t('training.restToday'))}
    <button class="btn block" data-act="choose" data-v="rest">${esc(t('training.skipToday', { name }))}</button>
    <div class="tiny muted">${esc(t('training.skipTodayHint'))}</div>
    <button class="btn block" data-act="rest-shift" data-d="${esc(d.date)}">${esc(t('plan.shiftHere'))}</button>
    <div class="tiny muted">${esc(t('training.shiftTodayHint', { name }))}</div>`;
}

function otherSheet(state) {
  const last = lastDone(state);
  return `${sheetHead(t('training.another'))}
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" data-in="other-continue" ${continueOther ? 'checked' : ''} style="margin-top:3px">
      <span><b>${esc(t('training.continueOther'))}</b><br><span class="tiny muted">${esc(t('training.continueOtherHint'))}</span></span></label>
    <div class="list">${state.plans.map((p) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(p.name)}</div><div class="meta">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
      <span class="tiny muted">${last[p.id] ? esc(shortDate(last[p.id])) : '–'}</span>
      <button class="btn sm primary" data-act="start" data-from="other" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`).join('')}</div>`;
}

/** Cardio der Woche: Uhr und von Hand zusammengeführt (dieselbe Einheit nur einmal, Uhr-Werte gelten; js/cardio.js). */
function cardioCard(state, key) {
  const from = weekStart(key);
  const sessions = cardioSessions(state, from, addDays(from, 6));
  const mins = cardioMinutes(sessions);
  const del = (c) => `<button class="icon-btn" data-act="del-cardio" data-id="${esc(c.id)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button>`;
  const rows = sessions.map((c) => (c.source === 'watch'
    ? `<div class="item"><span style="width:22px;text-align:center">⌚</span><div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div>
        <div class="meta">${esc(weekdayShort(c.date))} · ${num(c.minutes)} min${c.km ? ` · ${num(c.km, 1)} km` : ''}${c.kcal ? ` · ${num(c.kcal)} kcal` : ''}${c.avgHr ? ` · Ø ${c.avgHr} bpm` : ''} · ${esc(watchSourceName())}</div>
        ${c.manual ? `<div class="tiny muted">${esc(t('cardio.alsoManual'))}</div>` : ''}</div>${c.manual ? del(c.manual) : ''}</div>`
    : `<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div>
        <div class="meta">${esc(weekdayShort(c.date))} · ${num(c.minutes)} min${c.km ? ` · ${num(c.km, 1)} km` : ''} · ${esc(c.after ? t('cardio.after') : t('cardio.own'))}</div></div>${del(c)}</div>`)).join('');
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('cardio.week'))}</h3><span class="small muted">${sessions.length ? `${num(mins)} min` : ''}</span></div>
    ${rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(t('cardio.none'))}</div>`}
    <button class="btn sm ghost" data-act="add-cardio">${icon(I.plus)} ${esc(t('cardio.add'))}</button></section>`;
}

function historyCard(state, plans) {
  const items = [
    ...state.workouts.map((w) => ({ date: w.date, kind: 'w', w })),
    ...state.cardio.filter((c) => !c.after).map((c) => ({ date: c.date, kind: 'c', c })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const rows = items.map((it) => it.kind === 'w'
    ? `<div class="item"><button class="item-btn grow" data-act="detail" data-id="${esc(it.w.id)}"><div style="font-weight:600">${esc(plans[it.w.planId]?.name || t('training.workout'))}</div>
        <div class="meta">${esc(shortDate(it.date))} · ${esc(t('training.exCount', { n: it.w.exercises.length }))} · ${num(volume(it.w))} kg</div></button>${icon(I.chevron)}</div>`
    : `<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + it.c.type))}</div><div class="meta">${esc(shortDate(it.date))} · ${num(it.c.minutes)} min</div></div></div>`).join('');
  return `<section class="card tight"><h3>${esc(t('training.history'))}</h3>${rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(t('training.noHistory'))}</div>`}</section>`;
}

function detailSheet(state) {
  const w = state.workouts.find((x) => x.id === detailId);
  if (!w) return null;
  const plan = state.plans.find((p) => p.id === w.planId);
  const mins = w.startedAt && w.finishedAt ? Math.round((new Date(w.finishedAt) - new Date(w.startedAt)) / 60000) : null;
  const watch = watchStatsFor(state, w.date);
  return `${sheetHead(plan?.name || t('training.workout'))}
    <div class="small muted">${esc(shortDate(w.date))}${mins ? ` · ${num(mins)} min` : ''} · ${num(volume(w))} kg ${esc(t('training.volume'))}</div>
    ${watch ? `<div class="small">⌚ ${esc(watchSourceName())}: ${num(watch.minutes)} min${watch.kcal ? ` · ${num(watch.kcal)} kcal` : ''}${watch.avgHr ? ` · Ø ${watch.avgHr} bpm` : ''}</div>` : ''}
    <div class="list">${w.exercises.map((ex) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(ex.name)}${ex.uni ? ` <span class="tag accent">${esc(t('active.uniShort'))}</span>` : ''}</div>
      <div class="meta">${ex.sets.map((s) => setText(s, { unit: '', x: '×' })).join(' · ')}</div></div><span class="tiny muted">${workingSets(ex).length}</span></div>`).join('')}</div>
    ${w.note ? `<div class="small">${esc(w.note)}</div>` : ''}
    <button class="btn danger" data-act="del-workout">${icon(I.trash)} ${esc(t('training.deleteWorkout'))}</button>`;
}

export const actions = {
  ...daySheet.actions,
  ...calendarActions,
  'training-tab'(el, ctx) { ctx.go(el.dataset.v === 'plan' ? 'training?tab=plan' : 'training'); },
  start(el, ctx) {
    if (ctx.state.active) { ctx.go('active'); return; }
    // Aus „Anderes Training“ mit Häkchen: Plan ab heute von diesem Training aus fortsetzen (z. B. Push 1 ausgelassen)
    if (el.dataset.from === 'other' && continueOther) {
      const key = today();
      const [d] = schedule(ctx.state, key, 1);
      const sp = splitFor(ctx.state, key);
      const idx = indexOfPlan(sp, el.dataset.plan, d.pos);
      if (idx >= 0 && idx !== d.pos) ctx.update((s) => restartAt(s, key, idx, sp.id), { silent: true });
    }
    ctx.update((s) => startWorkout(s, el.dataset.plan), { silent: true });
    ctx.closeSheet();
    ctx.go('active');
  },
  choose(el, ctx) {
    const v = el.dataset.v;
    ctx.closeSheet();
    ctx.update((s) => { if (v) s.dayChoice[today()] = v; else delete s.dayChoice[today()]; });
  },
  'rest-today'(el, ctx) { ctx.openSheet(restTodaySheet); },
  // Heute Pause, Plan rückt nach – Fenster schliessen (Prüfbericht K7)
  'rest-shift'(el, ctx) {
    const d = el.dataset.d;
    ctx.closeSheet();
    ctx.update((s) => markDay(s, d, 'rest', 'shift'));
    ctx.toast(t('plan.shiftedToast'));
  },
  // Ruhetag, trotzdem trainieren: Plan ab heute mit dem nächsten Training fortsetzen (Rückgängig = Neu-Ausrichtung weg)
  'train-anyway'(el, ctx) {
    const key = today();
    const [d] = schedule(ctx.state, key, 1);
    const sp = splitFor(ctx.state, key);
    const idx = indexOfPlan(sp, d.firstOpen, d.pos);
    if (idx < 0) { ctx.update((s) => { s.dayChoice[key] = d.firstOpen; }); return; }
    const hadRestart = (ctx.state.training.restarts || []).find((r) => r.date === key) || null;
    ctx.update((s) => restartAt(s, key, idx, sp.id));
    const name = ctx.state.plans.find((p) => p.id === d.firstOpen)?.name || '';
    ctx.toast(t('training.pulledForward', { name }), () => ctx.update((s) => {
      removeRestart(s, key);
      if (hadRestart) restartAt(s, key, hadRestart.index, hadRestart.splitId);
    }));
  },
  other(el, ctx) { ctx.openSheet(otherSheet); },
  detail(el, ctx) { detailId = el.dataset.id; ctx.openSheet(detailSheet); },
  'del-workout'(el, ctx) {
    const idx = ctx.state.workouts.findIndex((w) => w.id === detailId);
    if (idx < 0) return;
    const removed = ctx.state.workouts[idx];
    ctx.closeSheet();
    ctx.update((s) => { s.workouts.splice(idx, 1); });
    ctx.toast(t('training.workoutDeleted'), () => ctx.update((s) => { s.workouts.splice(idx, 0, removed); }));
  },
};

export const inputs = { ...daySheet.inputs };
export const changes = { ...daySheet.changes, 'other-continue'(el) { continueOther = el.checked; } };
