// Planung bearbeiten: Plan-Teil der Tagesübersicht (Tag ändern, verschieben, Cardio), Split-Editor,
// Trainings-Editor (Übungen) und fester Cardio-Plan (Wochentage). Wird von Heute, Training und Fortschritt benutzt.
import { esc, num, today, addDays, icon, I, parseNum, uid, daysBetween } from '../util.js';
import { t, weekdayShort, longDate } from '../i18n.js';
import { dayPlan, activeSplit, cyclePos, planShort, newPlan, newSplit, planMuscles, MUSCLES, CARDIO_TYPES, splitById, restartAt, removeRestart, markDay, unmarkDay, markRange, indexOfPlan } from '../plan.js';
import { sheetHead, seg } from '../ui.js';
import { splitName } from './today.js';
import { plannedCardioList } from './cardioEdit.js';

const MONDAY = '2026-11-23'; // irgendein Montag – für Wochentagsnamen
const MAX_BACK = 60; // so weit zurück lassen sich Ruhetage/Kranktage nachtragen
const weekdayName = (i) => weekdayShort(addDays(MONDAY, i));
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const cardioLabel = (c) => `${t('cardio.' + c.type)} · ${num(c.minutes)} min`;

// ---------- Plan-Teil der Tagesübersicht ----------

/** Karte „Plan“ für einen Tag: was geplant ist, ändern, ab hier verschieben, Cardio planen. */
export function dayPlanCard(state, date) {
  if (!state.training) return '';
  const now = today();
  const p = dayPlan(state, date);
  const plans = Object.fromEntries(state.plans.map((x) => [x.id, x]));
  const done = state.workouts.some((w) => w.date === date);
  const past = date < now;
  const tracked = date >= (state.training.anchor?.date || now); // vor der Umstellung gab es keinen Plan
  const editable = !done && date >= addDays(now, -MAX_BACK); // Ruhetag/krank bis 60 Tage zurück eintragbar
  if (past && !tracked && !done && !editable) return '';
  // Training an diesem Tag schon gemacht → nichts mehr zu planen (Training und Cardio stehen in der Tagesübersicht)
  if (done) return '';

  const baseName = p.base.kind === 'train' && plans[p.base.planId] ? plans[p.base.planId].name : t('plan.rest');
  const what = p.sick ? `🤒 ${t('plan.sick')}` : p.shifted ? t('plan.pause') : !tracked && past ? '–' : p.kind === 'train' ? plans[p.planId]?.name : t('plan.rest');
  let status = '';
  if (p.sick) status = t(p.sick === 'shift' && p.shifted ? 'plan.sickShifted' : 'plan.sickSkipped');
  else if (p.shifted) status = t('plan.shiftedHint');
  else if (past && p.kind === 'train' && !done) status = t('plan.missed');
  else if (p.chosen) status = t('plan.changed', { name: baseName });
  else if (p.restarted) status = t('plan.restartedHint');

  // Anderes Training (heute und später): ein Link öffnet die Auswahl – mit Häkchen „Plan danach damit fortsetzen“
  // (= Neu-Ausrichtung ab hier) oder nur an diesem Tag (dayChoice). Ruhetag geht über die Knöpfe oben.
  const sp = splitById(state, p.splitId);
  const other = !past && !p.shifted && !p.sick
    ? `<button class="link tiny" style="align-self:flex-start" data-act="dp-other" data-d="${esc(date)}">${esc(t('plan.otherLink'))}</button>` : '';
  const unchoose = p.chosen && p.kind === 'train'
    ? `<button class="btn sm" data-act="dp-unchoose" data-d="${esc(date)}">${esc(t('plan.unchoose', { name: baseName }))}</button>` : '';

  // Ruhetag / krank (auch nachträglich, bis 60 Tage zurück): je zwei Knöpfe – Plan rückt nach oder Training fällt weg.
  // An Ruhetagen laut Split nur „krank“ (es gibt nichts zu verschieben). Bereits eingetragen → aufheben.
  const b = (act, mode, label, cls = '') => `<button class="btn sm ${cls}" data-act="${act}" data-d="${esc(date)}" data-mode="${mode}">${esc(label)}</button>`;
  const marked = p.sick || p.shifted || (p.chosen && p.kind === 'rest');
  let restBtns = '';
  if (marked && !done) {
    restBtns = b('dp-unmark', '', p.sick ? t('plan.unsick') : p.shifted ? t('plan.unshift') : t('plan.unrest', { name: baseName }));
  } else if (editable && p.kind === 'train' && (tracked || !past)) {
    restBtns = `<div class="grid2">${b('dp-mark', 'shift', t('plan.restShift'))}${b('dp-mark', 'skip', t('plan.restSkip'))}</div>
      <div class="grid2">${b('dp-sick', 'shift', t('plan.sickShift'), 'sick')}${b('dp-sick', 'skip', t('plan.sickSkip'), 'sick')}</div>`;
  } else if (editable) {
    restBtns = b('dp-sick', 'skip', `🤒 ${t('plan.sick')}`, 'sick');
  }
  // Trainiert, aber nicht aufgezeichnet (vergessen, nur Uhr …) → als erledigt eintragen, Details später über „Bearbeiten“
  if (editable && !marked && p.kind === 'train' && date <= now) {
    restBtns = `<button class="btn sm" data-act="dp-quick-done" data-d="${esc(date)}">✓ ${esc(t('plan.quickDone'))}</button>` + restBtns;
  }
  if (editable || marked) restBtns += `<button class="link tiny" style="align-self:flex-start" data-act="dp-range" data-d="${esc(date)}">${esc(t('plan.rangeOpen'))}</button>`;

  // Geplantes Cardio nur für heute und kommende Tage; für vergangene Tage zählt nur, was gemacht wurde
  const cardio = past ? '' : plannedCardioList(state, date, { withDelete: true });
  const addCardio = past ? '' : `<div class="row" style="gap:8px">
      <select class="input grow" id="dp-ctype">${CARDIO_TYPES.map((c) => opt(c, t('cardio.' + c), c === 'run')).join('')}</select>
      <input class="input" id="dp-cmin" inputmode="numeric" style="width:64px" value="30" aria-label="min"><span class="small muted">min</span>
      <button class="btn sm" data-act="dp-cardio-add" data-d="${esc(date)}">${icon(I.plus)}</button></div>`;

  const unrestart = p.restarted ? `<button class="btn sm" data-act="dp-unrestart" data-d="${esc(date)}">${esc(t('plan.unrestart'))}</button>` : '';

  return `<section class="card tight"><div class="card-head"><h3>${esc(t('plan.title'))}</h3><span class="tiny muted">${esc(splitName(sp || activeSplit(state)))}</span></div>
    <div class="row between"><b>${esc(what || '')}</b>${done ? `<span class="tag accent">${esc(t('training.done'))}</span>` : ''}</div>
    ${status ? `<div class="tiny muted">${esc(status)}</div>` : ''}
    ${restBtns}
    ${unrestart}${unchoose}
    ${other}
    ${cardio || addCardio ? `<div class="small" style="font-weight:600">${esc(t('plan.cardio'))}</div>${cardio ? `<div class="list">${cardio}</div>` : ''}${addCardio}` : ''}
  </section>`;
}

