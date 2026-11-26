// Aktives Training: Sätze eintragen (Wiederholungen eingeben = Satz gemacht), Varianten tauschen, überspringen,
// Übungen verschieben (nur für dieses Training), Aufwärmsätze, PRs, Cardio anhängen
import { esc, num, icon, I, parseNum, e1rm } from '../util.js';
import { t } from '../i18n.js';
import { current, blankSet, lastSetsFor, bestFor, finishWorkout, workingSets, setE1rm, refillFor, UNI } from '../workout.js';
import { sheetHead } from '../ui.js';
import { CARDIO_TYPES } from './training.js';

export const immersive = true; // ohne untere Navigation

let timer = null;
let menu = null; // { ex, set } für das Satz-Menü

export function render(state) {
  const a = state.active;
  if (!a) {
    return `<header class="head"><div class="row"><a class="icon-btn" href="#/training" aria-label="${esc(t('common.back'))}">${icon(I.back)}</a><h1>${esc(t('active.none'))}</h1></div></header>
      <a class="btn primary" href="#/training">${esc(t('nav.training'))}</a>`;
  }
  const plan = state.plans.find((p) => p.id === a.planId);
  return `
    <header class="head"><div class="row grow"><a class="icon-btn" href="#/training" aria-label="${esc(t('common.back'))}">${icon(I.back)}</a>
      <div class="grow"><div class="tiny muted timer" id="timer">${elapsed(a.startedAt)}</div><h1 class="ellipsis" style="font-size:1.412rem">${esc(plan?.name || '')}</h1></div></div>
      <button class="btn primary" data-act="finish">${esc(t('active.finish'))}</button></header>
    ${a.exercises.map((ex, i) => exCard(state, ex, i, a.exercises.length)).join('')}
    ${cardioCard(a)}
    <label class="field">${esc(t('active.note'))}<textarea class="input" style="min-height:70px;padding:10px 12px" data-in="note">${esc(a.note || '')}</textarea></label>
    <button class="btn primary block" data-act="finish">${esc(t('active.finish'))}</button>
  `;
}

