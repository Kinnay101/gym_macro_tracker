// Training: Rhythmus, heutiger Vorschlag (flexibel), 7-Tage-Vorschau, Cardio, Pläne, Verlauf
import { esc, num, today, weekStart, addDays, icon, I, parseNum, uid } from '../util.js';
import { t, weekdayShort, shortDate } from '../i18n.js';
import { schedule, lastDone, planMuscles, CARDIO_TYPES } from '../plan.js';
import { startWorkout, volume, workingSets } from '../workout.js';
import { header, seg, sheetHead } from '../ui.js';
import { healthWorkoutsBetween, watchStatsFor } from '../health.js';
import { rhythmName } from './today.js';
import * as daySheet from './daySheet.js';
import * as planEdit from './planEdit.js';

export { CARDIO_TYPES };

let cardioDraft = null;
let detailId = null;

export function render(state) {
  const key = today();
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  const sched = schedule(state, key, 7);

  return `
    ${header(t('nav.training'))}
    ${todayCard(state, sched[0], plans)}
    <section class="card tight"><div class="card-head"><h3>${esc(t('training.preview'))}</h3><span class="tiny muted">${esc(rhythmName(state))}</span></div><div>
      ${sched.map((d, i) => `<button type="button" class="preview-day item-btn" data-act="day-open" data-d="${esc(d.date)}"><span class="small" style="${i === 0 ? 'color:var(--accent);font-weight:700' : 'color:var(--muted)'}">${esc(i === 0 ? t('common.today') : weekdayShort(d.date))}</span>
        <span>${esc(d.kind === 'rest' ? (d.shifted ? t('plan.pause') : t('training.rest')) : plans[d.planId]?.name || '')}${d.cardio.length ? ` <span class="tiny" style="color:var(--cardio)">+ ${esc(d.cardio.map((c) => `${t('cardio.' + c.type)} ${num(c.minutes)} min`).join(', '))}</span>` : ''}</span>
        <span class="tiny muted">${d.kind === 'done' ? esc(t('training.done')) : d.chosen ? esc(t('training.chosen')) : d.shifted ? '↷' : ''}</span></button>`).join('')}
    </div><div class="tiny muted">${esc(t('training.flexHint'))}</div></section>
    ${cardioCard(state, key)}
    ${planEdit.manageCards(state)}
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
  if (!isRest && !d.chosen) restBtn = `<button class="btn" data-act="rest-today">${esc(t('training.restToday'))}</button>`;
  else if (isRest && !d.chosen) restBtn = `<button class="btn" data-act="choose" data-v="${esc(d.firstOpen)}">${esc(t('training.trainAnyway'))}</button>`;
  else if (d.shifted) restBtn = `<button class="btn" data-act="dp-unshift" data-d="${esc(d.date)}">${esc(t('plan.unshift'))}</button>`;
  else restBtn = `<button class="btn" data-act="choose" data-v="">${esc(t('training.backToSuggestion'))}</button>`;
  return `<section class="card">
    <div class="tiny muted">${esc(d.chosen ? t('training.yourChoice') : t('today.suggested'))} · ${esc(rhythmName(state))}</div>
    ${isRest
      ? `<h2>${esc(d.shifted ? t('plan.pause') : t('training.rest'))}</h2><div class="small muted">${esc(d.shifted ? t('plan.shiftedHint') : t('training.restHint'))}</div>`
      : `<div class="card-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
         <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`}
    ${d.cardio.length ? `<div class="small" style="color:var(--cardio)">${icon(I.run)} ${esc(d.cardio.map((c) => `${t('cardio.' + c.type)} ${num(c.minutes)} min`).join(' · '))}</div>` : ''}
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
    <button class="btn block" data-act="dp-shift" data-d="${esc(d.date)}">${esc(t('plan.shiftHere'))}</button>
    <div class="tiny muted">${esc(t('training.shiftTodayHint', { name }))}</div>`;
}

function otherSheet(state) {
  const last = lastDone(state);
  return `${sheetHead(t('training.another'))}
    <div class="small muted">${esc(t('training.anotherHint'))}</div>
    <div class="list">${state.plans.map((p) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(p.name)}</div><div class="meta">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
      <span class="tiny muted">${last[p.id] ? esc(shortDate(last[p.id])) : '–'}</span>
      <button class="btn sm primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`).join('')}</div>`;
}

function cardioCard(state, key) {
  const from = weekStart(key);
  const list = state.cardio.filter((c) => c.date >= from && c.date <= addDays(from, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const watch = healthWorkoutsBetween(state, from, addDays(from, 6));
  const mins = list.reduce((s, c) => s + (c.minutes || 0), 0) + watch.reduce((s, w) => s + w.minutes, 0);
  const watchRows = watch.map((w) => `<div class="item"><span style="width:22px;text-align:center">⌚</span><div class="grow"><div style="font-weight:600">${esc(t('cardio.' + w.kind))}</div>
      <div class="meta">${esc(weekdayShort(w.date))} · ${num(w.minutes)} min${w.km ? ` · ${num(w.km, 1)} km` : ''}${w.kcal ? ` · ${num(w.kcal)} kcal` : ''}${w.avgHr ? ` · Ø ${w.avgHr} bpm` : ''} · Apple Watch</div></div></div>`).join('');
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('cardio.week'))}</h3><span class="small muted">${list.length ? `${num(mins)} min` : ''}</span></div>
    ${list.length || watch.length ? `<div class="list">${watchRows}${list.map((c) => `<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div>
      <div class="meta">${esc(weekdayShort(c.date))} · ${num(c.minutes)} min${c.km ? ` · ${num(c.km, 1)} km` : ''} · ${esc(c.after ? t('cardio.after') : t('cardio.own'))}</div></div>
      <button class="icon-btn" data-act="del-cardio" data-id="${esc(c.id)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>`).join('')}</div>` : `<div class="small muted">${esc(t('cardio.none'))}</div>`}
    <button class="btn sm ghost" data-act="add-cardio">${icon(I.plus)} ${esc(t('cardio.add'))}</button></section>`;
}

export function cardioSheet() {
  const d = cardioDraft;
  if (!d) return null;
  return `${sheetHead(t('cardio.add'))}
    <div class="chips">${CARDIO_TYPES.map((c) => `<button class="chip" data-act="cardio-type" data-v="${c}" aria-pressed="${d.type === c}">${esc(t('cardio.' + c))}</button>`).join('')}</div>
    <div class="grid2"><label class="field">${esc(t('cardio.minutes'))}<input class="input" inputmode="numeric" id="c-min" value="${esc(d.minutes ?? '')}" autofocus></label>
    <label class="field">${esc(t('cardio.km'))}<input class="input" inputmode="decimal" id="c-km" value="${esc(d.km ?? '')}"></label></div>
    <label class="field">${esc(t('common.date'))}<input class="input" type="date" id="c-date" value="${esc(d.date)}" max="${today()}"></label>
    ${seg('cardio-after', [['after', t('cardio.after')], ['own', t('cardio.own')]], d.after ? 'after' : 'own')}
    <div class="small" id="c-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="save-cardio">${esc(t('common.save'))}</button>`;
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
    ${watch ? `<div class="small">⌚ Apple Watch: ${num(watch.minutes)} min${watch.kcal ? ` · ${num(watch.kcal)} kcal` : ''}${watch.avgHr ? ` · Ø ${watch.avgHr} bpm` : ''}</div>` : ''}
    <div class="list">${w.exercises.map((ex) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(ex.name)}</div>
      <div class="meta">${ex.sets.map((s) => `${s.warmup ? 'W ' : ''}${num(s.kg, 2)}×${num(s.reps)}`).join(' · ')}</div></div><span class="tiny muted">${workingSets(ex).length}</span></div>`).join('')}</div>
    ${w.note ? `<div class="small">${esc(w.note)}</div>` : ''}
    <button class="btn danger" data-act="del-workout">${icon(I.trash)} ${esc(t('training.deleteWorkout'))}</button>`;
}

export const actions = {
  ...daySheet.actions,
  start(el, ctx) {
    if (ctx.state.active) { ctx.go('active'); return; }
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
  other(el, ctx) { ctx.openSheet(otherSheet); },
  'add-cardio'(el, ctx) {
    cardioDraft = { type: 'run', minutes: null, km: null, date: today(), after: ctx.state.workouts.some((w) => w.date === today()) };
    ctx.openSheet(cardioSheet);
  },
  'cardio-type'(el, ctx) { keepCardioInputs(); cardioDraft.type = el.dataset.v; ctx.refreshSheet(); },
  'cardio-after'(el, ctx) { keepCardioInputs(); cardioDraft.after = el.dataset.v === 'after'; ctx.refreshSheet(); },
  'save-cardio'(el, ctx) {
    keepCardioInputs();
    const d = cardioDraft;
    if (!d.minutes) { document.getElementById('c-err').textContent = t('cardio.needMinutes'); return; }
    const entry = { id: uid(), date: d.date || today(), type: d.type, minutes: d.minutes, km: d.km, after: d.after };
    cardioDraft = null;
    ctx.closeSheet();
    ctx.update((s) => { s.cardio.push(entry); });
    ctx.toast(t('cardio.saved'));
  },
  'del-cardio'(el, ctx) {
    const idx = ctx.state.cardio.findIndex((c) => c.id === el.dataset.id);
    if (idx < 0) return;
    const removed = ctx.state.cardio[idx];
    ctx.update((s) => { s.cardio.splice(idx, 1); });
    ctx.toast(t('cardio.deleted'), () => ctx.update((s) => { s.cardio.splice(idx, 0, removed); }));
  },
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

function keepCardioInputs() {
  if (!cardioDraft) return;
  const m = document.getElementById('c-min'); const k = document.getElementById('c-km'); const d = document.getElementById('c-date');
  if (m) cardioDraft.minutes = parseNum(m.value);
  if (k) cardioDraft.km = parseNum(k.value);
  if (d && d.value) cardioDraft.date = d.value;
}

export const inputs = { ...daySheet.inputs };
export const changes = { ...daySheet.changes };