// ---------- Anderes Training an einem Tag ----------
let otherDraft = null; // { date, cont: true, after }

/** Auswahl „Anderes Training an diesem Tag“; `after` = danach zurück (z. B. Tagesübersicht wieder öffnen). */
export function openOther(ctx, date, after = null) {
  otherDraft = { date, cont: true, after };
  ctx.openSheet(otherSheet, { guard: () => { const a = otherDraft?.after; otherDraft = null; if (a) setTimeout(a, 0); return true; } });
}

function otherSheet(state) {
  const o = otherDraft;
  if (!o) return null;
  const p = dayPlan(state, o.date);
  return `${sheetHead(t('plan.otherTitle'))}
    <div class="small muted">${esc(longDate(o.date))}</div>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" data-in="dp-other-cont" ${o.cont ? 'checked' : ''} style="margin-top:3px">
      <span><b>${esc(t('plan.otherCont'))}</b><br><span class="tiny muted">${esc(t(o.cont ? 'plan.otherContHint' : 'plan.otherOnlyHint'))}</span></span></label>
    <div class="list">${state.plans.map((x) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(x.name)}</div><div class="meta">${esc(planMuscles(x).map((m) => t('m.' + m)).join(' · '))}</div></div>
      ${p.kind === 'train' && p.planId === x.id ? `<span class="tag accent">${esc(t('plan.otherPlanned'))}</span>` : `<button class="btn sm" data-act="dp-other-pick" data-plan="${esc(x.id)}">${esc(t('plan.otherPick'))}</button>`}</div>`).join('')}</div>`;
}

// ---------- Mehrere Tage eintragen (Ruhetag/krank von–bis) ----------
let rangeDraft = null; // { from, to, type: 'sick' | 'rest', mode: 'shift' | 'skip' }

function keepRange() {
  if (!rangeDraft) return;
  const f = document.getElementById('rg-from')?.value; const to = document.getElementById('rg-to')?.value;
  if (f) rangeDraft.from = f;
  if (to) rangeDraft.to = to;
}

function rangeSheet() {
  const r = rangeDraft;
  if (!r) return null;
  const min = addDays(today(), -MAX_BACK);
  const max = addDays(today(), 90);
  return `${sheetHead(t('plan.rangeTitle'))}
    <div class="grid2"><label class="field">${esc(t('plan.rangeFrom'))}<input class="input" type="date" id="rg-from" value="${esc(r.from)}" min="${min}" max="${max}"></label>
      <label class="field">${esc(t('plan.rangeTo'))}<input class="input" type="date" id="rg-to" value="${esc(r.to)}" min="${min}" max="${max}"></label></div>
    ${seg('rg-type', [['rest', t('plan.rest')], ['sick', `🤒 ${t('plan.sick')}`]], r.type)}
    ${seg('rg-mode', [['shift', t('plan.modeShift')], ['skip', t('plan.modeSkip')]], r.mode)}
    <div class="tiny muted">${esc(t(r.mode === 'shift' ? 'plan.rangeHintShift' : 'plan.rangeHintSkip'))}</div>
    <div class="small" id="rg-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="rg-save">${esc(t('common.save'))}</button>`;
}

