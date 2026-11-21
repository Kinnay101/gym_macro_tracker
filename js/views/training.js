// Training: Rhythmus, heutiger Vorschlag (flexibel), 7-Tage-Vorschau, Cardio, Pläne, Verlauf
import { esc, num, today, weekStart, addDays, icon, I, parseNum, uid } from '../util.js';
import { t, weekdayShort, shortDate } from '../i18n.js';
import { schedule, roundStatus, planMuscles, RHYTHMS } from '../plan.js';
import { startWorkout, volume, workingSets } from '../workout.js';
import { header, seg, sheetHead } from '../ui.js';
import { rhythmName } from './today.js';

export const CARDIO_TYPES = ['run', 'treadmill', 'bike', 'crosstrainer', 'rowing', 'stairs', 'swim', 'other'];

let openPlan = null;
let cardioDraft = null;
let detailId = null;

export function render(state) {
  const key = today();
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  const sched = schedule(state, key, 7);
  const r = state.profile.rhythm;

  return `
    ${header(t('nav.training'))}
    <section class="stack">
      <div class="small muted">${esc(t('training.rhythm'))}</div>
      ${seg('rhythm', Object.keys(RHYTHMS).map((k) => [k, state.profile.rhythmNames?.[k] || t('rhythm.' + k)]), r)}
      <div class="tiny muted">${esc(t('rhythm.' + r + 'Sub'))} · ${esc(t('training.flexHint'))}</div>
    </section>
    ${todayCard(state, sched[0], plans)}
    <section class="card tight"><h3>${esc(t('training.preview'))}</h3><div>
      ${sched.map((d, i) => `<div class="preview-day"><span class="small" style="${i === 0 ? 'color:var(--accent);font-weight:700' : 'color:var(--muted)'}">${esc(i === 0 ? t('common.today') : weekdayShort(d.date))}</span>
        <span>${esc(d.kind === 'rest' ? t('training.rest') : plans[d.planId]?.name || '')}</span>
        <span class="tiny muted">${d.kind === 'done' ? esc(t('training.done')) : d.chosen ? esc(t('training.chosen')) : ''}</span></div>`).join('')}
    </div></section>
    ${cardioCard(state, key)}
    <section class="stack"><h2>${esc(t('training.plans'))}</h2>${state.plans.map((p) => planCard(p)).join('')}</section>
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
  if (!isRest && !d.chosen) restBtn = `<button class="btn" data-act="choose" data-v="rest">${esc(t('training.restToday'))}</button>`;
  else if (isRest && !d.chosen) restBtn = `<button class="btn" data-act="choose" data-v="${esc(d.firstOpen)}">${esc(t('training.trainAnyway'))}</button>`;
  else restBtn = `<button class="btn" data-act="choose" data-v="">${esc(t('training.backToSuggestion'))}</button>`;
  return `<section class="card">
    <div class="tiny muted">${esc(d.chosen ? t('training.yourChoice') : t('today.suggested'))} · ${esc(rhythmName(state))}</div>
    ${isRest
      ? `<h2>${esc(t('training.rest'))}</h2><div class="small muted">${esc(t('training.restHint'))}</div>`
      : `<div class="card-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
         <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`}
    <div class="grid2"><button class="btn" data-act="other">${esc(t('training.another'))}</button>${restBtn}</div>
  </section>`;
}

function otherSheet(state) {
  const status = roundStatus(state, today());
  return `${sheetHead(t('training.another'))}
    <div class="small muted">${esc(t('training.anotherHint'))}</div>
    <div class="list">${state.plans.map((p) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(p.name)}</div><div class="meta">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))}</div></div>
      <span class="tag ${status[p.id] ? '' : 'accent'}">${esc(status[p.id] ? t('training.doneRound') : t('training.open'))}</span>
      <button class="btn sm primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button></div>`).join('')}</div>`;
}

function planCard(p) {
  const open = openPlan === p.id;
  const ex = open ? `<div class="list">${p.ex.map((e) => `<div class="item"><div class="grow">
      <div style="font-weight:600">${esc(e.name)} ${e.optional ? `<span class="tag">${esc(t('training.optional'))}</span>` : ''}</div>
      <div class="meta">${esc(e.target)} · ${esc(t('m.' + e.muscle))}</div>
      ${e.variant ? `<div class="meta">${icon(I.swap, 'icon')} ${esc(t('training.variant'))}: ${esc(e.variant.name)}${e.variant.note ? ` (${esc(e.variant.note)})` : ''}</div>` : ''}
    </div></div>`).join('')}</div>
    <button class="btn primary" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.startPlan', { name: p.name }))}</button>` : '';
  return `<section class="card tight"><button class="item-btn row between" data-act="toggle-plan" data-id="${esc(p.id)}" aria-expanded="${open}">
    <div><h3>${esc(p.name)}</h3><div class="meta small muted">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))} · ${esc(t('training.exCount', { n: p.ex.length }))}</div></div>
    ${icon(open ? I.down : I.chevron)}</button>${ex}</section>`;
}

function cardioCard(state, key) {
  const from = weekStart(key);
  const list = state.cardio.filter((c) => c.date >= from && c.date <= addDays(from, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const mins = list.reduce((s, c) => s + (c.minutes || 0), 0);
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('cardio.week'))}</h3><span class="small muted">${list.length ? `${num(mins)} min` : ''}</span></div>
    ${list.length ? `<div class="list">${list.map((c) => `<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + c.type))}</div>
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
  return `${sheetHead(plan?.name || t('training.workout'))}
    <div class="small muted">${esc(shortDate(w.date))}${mins ? ` · ${num(mins)} min` : ''} · ${num(volume(w))} kg ${esc(t('training.volume'))}</div>
    <div class="list">${w.exercises.map((ex) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(ex.name)}</div>
      <div class="meta">${ex.sets.map((s) => `${s.warmup ? 'W ' : ''}${num(s.kg, 2)}×${num(s.reps)}`).join(' · ')}</div></div><span class="tiny muted">${workingSets(ex).length}</span></div>`).join('')}</div>
    ${w.note ? `<div class="small">${esc(w.note)}</div>` : ''}
    <button class="btn danger" data-act="del-workout">${icon(I.trash)} ${esc(t('training.deleteWorkout'))}</button>`;
}

export const actions = {
  rhythm(el, ctx) { ctx.update((s) => { s.profile.rhythm = el.dataset.v; }); },
  start(el, ctx) {
    if (ctx.state.active) { ctx.go('active'); return; }
    ctx.update((s) => startWorkout(s, el.dataset.plan), { silent: true });
    ctx.closeSheet();
    ctx.go('active');
  },
  choose(el, ctx) {
    const v = el.dataset.v;
    ctx.update((s) => { if (v) s.dayChoice[today()] = v; else delete s.dayChoice[today()]; });
  },
  other(el, ctx) { ctx.openSheet(otherSheet); },
  'toggle-plan'(el, ctx) { openPlan = openPlan === el.dataset.id ? null : el.dataset.id; ctx.render(); },
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