function elapsed(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

// ↑/↓: Reihenfolge nur für dieses Training (z. B. Maschine besetzt); gespeichert wird, wie es gemacht wurde
function moveBtns(i, count) {
  return `<div class="row" style="gap:2px">
    <button class="icon-btn sm" data-act="ex-move" data-ex="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('active.moveUp'))}">${icon(I.up)}</button>
    <button class="icon-btn sm" data-act="ex-move" data-ex="${i}" data-v="1" ${i === count - 1 ? 'disabled' : ''} aria-label="${esc(t('active.moveDown'))}">${icon(I.down)}</button></div>`;
}

function exCard(state, ex, i, count) {
  const c = current(ex);
  const uni = !!ex.uni;
  const last = lastSetsFor(state, c.name, uni);
  const best = bestFor(state, uni ? c.name + UNI : c.name);
  if (ex.skipped) {
    return `<section class="card tight ex-card skipped"><div class="row between"><div class="grow"><h3 class="ellipsis">${esc(c.name)}</h3><div class="meta small muted">${esc(ex.optional ? t('training.optional') : t('active.skipped'))}</div></div>
      ${moveBtns(i, count)}<button class="btn sm" data-act="skip" data-ex="${i}">${esc(t('active.doIt'))}</button></div></section>`;
  }
  let workNo = 0;
  const lastWork = last ? last.sets : [];
  const rows = c.sets.map((s) => {
    const label = s.warmup ? 'W' : String(++workNo);
    const prevSet = s.warmup ? lastWork.filter((x) => x.warmup)[0] : lastWork.filter((x) => !x.warmup)[workNo - 1];
    const isPr = s.done && !s.warmup && best && s.reps && (!uni || s.repsR) && setE1rm(s) > best.e1rm;
    const prevTxt = prevSet ? (uni && prevSet.repsR != null ? `${num(prevSet.kg, 2)}×${num(prevSet.reps)}/${num(prevSet.repsR)}` : `${num(prevSet.kg, 2)}×${num(prevSet.reps)}`) : '–';
    return `<div class="set-row ${uni ? 'uni' : ''} ${s.done ? 'done' : ''}">
      <button class="no ${s.warmup ? 'w' : ''}" data-act="set-menu" data-ex="${i}" data-set="${esc(s.id)}" aria-label="${esc(t('active.setMenu'))}">${label}</button>
      <span class="prev">${prevTxt}${isPr ? ' <span class="tag pr">PR</span>' : ''}</span>
      <input class="input num" inputmode="decimal" data-in="kg" data-ex="${i}" data-set="${esc(s.id)}" value="${s.kg ?? ''}" placeholder="kg" aria-label="kg">
      ${uni
        ? `<input class="input num" inputmode="numeric" data-in="reps" data-ex="${i}" data-set="${esc(s.id)}" value="${s.reps ?? ''}" placeholder="L" aria-label="${esc(t('active.repsLeft'))}">
      <input class="input num" inputmode="numeric" data-in="repsR" data-ex="${i}" data-set="${esc(s.id)}" value="${s.repsR ?? ''}" placeholder="R" aria-label="${esc(t('active.repsRight'))}">`
        : `<input class="input num" inputmode="numeric" data-in="reps" data-ex="${i}" data-set="${esc(s.id)}" value="${s.reps ?? ''}" placeholder="${esc(t('active.reps'))}" aria-label="${esc(t('active.reps'))}">`}
      <button class="check" data-act="check" data-ex="${i}" data-set="${esc(s.id)}" aria-pressed="${!!s.done}" aria-label="${esc(t('active.check'))}">${icon(I.check)}</button></div>`;
  }).join('');
  return `<section class="card tight ex-card">
    <div class="row between" style="align-items:flex-start"><div class="grow"><h3>${esc(c.name)}</h3>
      <div class="meta small muted">${uni ? `<span class="tag accent">${esc(t('active.uniShort'))}</span> ` : ''}${esc(c.target || '')} · ${esc(t('m.' + ex.muscle))}${c.note ? ` · ${esc(c.note)}` : ''}</div>
      <div class="tiny muted" style="margin-top:2px">${best ? esc(t('active.best', { v: num(best.e1rm, 1) })) : esc(t('active.firstTime'))}</div></div>
      <div class="row" style="gap:6px">
        ${ex.variant ? `<button class="icon-btn" data-act="swap" data-ex="${i}" aria-label="${esc(t('active.swap', { name: ex.useVar ? ex.name : ex.variant.name }))}" title="${esc(ex.useVar ? ex.name : ex.variant.name)}">${icon(I.swap)}</button>` : ''}
        ${moveBtns(i, count)}
        <button class="icon-btn" data-act="skip" data-ex="${i}" aria-label="${esc(t('active.skip'))}" title="${esc(t('active.skip'))}">${icon(I.x)}</button>
      </div></div>
    ${ex.useVar ? `<div class="tiny"><span class="tag accent">${esc(t('training.variant'))}</span> ${esc(t('active.insteadOf', { name: ex.name }))}</div>` : ''}
    <div class="set-head ${uni ? 'uni' : ''}"><span>${esc(t('active.set'))}</span><span style="text-align:center">${esc(t('active.last'))}</span><span style="text-align:center">kg</span>${uni
      ? `<span style="text-align:center">${esc(t('active.repsLeftShort'))}</span><span style="text-align:center">${esc(t('active.repsRightShort'))}</span>`
      : `<span style="text-align:center">${esc(t('active.reps'))}</span>`}<span class="uni-cell"><button class="uni-pill" data-act="uni" data-ex="${i}" aria-pressed="${uni}" aria-label="${esc(t('active.uni'))}" title="${esc(t('active.uni'))}">L/R</button></span></div>
    ${rows}
    <div class="grid2"><button class="btn sm ghost" data-act="add-warmup" data-ex="${i}">${icon(I.plus)} ${esc(t('active.addWarmup'))}</button><button class="btn sm ghost" data-act="add-set" data-ex="${i}">${icon(I.plus)} ${esc(t('active.addSet'))}</button></div>
  </section>`;
}

function cardioCard(a) {
  if (!a.cardio) return `<button class="btn ghost" data-act="cardio-on">${icon(I.run)} ${esc(t('active.addCardio'))}</button>`;
  const c = a.cardio;
  return `<section class="card tight"><div class="row between"><h3>${esc(t('active.cardioAfter'))}</h3><button class="link" data-act="cardio-off">${esc(t('common.remove'))}</button></div>
    <div class="chips">${CARDIO_TYPES.slice(0, 6).map((k) => `<button class="chip" data-act="cardio-type" data-v="${k}" aria-pressed="${c.type === k}">${esc(t('cardio.' + k))}</button>`).join('')}</div>
    <div class="grid2"><label class="field">${esc(t('cardio.minutes'))}<input class="input" inputmode="numeric" data-in="cardio-min" value="${c.minutes ?? ''}"></label>
    <label class="field">${esc(t('cardio.km'))}<input class="input" inputmode="decimal" data-in="cardio-km" value="${c.km ?? ''}"></label></div></section>`;
}

function menuSheet(state) {
  if (!menu || !state.active) return null;
  const ex = state.active.exercises[menu.ex];
  const s = current(ex).sets.find((x) => x.id === menu.set);
  if (!s) return null;
  return `${sheetHead(t('active.setMenu'))}
    <button class="btn block" data-act="toggle-warmup">${esc(s.warmup ? t('active.makeWork') : t('active.makeWarmup'))}</button>
    <div class="tiny muted">${esc(t('active.warmupHint'))}</div>
    <button class="btn block danger" data-act="remove-set">${icon(I.trash)} ${esc(t('active.removeSet'))}</button>`;
}

function finishSheet(state) {
  const a = state.active;
  if (!a) return null;
  const done = a.exercises.filter((e) => !e.skipped).reduce((n, e) => n + current(e).sets.filter((s) => s.done && !s.warmup).length, 0);
  const open = a.exercises.filter((e) => !e.skipped).reduce((n, e) => n + current(e).sets.filter((s) => !s.done).length, 0);
  return `${sheetHead(t('active.finishTitle'))}
    <div class="small">${esc(t('active.finishSummary', { done, open }))}</div>
    ${open ? `<div class="tiny muted">${esc(t('active.openNotSaved'))}</div>` : ''}
    <button class="btn primary block" data-act="save" ${done ? '' : 'disabled'}>${esc(t('active.save'))}</button>
    <button class="btn block danger" data-act="discard">${esc(t('active.discard'))}</button>`;
}

// Hilfen zum Ändern des laufenden Trainings
function withEx(ctx, i, fn, opts) {
  ctx.update((s) => { const ex = s.active?.exercises[i]; if (ex) fn(ex, s); }, opts);
}
function setsOf(ex) { return ex.useVar && ex.variant ? ex.varSets : ex.sets; }

export function mounted() {
  clearInterval(timer);
  timer = setInterval(() => {
    const el = document.getElementById('timer');
    const a = window.__gmt?.store.get().active;
    if (!el || !a) { clearInterval(timer); return; }
    el.textContent = elapsed(a.startedAt);
  }, 1000);
}

export const actions = {
  check(el, ctx) {
    withEx(ctx, +el.dataset.ex, (ex) => {
      const s = setsOf(ex).find((x) => x.id === el.dataset.set);
      if (!s) return;
      // Abhaken ohne eingetippte Werte = „gleich wie letztes Mal“: leere Felder mit dem Satz vom letzten Mal füllen
      if (!s.done && (s.kg == null || !s.reps || (ex.uni && !s.repsR))) {
        const row = el.closest('.set-row');
        const kg = parseNum(row.querySelector('[data-in="kg"]').value);
        const reps = parseNum(row.querySelector('[data-in="reps"]').value);
        const prev = prevSetFor(ctx.state, ex, s);
        s.kg = kg ?? s.kg ?? prev?.kg ?? null;
        s.reps = reps ?? s.reps ?? prev?.reps ?? null;
        if (ex.uni) {
          const repsR = parseNum(row.querySelector('[data-in="repsR"]')?.value);
          s.repsR = repsR ?? s.repsR ?? prev?.repsR ?? prev?.reps ?? null;
        }
      }
      s.done = !s.done;
    });
  },
  'ex-move'(el, ctx) {
    const i = +el.dataset.ex; const j = i + Number(el.dataset.v);
    ctx.update((s) => {
      const list = s.active?.exercises;
      if (!list || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    });
  },
  swap(el, ctx) { withEx(ctx, +el.dataset.ex, (ex) => { ex.useVar = !ex.useVar; }); },
  // Einseitig an/aus: offene Sätze bekommen die kg vom letzten Mal in dieser Ausführung, erledigte bleiben
  uni(el, ctx) {
    withEx(ctx, +el.dataset.ex, (ex, s) => {
      ex.uni = !ex.uni;
      ex.sets = refillFor(s, ex.name, ex.uni, ex.sets);
      if (ex.variant && ex.varSets) ex.varSets = refillFor(s, ex.variant.name, ex.uni, ex.varSets);
    });
  },
  skip(el, ctx) { withEx(ctx, +el.dataset.ex, (ex) => { ex.skipped = !ex.skipped; }); },
  'add-set'(el, ctx) {
    withEx(ctx, +el.dataset.ex, (ex) => {
      const sets = setsOf(ex);
      const lastWork = [...sets].reverse().find((s) => !s.warmup);
      sets.push(blankSet(false, lastWork?.kg ?? null, lastWork?.reps ?? null, ex.uni ? (lastWork?.repsR ?? lastWork?.reps ?? null) : null));
    });
  },
  'add-warmup'(el, ctx) {
    withEx(ctx, +el.dataset.ex, (ex) => {
      const sets = setsOf(ex);
      const firstWork = sets.find((s) => !s.warmup);
      const kg = firstWork?.kg ? Math.round(firstWork.kg / 2 / 2.5) * 2.5 : null;
      const lastW = sets.map((s) => s.warmup).lastIndexOf(true);
      sets.splice(lastW + 1, 0, blankSet(true, kg, firstWork?.reps ?? 10, ex.uni ? (firstWork?.repsR ?? firstWork?.reps ?? 10) : null));
    });
  },
  'set-menu'(el, ctx) { menu = { ex: +el.dataset.ex, set: el.dataset.set }; ctx.openSheet(menuSheet); },
  'toggle-warmup'(el, ctx) {
    withEx(ctx, menu.ex, (ex) => {
      const sets = setsOf(ex);
      const idx = sets.findIndex((x) => x.id === menu.set);
      const [s] = sets.splice(idx, 1);
      s.warmup = !s.warmup;
      // Aufwärmsätze stehen immer vor den Arbeitssätzen
      const lastW = sets.map((x) => x.warmup).lastIndexOf(true);
      sets.splice(lastW + 1, 0, s);
    });
    ctx.closeSheet();
  },
  'remove-set'(el, ctx) {
    const { ex: i, set } = menu;
    let removed; let idx;
    withEx(ctx, i, (ex) => { const sets = setsOf(ex); idx = sets.findIndex((x) => x.id === set); [removed] = sets.splice(idx, 1); });
    ctx.closeSheet();
    ctx.toast(t('active.setRemoved'), () => withEx(ctx, i, (ex) => setsOf(ex).splice(idx, 0, removed)));
  },
  'cardio-on'(el, ctx) { ctx.update((s) => { s.active.cardio = { type: 'treadmill', minutes: null, km: null }; }); },
  'cardio-off'(el, ctx) { ctx.update((s) => { s.active.cardio = null; }); },
  'cardio-type'(el, ctx) { ctx.update((s) => { s.active.cardio.type = el.dataset.v; }); },
  finish(el, ctx) { ctx.openSheet(finishSheet); },
  save(el, ctx) {
    const before = ctx.state.active;
    // PRs vor dem Speichern bestimmen (Vergleich mit bisherigen Bestwerten)
    const prs = before.exercises.filter((e) => !e.skipped).filter((e) => {
      const c = current(e); const best = bestFor(ctx.state, e.uni ? c.name + UNI : c.name);
      return best && workingSets({ sets: c.sets, uni: e.uni }).some((s) => setE1rm(s) > best.e1rm);
    }).length;
    ctx.closeSheet();
    ctx.update((s) => { finishWorkout(s); }, { silent: true });
    ctx.go('training');
    ctx.toast(prs ? t('active.savedPr', { n: prs }) : t('active.saved'));
  },
  async discard(el, ctx) {
    if (!(await ctx.confirm(t('active.discardConfirm'), t('active.discard')))) return;
    ctx.closeSheet();
    ctx.update((s) => { s.active = null; }, { silent: true });
    ctx.go('training');
  },
};

export const inputs = {
  kg(el, ctx) { patchSet(ctx, el, 'kg'); },
  reps(el, ctx) { patchSet(ctx, el, 'reps'); },
  repsR(el, ctx) { patchSet(ctx, el, 'repsR'); },
  note(el, ctx) { ctx.update((s) => { s.active.note = el.value; }, { silent: true }); },
  'cardio-min'(el, ctx) { ctx.update((s) => { s.active.cardio.minutes = parseNum(el.value); }, { silent: true }); },
  'cardio-km'(el, ctx) { ctx.update((s) => { s.active.cardio.km = parseNum(el.value); }, { silent: true }); },
};

function patchSet(ctx, el, field) {
  // Still speichern: kein Neuzeichnen, damit die Tastatur offen bleibt
  let done = null;
  withEx(ctx, +el.dataset.ex, (ex) => {
    const s = setsOf(ex).find((x) => x.id === el.dataset.set);
    if (!s) return;
    s[field] = parseNum(el.value);
    // Wiederholungen eingetragen = Satz gemacht (einseitig: beide Seiten); gelöscht = wieder offen
    if (field === 'reps' || field === 'repsR') { s.done = s.reps > 0 && (!ex.uni || s.repsR > 0); done = s.done; }
  }, { silent: true });
  if (done != null) {
    const row = el.closest('.set-row');
    row?.classList.toggle('done', done);
    row?.querySelector('.check')?.setAttribute('aria-pressed', String(done));
  }
}

/** Satz vom letzten Mal an derselben Stelle (Aufwärmsatz ↔ Aufwärmsatz, n-ter Arbeitssatz ↔ n-ter). */
function prevSetFor(state, ex, s) {
  const c = current(ex);
  const last = lastSetsFor(state, c.name, !!ex.uni);
  if (!last) return null;
  if (s.warmup) return last.sets.find((x) => x.warmup) || null;
  const n = c.sets.filter((x) => !x.warmup).indexOf(s);
  const work = last.sets.filter((x) => !x.warmup);
  return work[n] || work[work.length - 1] || null;
}