// ---------- Split-Editor ----------
let splitDraft = null; // { split, isNew, startIdx }

function splitSheet(state) {
  const d = splitDraft;
  if (!d) return null;
  const sp = d.split;
  const isActive = state.training.activeSplit === sp.id;
  const trainN = sp.days.filter((x) => x.kind === 'train').length;
  const rows = sp.days.map((day, i) => {
    const sel = `<select class="input grow" data-in="se-day" data-i="${i}">${opt('rest', t('plan.rest'), day.kind === 'rest')}
      ${state.plans.map((x) => opt(x.id, x.name, day.kind === 'train' && day.planId === x.id)).join('')}</select>`;
    const cardio = day.cardio
      ? `<div class="row" style="gap:6px;padding-left:34px"><span class="tiny muted">${icon(I.run)}</span>
          <select class="input grow" data-in="se-ctype" data-i="${i}">${CARDIO_TYPES.map((c) => opt(c, t('cardio.' + c), day.cardio.type === c)).join('')}</select>
          <input class="input" inputmode="numeric" style="width:64px" data-in="se-cmin" data-i="${i}" value="${esc(day.cardio.minutes ?? '')}" aria-label="min"><span class="small muted">min</span>
          <button class="icon-btn" data-act="se-cardio" data-i="${i}" aria-label="${esc(t('common.delete'))}">${icon(I.x)}</button></div>`
      : `<button class="link tiny" style="padding-left:34px;align-self:flex-start" data-act="se-cardio" data-i="${i}">+ ${esc(t('plan.cardio'))}</button>`;
    return `<div class="stack" style="gap:4px;padding:6px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="gap:6px"><span class="tiny muted" style="width:28px">${i + 1}.</span>${sel}
        <button class="icon-btn" data-act="se-move" data-i="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="↑">${icon(I.up)}</button>
        <button class="icon-btn" data-act="se-move" data-i="${i}" data-v="1" ${i === sp.days.length - 1 ? 'disabled' : ''} aria-label="↓">${icon(I.down)}</button>
        <button class="icon-btn" data-act="se-del" data-i="${i}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>
      ${cardio}</div>`;
  }).join('');
  const startSel = `<select class="input" data-in="se-start">${sp.days.map((day, i) => opt(String(i), `${i + 1}. ${day.kind === 'train' ? state.plans.find((x) => x.id === day.planId)?.name || '?' : t('plan.rest')}`, i === d.startIdx)).join('')}</select>`;
  return `${sheetHead(d.isNew ? t('split.new') : t('split.edit'))}
    <label class="field">${esc(t('split.name'))}<input class="input" data-in="se-name" value="${esc(sp.name ?? splitName(sp))}" maxlength="40"></label>
    <div class="tiny muted">${esc(t('split.hint'))}</div>
    <div class="small" style="font-weight:600">${esc(t('split.days'))} · ${esc(t('split.cycle', { n: sp.days.length, t: trainN }))}</div>
    <div class="stack" style="gap:0">${rows}</div>
    <div class="grid2"><button class="btn sm" data-act="se-add" data-v="train">${icon(I.plus)} ${esc(t('split.addTrain'))}</button>
      <button class="btn sm" data-act="se-add" data-v="rest">${icon(I.plus)} ${esc(t('split.addRest'))}</button></div>
    <label class="field">${esc(isActive ? t('split.todayIs') : t('split.startWith'))}${startSel}</label>
    ${!d.isNew && state.training.splits.length > 1 ? `<button class="btn danger" data-act="se-delete">${icon(I.trash)} ${esc(t('split.delete'))}</button>` : ''}
    <div class="sheet-actions"><div class="small" id="se-err" style="color:var(--bad)"></div>
      <button class="btn primary block" data-act="se-save" data-v="${isActive ? 'keep' : 'save'}">${esc(t('common.save'))}</button>
      ${isActive ? '' : `<button class="btn block" data-act="se-save" data-v="use">${esc(t('split.use'))}</button>`}</div>`;
}

