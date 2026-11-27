// Übungen: Liste aller Übungen (Training → Übungen), Übung bearbeiten (Name, Muskel, kg pro Seite, Grundgewicht,
// einseitig) und die Auswahl „Übung hinzufügen“ im laufenden Training.
import { esc, num, icon, I, parseNum } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { MUSCLES, livePlans } from '../plan.js';
import { allExercises, libEntry, setLib, renameExercise, loadOf, historyCount, reapplyHistory, targetList } from '../exercises.js';
import { bestFor } from '../workout.js';
import { sheetHead } from '../ui.js';

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const muscleSelect = (attrs, value) => `<select class="input" ${attrs}>${MUSCLES.map((m) => opt(m, t('m.' + m), m === value)).join('')}</select>`;

function tags(x) {
  const lib = x.lib || {};
  return [lib.x2 ? `<span class="tag accent">${esc(t('ex.x2Tag'))}</span>` : '', lib.base > 0 ? `<span class="tag">${esc(t('ex.baseTag', { kg: num(lib.base, 2) }))}</span>` : '',
    lib.uni ? `<span class="tag">${esc(t('active.uniShort'))}</span>` : ''].filter(Boolean).join(' ');
}

// ---------- Liste (Training → Übungen) ----------
export function libCards(state) {
  const list = allExercises(state);
  const byMuscle = MUSCLES.map((m) => [m, list.filter((x) => (x.muscle || 'core') === m)]).filter(([, xs]) => xs.length);
  const rows = (xs) => xs.map((x) => `<button type="button" class="item item-btn" data-act="xl-edit" data-name="${esc(x.name)}">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${esc(x.name)} ${tags(x)}</div>
        <div class="meta ellipsis">${esc(x.plans.length ? t('ex.inPlans', { list: x.plans.join(', ') }) : t('ex.notInPlan'))}${x.last ? ` · ${esc(t('ex.lastDone', { date: shortDate(x.last) }))}` : ''}</div></div>${icon(I.chevron)}</button>`).join('');
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('ex.title'))}</h3><button class="link small" data-act="xl-new">+ ${esc(t('ex.new'))}</button></div>
      <div class="tiny muted">${esc(t('ex.libHint'))}</div></section>
    ${byMuscle.length ? byMuscle.map(([m, xs]) => `<section class="card tight"><div class="card-head"><h3>${esc(t('m.' + m))}</h3><span class="small muted">${num(xs.length)}</span></div><div class="list">${rows(xs)}</div></section>`).join('')
    : `<div class="small muted">${esc(t('ex.none'))}</div>`}`;
}

// ---------- Bearbeiten ----------
// { from: alter Name | null, name, muscle, target, x2, base, uni, onPick: im Training neu angelegt → danach anhängen }
let draft = null;

function editSheet(state) {
  if (!draft) return null;
  const info = draft.from ? allExercises(state).find((x) => x.name.toLowerCase() === draft.from.toLowerCase()) : null;
  const best = draft.from ? bestFor(state, draft.from) : null;
  const ex = { x2: draft.x2, base: draft.base };
  const sample = draft.x2 || draft.base > 0 ? t('ex.example', { typed: num(20, 2), load: num(loadOf(ex, 20), 2) }) : '';
  const canDelete = info?.lib && !info.plans.length;
  return `${sheetHead(draft.from ? t('ex.editTitle') : t('ex.new'))}
    <label class="field">${esc(t('ex.name'))}<input class="input" data-in="xl-name" value="${esc(draft.name)}" maxlength="60" autocomplete="off" ${draft.from ? '' : 'autofocus'}></label>
    <div class="grid2"><label class="field">${esc(t('ex.muscle'))}${muscleSelect('data-in="xl-muscle"', draft.muscle)}</label>
      <label class="field">${esc(t('ex.target'))}<input class="input" data-in="xl-target" data-combo="ex-targets" value="${esc(draft.target || '')}" maxlength="40" placeholder="${esc(t('plan.target'))}" autocomplete="off"></label>${targetList(state)}</div>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" data-in="xl-x2" ${draft.x2 ? 'checked' : ''} style="margin-top:3px">
      <span><b>${esc(t('ex.x2'))}</b><br><span class="tiny muted">${esc(t('ex.x2Hint'))}</span></span></label>
    <label class="field">${esc(t('ex.base'))}<input class="input" data-in="xl-base" inputmode="decimal" value="${draft.base ?? ''}" placeholder="0"></label>
    <div class="tiny muted" style="margin-top:-6px">${esc(t('ex.baseHint'))}</div>
    <div class="small" id="xl-sample" style="color:var(--accent)">${esc(sample)}</div>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" data-in="xl-uni" ${draft.uni ? 'checked' : ''} style="margin-top:3px">
      <span><b>${esc(t('plan.uni'))}</b>${draft.onPick ? '' : `<br><span class="tiny muted">${esc(t('ex.uniHint'))}</span>`}</span></label>
    ${info ? `<div class="tiny muted">${esc(info.plans.length ? t('ex.inPlans', { list: info.plans.join(', ') }) : t('ex.notInPlan'))}${info.count ? ` · ${esc(t('ex.timesN', { n: info.count }))}` : ''}${info.last ? ` · ${esc(t('ex.lastDone', { date: shortDate(info.last) }))}` : ''}${best ? ` · ${esc(t('active.best', { v: num(best.e1rm, 1) }))}` : ''}</div>` : ''}
    <div class="sheet-actions"><div class="small" id="xl-err" style="color:var(--bad)"></div>
      <button class="btn primary block" data-act="xl-save">${esc(draft.onPick ? t('ex.addToWorkout') : t('common.save'))}</button>
      ${canDelete ? `<button class="btn danger block" data-act="xl-delete">${icon(I.trash)} ${esc(t('ex.delete'))}</button>` : ''}</div>`;
}

function openEdit(ctx, name, { onPick = null, prefill = '', muscle = 'chest' } = {}) {
  const info = name ? allExercises(ctx.state).find((x) => x.name.toLowerCase() === name.toLowerCase()) : null;
  const lib = name ? libEntry(ctx.state, name) : null;
  draft = { from: name || null, name: name || prefill, muscle: info?.muscle || muscle, target: lib?.target || (name ? planTarget(ctx.state, name) : ''), x2: !!lib?.x2, base: lib?.base ?? null, uni: !!lib?.uni, onPick };
  draft.targetBefore = draft.target;
  ctx.openSheet(editSheet);
}

/** Ziel der Übung aus den Trainings (erstes gefundenes, auch als Variante). */
function planTarget(state, name) {
  const n = name.toLowerCase();
  for (const p of livePlans(state)) {
    for (const e of p.ex || []) {
      if (e.name.toLowerCase() === n && e.target) return e.target;
      if (e.variant?.name?.toLowerCase() === n && e.variant.target) return e.variant.target;
    }
  }
  return '';
}

function updateSample() {
  const el = document.getElementById('xl-sample');
  if (!el || !draft) return;
  const ex = { x2: draft.x2, base: draft.base };
  el.textContent = draft.x2 || draft.base > 0 ? t('ex.example', { typed: num(20, 2), load: num(loadOf(ex, 20), 2) }) : '';
}

/**
 * kg pro Seite / Grundgewicht geändert und die Übung kommt schon im Verlauf vor → fragen, ob frühere Trainings auch so
 * gerechnet werden sollen (meist ja: man hat dort schon pro Seite bzw. ohne Stange eingetragen). → true = umrechnen.
 */
export async function askHistory(ctx, name, old, next) {
  if (!name) return false;
  const changed = !!old?.x2 !== !!next.x2 || (old?.base || null) !== (next.base > 0 ? next.base : null);
  const n = historyCount(ctx.state, name);
  if (!changed || !n) return false;
  return ctx.confirm(t('ex.historyAsk', { name, n }), t('ex.historyYes'), { destructive: false, cancelLabel: t('ex.historyNo') });
}

// ---------- Auswahl im Training ----------
let picker = null; // { q, onPick(name, muscle) }

function pickerSheet(state) {
  if (!picker) return null;
  const q = picker.q.trim().toLowerCase();
  const list = allExercises(state).filter((x) => !q || x.name.toLowerCase().includes(q));
  const rows = list.slice(0, 60).map((x) => `<button type="button" class="item item-btn" data-act="xp-pick" data-name="${esc(x.name)}">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${esc(x.name)}</div><div class="meta">${esc(x.muscle ? t('m.' + x.muscle) : '')}${x.last ? ` · ${esc(t('ex.lastDone', { date: shortDate(x.last) }))}` : ''}</div></div>${icon(I.plus)}</button>`).join('');
  return `${sheetHead(t('active.addEx'))}
    <button class="btn block" data-act="xp-new">${icon(I.plus)} ${esc(q && !list.some((x) => x.name.toLowerCase() === q) ? t('ex.addNew', { name: picker.q.trim() }) : t('ex.new'))}</button>
    <input class="input" data-in="xp-q" value="${esc(picker.q)}" placeholder="${esc(t('ex.search'))}" autocomplete="off">
    ${rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(q ? t('ex.noMatch') : t('ex.none'))}</div>`}`;
}