export function openSplit(ctx, id) {
  const state = ctx.state;
  const sp = id ? state.training.splits.find((x) => x.id === id) : newSplit('', state.plans);
  if (!sp) return;
  const isActive = state.training.activeSplit === sp.id;
  splitDraft = { split: structuredClone(sp), isNew: !id, startIdx: isActive ? cyclePos(state, today()) : 0 };
  if (!id) splitDraft.split.name = '';
  splitDraft.initial = JSON.stringify([splitDraft.split, splitDraft.startIdx]);
  ctx.openSheet(splitSheet, { modal: true, guard: () => JSON.stringify([splitDraft?.split, splitDraft?.startIdx]) === splitDraft?.initial || ctx.confirm(t('common.discardChanges'), t('common.discard')) });
}

// ---------- Trainings-Editor ----------
let planDraft = null; // { plan, isNew }

function planSheet(state) {
  const d = planDraft;
  if (!d) return null;
  const p = d.plan;
  const names = [...new Set([...state.plans.flatMap((x) => x.ex.map((e) => e.name)), ...state.workouts.flatMap((w) => w.exercises.map((e) => e.name))])].sort();
  const rows = p.ex.map((e, i) => `<div class="stack" style="gap:6px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="gap:6px"><span class="tiny muted" style="width:22px">${i + 1}.</span>
        <input class="input grow" data-in="pe-ex" data-f="name" data-i="${i}" value="${esc(e.name)}" list="ex-names" placeholder="${esc(t('plan.exName'))}">
        <button class="icon-btn" data-act="pe-move" data-i="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="↑">${icon(I.up)}</button>
        <button class="icon-btn" data-act="pe-move" data-i="${i}" data-v="1" ${i === p.ex.length - 1 ? 'disabled' : ''} aria-label="↓">${icon(I.down)}</button>
        <button class="icon-btn" data-act="pe-del" data-i="${i}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>
      <div class="row" style="gap:6px;padding-left:28px">
        <select class="input" data-in="pe-ex" data-f="muscle" data-i="${i}" style="width:42%">${MUSCLES.map((m) => opt(m, t('m.' + m), e.muscle === m)).join('')}</select>
        <input class="input grow" data-in="pe-ex" data-f="target" data-i="${i}" value="${esc(e.target ?? '')}" placeholder="${esc(t('plan.target'))}"></div>
      <div class="row" style="gap:6px;padding-left:28px">
        <input class="input grow" data-in="pe-ex" data-f="variant" data-i="${i}" value="${esc(e.variant?.name ?? '')}" list="ex-names" placeholder="${esc(t('plan.variant'))}">
        <label class="row tiny" style="gap:4px"><input type="checkbox" data-in="pe-ex" data-f="optional" data-i="${i}" ${e.optional ? 'checked' : ''}>${esc(t('training.optional'))}</label>
        <label class="row tiny" style="gap:4px"><input type="checkbox" data-in="pe-ex" data-f="uni" data-i="${i}" ${e.uni ? 'checked' : ''}>${esc(t('plan.uni'))}</label></div>
    </div>`).join('');
  return `${sheetHead(d.isNew ? t('plan.newTitle') : t('plan.editTitle'))}
    <div class="grid2"><label class="field">${esc(t('plan.name'))}<input class="input" data-in="pe-name" value="${esc(p.name)}" maxlength="40"></label>
      <label class="field">${esc(t('plan.short'))}<input class="input" data-in="pe-short" value="${esc(p.short ?? '')}" maxlength="4" placeholder="${esc(t('common.std', { v: planShort({ ...p, short: null, name: p.name || '?' }) }))}"></label></div>
    <div class="small" style="font-weight:600">${esc(t('plan.exercises'))} · ${esc(t('training.exCount', { n: p.ex.length }))}</div>
    <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="stack" style="gap:0">${rows || `<div class="small muted">${esc(t('plan.noEx'))}</div>`}</div>
    <button class="btn sm" data-act="pe-add">${icon(I.plus)} ${esc(t('plan.addEx'))}</button>
    ${!d.isNew && state.plans.length > 1 ? `<button class="btn danger" data-act="pe-delete">${icon(I.trash)} ${esc(t('plan.delete'))}</button>` : ''}
    <div class="sheet-actions"><div class="small" id="pe-err" style="color:var(--bad)"></div>
      <button class="btn primary block" data-act="pe-save">${esc(t('common.save'))}</button></div>`;
}

export function openPlan(ctx, id) {
  const p = id ? ctx.state.plans.find((x) => x.id === id) : newPlan('');
  if (!p) return;
  planDraft = { plan: structuredClone(p), isNew: !id };
  planDraft.initial = JSON.stringify(planDraft.plan);
  ctx.openSheet(planSheet, { modal: true, guard: () => JSON.stringify(planDraft?.plan) === planDraft?.initial || ctx.confirm(t('common.discardChanges'), t('common.discard')) });
}

// ---------- Fester Cardio-Plan (Wochentage) ----------
function cardioPlanSheet(state) {
  const list = state.training.weeklyCardio || [];
  const rows = list.map((w) => `<div class="row" style="gap:6px">
      <select class="input" data-in="cw" data-f="weekday" data-id="${esc(w.id)}" style="width:72px">${[0, 1, 2, 3, 4, 5, 6].map((i) => opt(String(i), weekdayName(i), w.weekday === i)).join('')}</select>
      <select class="input grow" data-in="cw" data-f="type" data-id="${esc(w.id)}">${CARDIO_TYPES.map((c) => opt(c, t('cardio.' + c), w.type === c)).join('')}</select>
      <input class="input" inputmode="numeric" style="width:64px" data-in="cw" data-f="minutes" data-id="${esc(w.id)}" value="${esc(w.minutes ?? '')}" aria-label="min"><span class="small muted">min</span>
      <button class="icon-btn" data-act="cw-del" data-id="${esc(w.id)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>`).join('');
  return `${sheetHead(t('cardio.plan'))}
    <div class="tiny muted">${esc(t('cardio.planHint'))}</div>
    <div class="stack" style="gap:8px">${rows || `<div class="small muted">${esc(t('cardio.planNone'))}</div>`}</div>
    <button class="btn sm" data-act="cw-add">${icon(I.plus)} ${esc(t('cardio.planAdd'))}</button>`;
}

/** Kurzfassung für die Trainingsseite. */
export function cardioPlanSummary(state) {
  const list = [...(state.training?.weeklyCardio || [])].sort((a, b) => a.weekday - b.weekday);
  return list.map((w) => `${weekdayName(w.weekday)} ${t('cardio.' + w.type)} ${num(w.minutes)} min`).join(' · ');
}

// ---------- Aktionen ----------
const updTraining = (ctx, fn) => ctx.update((s) => { fn(s.training, s); });