/** Auswahl öffnen; `onPick(name, muscle)` wird mit der gewählten oder neu angelegten Übung aufgerufen. */
export function openPicker(ctx, onPick) {
  picker = { q: '', onPick };
  ctx.openSheet(pickerSheet);
}

export const actions = {
  'xl-new'(el, ctx) { openEdit(ctx, null); },
  'xl-edit'(el, ctx) { openEdit(ctx, el.dataset.name); },
  async 'xl-save'(el, ctx) {
    const err = document.getElementById('xl-err');
    const name = draft.name.trim();
    if (!name) { err.textContent = t('ex.needName'); return; }
    const all = allExercises(ctx.state);
    const renamed = draft.from && draft.from.toLowerCase() !== name.toLowerCase();
    if ((!draft.from || renamed) && all.some((x) => x.name.toLowerCase() === name.toLowerCase())) { err.textContent = t('ex.exists'); return; }
    const used = draft.from && all.find((x) => x.name.toLowerCase() === draft.from.toLowerCase());
    if (renamed && (used?.plans.length || used?.count) && !(await ctx.confirm(t('ex.renameConfirm', { from: draft.from, to: name }), t('ex.rename')))) return;
    const d = draft;
    const old = draft.from ? libEntry(ctx.state, draft.from) : null;
    const reapply = await askHistory(ctx, draft.from, old, d);
    ctx.update((s) => {
      if (renamed) renameExercise(s, d.from, name);
      if (reapply) reapplyHistory(s, name, { x2: !!d.x2, base: d.base });
      // Muskel auch in den Trainings übernehmen, damit Fortschritt (Sätze pro Muskel) stimmt; geändertes Ziel ebenso
      const target = (d.target || '').trim();
      const targetChanged = target !== (d.targetBefore || '').trim();
      for (const p of s.plans || []) {
        for (const e of p.ex || []) {
          if (e.name.toLowerCase() === name.toLowerCase()) { e.muscle = d.muscle; if (targetChanged) e.target = target; }
          if (targetChanged && e.variant?.name?.toLowerCase() === name.toLowerCase()) e.variant.target = target || null;
        }
      }
      setLib(s, name, { name, muscle: d.muscle, x2: !!d.x2, base: d.base > 0 ? d.base : null, uni: !!d.uni, ...(target ? { target } : { target: null }) });
    }, d.onPick ? { silent: true } : undefined);
    draft = null;
    ctx.closeSheet();
    // Im Training „Neue Übung“: gleich anhängen
    if (d.onPick) d.onPick(name, d.muscle); else ctx.toast(t('ex.saved'));
  },
  async 'xl-delete'(el, ctx) {
    const name = draft.from;
    if (!(await ctx.confirm(t('ex.deleteConfirm', { name }), t('common.delete')))) return;
    ctx.update((s) => { s.exLib = (s.exLib || []).filter((x) => x.name.toLowerCase() !== name.toLowerCase()); });
    draft = null;
    ctx.closeSheet();
    ctx.toast(t('ex.deleted'));
  },
  'xp-pick'(el, ctx) {
    const name = el.dataset.name;
    const x = allExercises(ctx.state).find((e) => e.name === name);
    const cb = picker?.onPick;
    picker = null;
    ctx.closeSheet();
    cb?.(name, x?.muscle || null);
  },
  // „Neue Übung“ in der Auswahl: volles Formular (Name, Muskel, Ziel, kg pro Seite, Grundgewicht, einseitig) –
  // ohne Variante/optional, weil man genau diese Übung macht. Gespeichert kommt sie in die Übungsliste und ins Training.
  'xp-new'(el, ctx) {
    const cb = picker?.onPick;
    const prefill = picker?.q.trim() || '';
    picker = null;
    openEdit(ctx, null, { onPick: cb, prefill });
  },
};

export const inputs = {
  'xl-name'(el) { if (draft) draft.name = el.value; },
  'xl-target'(el) { if (draft) draft.target = el.value; },
  'xl-base'(el) { if (draft) { draft.base = parseNum(el.value); updateSample(); } },
  'xp-q'(el, ctx) { if (picker) { picker.q = el.value; ctx.refreshSheet(); } },
};

export const changes = {
  'xl-muscle'(el) { if (draft) draft.muscle = el.value; },
  'xl-x2'(el) { if (draft) { draft.x2 = el.checked; updateSample(); } },
  'xl-uni'(el) { if (draft) draft.uni = el.checked; },
};