export const actions = {
  // Tagesplan
  'dp-shift'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => {
      s.training.shifts = [...new Set([...(s.training.shifts || []), d])].sort();
      delete s.dayChoice[d];
    });
    ctx.toast(t('plan.shiftedToast'));
  },
  'dp-mark'(el, ctx) {
    const { d, mode } = el.dataset;
    ctx.update((s) => markDay(s, d, 'rest', mode));
    ctx.toast(t(mode === 'shift' ? 'plan.shiftedToast' : 'plan.restSkipToast'));
  },
  'dp-sick'(el, ctx) {
    const { d, mode } = el.dataset;
    ctx.update((s) => markDay(s, d, 'sick', mode));
    ctx.toast(t('plan.sickToast'));
  },
  'dp-unmark'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => unmarkDay(s, d));
  },
  'dp-range'(el, ctx) {
    const d = el.dataset.d;
    rangeDraft = { from: d, to: d, type: 'rest', mode: 'shift' };
    ctx.openSheet(rangeSheet);
  },
  'rg-type'(el, ctx) { keepRange(); rangeDraft.type = el.dataset.v; ctx.refreshSheet(); },
  'rg-mode'(el, ctx) { keepRange(); rangeDraft.mode = el.dataset.v; ctx.refreshSheet(); },
  'rg-save'(el, ctx) {
    keepRange();
    const { from, to, type, mode } = rangeDraft;
    const err = document.getElementById('rg-err');
    if (!from || !to || to < from) { err.textContent = t('plan.rangeErrOrder'); return; }
    if (daysBetween(from, to) > MAX_BACK) { err.textContent = t('plan.rangeErrLong', { n: MAX_BACK }); return; }
    if (from < addDays(today(), -MAX_BACK)) { err.textContent = t('plan.rangeErrOld', { n: MAX_BACK }); return; }
    let n = 0;
    ctx.update((s) => { n = markRange(s, from, to, type, mode); });
    rangeDraft = null;
    ctx.closeSheet();
    ctx.toast(t('plan.rangeDone', { n }));
  },
  'dp-rest'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => { s.dayChoice[d] = 'rest'; });
    ctx.toast(t('plan.restSkipToast'));
  },
  'dp-unrest'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => { delete s.dayChoice[d]; });
  },
  'dp-other'(el, ctx) { openOther(ctx, el.dataset.d); },
  'dp-quick-done'(el, ctx) {
    const d = el.dataset.d;
    const p = dayPlan(ctx.state, d);
    if (p.kind !== 'train' || ctx.state.workouts.some((w) => w.date === d)) return;
    const id = uid();
    ctx.update((s) => { s.workouts.push({ id, planId: p.planId, date: d, startedAt: null, finishedAt: null, note: '', exercises: [], quick: true }); });
    ctx.toast(t('plan.quickDoneToast'), () => ctx.update((s) => { s.workouts = s.workouts.filter((w) => w.id !== id); }));
  },
  'dp-other-pick'(el, ctx) {
    const o = otherDraft;
    if (!o) return;
    const planId = el.dataset.plan;
    const p = dayPlan(ctx.state, o.date);
    const sp = splitById(ctx.state, p.splitId);
    const idx = o.cont && sp ? indexOfPlan(sp, planId, p.pos ?? 0) : -1;
    otherDraft = null;
    ctx.closeSheet();
    // Plan danach damit fortsetzen → Neu-Ausrichtung ab diesem Tag; Training nicht im Split oder Häkchen aus → nur dieser Tag
    if (idx >= 0) ctx.update((s) => restartAt(s, o.date, idx, sp.id));
    else ctx.update((s) => { s.dayChoice[o.date] = planId; });
    ctx.toast(t(idx >= 0 ? 'plan.restartedToast' : 'plan.onlyDayToast'));
    o.after?.();
  },
  'dp-unchoose'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => { delete s.dayChoice[d]; });
  },
  'dp-unrestart'(el, ctx) {
    const d = el.dataset.d;
    ctx.update((s) => removeRestart(s, d));
  },
  'dp-unshift'(el, ctx) {
    const d = el.dataset.d;
    updTraining(ctx, (tr) => { tr.shifts = (tr.shifts || []).filter((x) => x !== d); });
  },
  'dp-cardio-add'(el, ctx) {
    const d = el.dataset.d;
    const type = document.getElementById('dp-ctype')?.value || 'run';
    const minutes = parseNum(document.getElementById('dp-cmin')?.value);
    if (!minutes || minutes <= 0 || minutes > 600) { ctx.toast(t('cardio.needMinutes')); return; }
    ctx.update((s) => { (s.plannedCardio[d] ||= []).push({ id: uid(), type, minutes: Math.round(minutes) }); });
  },
  'dp-cardio-del'(el, ctx) {
    const { d, id } = el.dataset;
    ctx.update((s) => {
      s.plannedCardio[d] = (s.plannedCardio[d] || []).filter((c) => c.id !== id);
      if (!s.plannedCardio[d].length) delete s.plannedCardio[d];
    });
  },

  // Split-Editor
  'split-edit'(el, ctx) { openSplit(ctx, el.dataset.id); },
  'split-new'(el, ctx) { openSplit(ctx, null); },
  'se-add'(el, ctx) {
    const kind = el.dataset.v;
    splitDraft.split.days.push(kind === 'train' ? { kind: 'train', planId: ctx.state.plans[0]?.id } : { kind: 'rest' });
    ctx.refreshSheet();
  },
  'se-del'(el, ctx) {
    const i = Number(el.dataset.i);
    splitDraft.split.days.splice(i, 1);
    // „Heute ist Tag“ zeigt weiter auf denselben Tag (Prüfbericht K5): Tag davor gelöscht → eins nach vorne
    if (i < splitDraft.startIdx) splitDraft.startIdx--;
    splitDraft.startIdx = Math.min(splitDraft.startIdx, Math.max(0, splitDraft.split.days.length - 1));
    ctx.refreshSheet();
  },
  'se-move'(el, ctx) {
    const i = Number(el.dataset.i); const j = i + Number(el.dataset.v);
    const days = splitDraft.split.days;
    if (j < 0 || j >= days.length) return;
    [days[i], days[j]] = [days[j], days[i]];
    // „Heute ist Tag“ wandert mit dem verschobenen Tag (Prüfbericht K5)
    if (splitDraft.startIdx === i) splitDraft.startIdx = j; else if (splitDraft.startIdx === j) splitDraft.startIdx = i;
    ctx.refreshSheet();
  },
  'se-cardio'(el, ctx) {
    const day = splitDraft.split.days[Number(el.dataset.i)];
    if (day.cardio) delete day.cardio; else day.cardio = { type: 'run', minutes: 20 };
    ctx.refreshSheet();
  },
  'se-save'(el, ctx) {
    const d = splitDraft;
    const err = document.getElementById('se-err');
    if (!d.split.days.length) { err.textContent = t('split.needDay'); return; }
    if (!d.split.days.some((x) => x.kind === 'train')) { err.textContent = t('split.needTrain'); return; }
    const mode = el.dataset.v; // 'keep' (aktiver Split) | 'save' | 'use'
    const now = today();
    const sp = { ...d.split, name: (d.split.name || '').trim() || null };
    if (sp.name && (sp.id === 'full' || sp.id === 'light') && sp.name === t('rhythm.' + sp.id)) sp.name = null;
    updTraining(ctx, (tr) => {
      const i = tr.splits.findIndex((x) => x.id === sp.id);
      if (i >= 0) tr.splits[i] = sp; else tr.splits.push(sp);
    });
    // Ab heute neu ausrichten (heute = gewählter Tag, frühere Tage bleiben) – beim aktiven Split nur, wenn sich die Tage
    // oder „Heute ist Tag“ geändert haben. Sonst blieben z. B. eine Verschiebung oder Tagesänderung von heute nicht
    // erhalten, nur weil man den Namen oder Cardio geändert hat (Prüfbericht K2).
    const [initSplit, initIdx] = JSON.parse(d.initial);
    const changed = JSON.stringify(sp.days.map(({ kind, planId }) => [kind, planId])) !== JSON.stringify(initSplit.days.map(({ kind, planId }) => [kind, planId])) || d.startIdx !== initIdx;
    if (mode === 'use' || (mode === 'keep' && changed)) {
      ctx.update((s) => restartAt(s, now, Math.min(d.startIdx, sp.days.length - 1), sp.id));
    }
    splitDraft = null;
    ctx.closeSheet();
    ctx.toast(t('split.saved'));
  },
  async 'se-delete'(el, ctx) {
    const id = splitDraft.split.id;
    if (!(await ctx.confirm(t('split.deleteConfirm', { name: splitName(splitDraft.split) || '?' }), t('common.delete')))) return;
    ctx.update((s) => {
      const tr = s.training;
      const wasActive = tr.activeSplit === id;
      tr.anchor.splitId ||= tr.activeSplit;
      tr.splits = tr.splits.filter((x) => x.id !== id);
      if (wasActive) restartAt(s, today(), 0, tr.splits[0].id);
    });
    splitDraft = null;
    ctx.closeSheet();
  },
  'split-use'(el, ctx) {
    openSplit(ctx, el.dataset.id);
  },

  // Trainings-Editor
  'plan-edit'(el, ctx) { openPlan(ctx, el.dataset.id); },
  'plan-new'(el, ctx) { openPlan(ctx, null); },
  'pe-add'(el, ctx) {
    planDraft.plan.ex.push({ id: `${planDraft.plan.id}-${uid()}`, name: '', target: null, muscle: planDraft.plan.ex.at(-1)?.muscle || 'chest', variant: null, optional: false });
    ctx.refreshSheet();
    const inputs = document.querySelectorAll('[data-in="pe-ex"][data-f="name"]');
    inputs[inputs.length - 1]?.focus();
  },
  'pe-del'(el, ctx) { planDraft.plan.ex.splice(Number(el.dataset.i), 1); ctx.refreshSheet(); },
  'pe-move'(el, ctx) {
    const i = Number(el.dataset.i); const j = i + Number(el.dataset.v);
    const ex = planDraft.plan.ex;
    if (j < 0 || j >= ex.length) return;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    ctx.refreshSheet();
  },
  'pe-save'(el, ctx) {
    const p = planDraft.plan;
    const err = document.getElementById('pe-err');
    p.name = (p.name || '').trim();
    if (!p.name) { err.textContent = t('plan.needName'); return; }
    p.ex = p.ex.map((e) => ({ ...e, name: e.name.trim() })).filter((e) => e.name);
    if (!p.ex.length) { err.textContent = t('plan.needEx'); return; }
    p.short = (p.short || '').trim() || null;
    const isNew = planDraft.isNew;
    ctx.update((s) => {
      const i = s.plans.findIndex((x) => x.id === p.id);
      if (i >= 0) s.plans[i] = p; else s.plans.push(p);
    });
    planDraft = null;
    ctx.closeSheet();
    ctx.toast(t(isNew ? 'plan.created' : 'plan.saved'));
  },
  async 'pe-delete'(el, ctx) {
    const id = planDraft.plan.id;
    if (!(await ctx.confirm(t('plan.deleteConfirm', { name: planDraft.plan.name }), t('common.delete')))) return;
    ctx.update((s) => {
      s.plans = s.plans.filter((x) => x.id !== id);
      // In Splits wird der Tag zum Ruhetag, geänderte Tage mit diesem Training gehen zurück zum Split
      for (const sp of s.training.splits) sp.days = sp.days.map((d) => (d.kind === 'train' && d.planId === id ? { kind: 'rest', ...(d.cardio ? { cardio: d.cardio } : {}) } : d));
      for (const [k, v] of Object.entries(s.dayChoice)) if (v === id) delete s.dayChoice[k];
    });
    planDraft = null;
    ctx.closeSheet();
  },

  // Cardio-Plan
  'cardio-plan'(el, ctx) { ctx.openSheet(cardioPlanSheet); },
  'cw-add'(el, ctx) {
    updTraining(ctx, (tr) => { (tr.weeklyCardio ||= []).push({ id: uid(), weekday: 2, type: 'run', minutes: 30 }); });
  },
  'cw-del'(el, ctx) {
    updTraining(ctx, (tr) => { tr.weeklyCardio = (tr.weeklyCardio || []).filter((w) => w.id !== el.dataset.id); });
  },
};

export const inputs = {
  'se-name'(el) { if (splitDraft) splitDraft.split.name = el.value; },
  'pe-name'(el) { if (planDraft) planDraft.plan.name = el.value; },
  'pe-short'(el) { if (planDraft) planDraft.plan.short = el.value; },
  'pe-ex'(el) {
    if (!planDraft || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    const e = planDraft.plan.ex[Number(el.dataset.i)];
    if (!e) return;
    const f = el.dataset.f;
    if (f === 'variant') e.variant = el.value.trim() ? { ...(e.variant || {}), name: el.value, target: e.variant?.target ?? null, note: e.variant?.note ?? null } : null;
    else e[f] = el.value;
  },
  'se-cmin'(el) {
    const day = splitDraft?.split.days[Number(el.dataset.i)];
    if (day?.cardio) day.cardio.minutes = parseNum(el.value) || null;
  },
};

export const changes = {
  'dp-other-cont'(el, ctx) { if (otherDraft) { otherDraft.cont = el.checked; ctx.refreshSheet(); } },
  'se-day'(el, ctx) {
    const i = Number(el.dataset.i);
    const old = splitDraft.split.days[i];
    splitDraft.split.days[i] = el.value === 'rest' ? { kind: 'rest', ...(old.cardio ? { cardio: old.cardio } : {}) } : { kind: 'train', planId: el.value, ...(old.cardio ? { cardio: old.cardio } : {}) };
    ctx.refreshSheet();
  },
  'se-ctype'(el) {
    const day = splitDraft?.split.days[Number(el.dataset.i)];
    if (day?.cardio) day.cardio.type = el.value;
  },
  'se-start'(el) { if (splitDraft) splitDraft.startIdx = Number(el.value); },
  'pe-ex'(el) {
    if (!planDraft) return;
    const e = planDraft.plan.ex[Number(el.dataset.i)];
    if (!e) return;
    if (el.type === 'checkbox') e[el.dataset.f === 'uni' ? 'uni' : 'optional'] = el.checked;
    else if (el.tagName === 'SELECT') e[el.dataset.f] = el.value;
  },
  cw(el, ctx) {
    const { id, f } = el.dataset;
    const v = f === 'type' ? el.value : parseNum(el.value);
    if (f === 'minutes' && (!v || v <= 0 || v > 600)) {
      ctx.toast(t('cardio.errMinutes'));
      el.value = (ctx.state.training.weeklyCardio || []).find((x) => x.id === id)?.minutes ?? ''; // alten Wert zeigen
      return;
    }
    updTraining(ctx, (tr) => {
      const w = (tr.weeklyCardio || []).find((x) => x.id === id);
      if (w) w[f] = f === 'type' ? v : Math.round(v);
    });
  },
};

/** Liste der Splits und Trainings für die Trainingsseite. */
export function manageCards(state) {
  const tr = state.training;
  const plans = Object.fromEntries(state.plans.map((p) => [p.id, p]));
  const splits = tr.splits.map((sp) => {
    const active = sp.id === tr.activeSplit;
    const seq = sp.days.map((d) => (d.kind === 'train' ? planShort(plans[d.planId]) || '?' : '–') + (d.cardio ? '+C' : '')).join(' · ');
    // Nur der Stift öffnet den Editor (Zeile selbst ist nicht antippbar)
    return `<div class="item"><div class="grow" style="min-width:0">
        <div style="font-weight:600">${esc(splitName(sp))} ${active ? `<span class="tag accent">${esc(t('split.active'))}</span>` : ''}</div>
        <div class="meta ellipsis">${esc(seq)}</div></div>
      <button class="icon-btn" data-act="split-edit" data-id="${esc(sp.id)}" aria-label="${esc(t('split.edit'))}">${icon(I.edit)}</button></div>`;
  }).join('');
  const planRows = state.plans.map((p) => `<div class="item"><div class="grow" style="min-width:0">
      <div style="font-weight:600">${esc(p.name)} <span class="tag">${esc(planShort(p))}</span></div>
      <div class="meta">${esc(planMuscles(p).map((m) => t('m.' + m)).join(' · '))} · ${esc(t('training.exCount', { n: p.ex.length }))}</div></div>
      <button class="icon-btn" data-act="plan-edit" data-id="${esc(p.id)}" aria-label="${esc(t('plan.editTitle'))}">${icon(I.edit)}</button></div>`).join('');
  const cw = cardioPlanSummary(state);
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('split.title'))}</h3><button class="link small" data-act="split-new">+ ${esc(t('split.new'))}</button></div>
      <div class="list">${splits}</div></section>
    <section class="card tight"><div class="card-head"><h3>${esc(t('cardio.plan'))}</h3><button class="link small" data-act="cardio-plan">${esc(t('split.edit'))}</button></div>
      <div class="small ${cw ? '' : 'muted'}">${esc(cw || t('cardio.planNone'))}</div></section>
    <section class="card tight"><div class="card-head"><h3>${esc(t('training.plans'))}</h3><button class="link small" data-act="plan-new">+ ${esc(t('plan.newTitle'))}</button></div>
      <div class="list">${planRows}</div></section>`;
}
