// Ernährung: Tagebuch eines Tages, nach Mahlzeiten, mit Bearbeiten/Löschen
import { esc, num, today, addDays, icon, I, parseNum } from '../util.js';
import { t, longDate } from '../i18n.js';
import { goals, sumEntries, dayEntries, MEALS, forGrams } from '../nutrition.js';
import { header, bar, energy, sheetHead } from '../ui.js';

let editId = null;

const dateOf = (params) => params.date || today();

export function render(state, params) {
  const key = dateOf(params);
  const g = goals(state);
  const entries = dayEntries(state, key);
  const tot = sumEntries(entries);
  const isToday = key === today();
  const nav = `<div class="row">
    <a class="icon-btn" href="#/food?date=${addDays(key, -1)}" aria-label="${esc(t('common.prevDay'))}">${icon(I.back)}</a>
    <a class="icon-btn" ${isToday ? 'aria-disabled="true" style="opacity:.35;pointer-events:none"' : `href="#/food?date=${addDays(key, 1)}"`} aria-label="${esc(t('common.nextDay'))}">${icon(I.chevron)}</a></div>`;

  const meals = MEALS.map((m) => {
    const list = entries.filter((e) => e.meal === m);
    const kcal = list.reduce((s, e) => s + e.n.kcal, 0);
    const rows = list.map((e) => `<div class="item"><button class="item-btn grow" data-act="edit" data-id="${esc(e.id)}">
        <div class="ellipsis" style="font-weight:600">${esc(e.name)}</div>
        <div class="meta">${num(e.grams)} g · ${t('n.pShort')} ${num(e.n.p)} · ${t('n.cShort')} ${num(e.n.c)} · ${t('n.fShort')} ${num(e.n.f)}</div></button>
        <span class="small muted">${energy(state, e.n.kcal)}</span></div>`).join('');
    return `<section class="card tight">
      <div class="card-head"><h3>${esc(t('meal.' + m))}</h3><span class="small muted">${list.length ? energy(state, kcal) : ''}</span></div>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(t('food.nothingYet'))}</div>`}
      <a class="btn sm ghost" href="#/food/add?meal=${m}&date=${key}">${icon(I.plus)} ${esc(t('food.add'))}</a>
    </section>`;
  }).join('');

  return `
    ${header(t('nav.food'), isToday ? longDate(key) + ' · ' + t('common.today') : longDate(key), nav)}
    <section class="card">
      <div class="row between"><div><div class="tiny muted">${esc(t('food.eaten'))}</div><div class="big">${energy(state, tot.kcal)}</div></div>
      <div style="text-align:right"><div class="tiny muted">${esc(t('food.goal'))}</div><div class="small">${energy(state, g.kcal)}</div></div></div>
      ${bar(t('n.p'), tot.p, g.p, 'var(--protein)')}
      ${bar(t('n.c'), tot.c, g.c, 'var(--carbs)')}
      ${bar(t('n.f'), tot.f, g.f, 'var(--fat)')}
    </section>
    ${meals}
    <section class="card tight">
      <h3>${esc(t('food.more'))}</h3>
      <div class="grid3">
        ${mini(t('n.fiber'), tot.fiber, g.fiber, 'g')}
        ${mini(t('n.sugar'), tot.sugar, g.sugar, 'g', true)}
        ${mini(t('n.salt'), tot.salt, g.salt, 'g', true)}
      </div>
    </section>`;
}

function mini(label, v, goal, unit, isMax = false) {
  const over = isMax && v > goal;
  return `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(label)}</span><span style="font-weight:700;${over ? 'color:var(--warn)' : ''}">${num(v, 1)} ${unit}</span><span class="tiny muted">${isMax ? t('food.max') : t('food.target')} ${num(goal)} ${unit}</span></div>`;
}

function editSheet(state, ctx) {
  const key = dateOf(ctx.params);
  const e = dayEntries(state, key).find((x) => x.id === editId);
  if (!e) return null;
  return `${sheetHead(e.name)}
    <div class="chips">${MEALS.map((m) => `<button class="chip" data-act="edit-meal" data-v="${m}" aria-pressed="${e.meal === m}">${esc(t('meal.' + m))}</button>`).join('')}</div>
    <label class="field">${esc(t('food.amount'))}<input class="input" inputmode="decimal" data-in="edit-grams" value="${esc(e.grams)}"></label>
    <div class="small muted" id="edit-preview">${preview(state, e, e.grams)}</div>
    <div class="row"><button class="btn danger grow" data-act="delete">${icon(I.trash)} ${esc(t('common.delete'))}</button><button class="btn primary grow" data-act="sheet-close">${esc(t('common.done'))}</button></div>`;
}

function preview(state, e, grams) {
  const n = forGrams(e.per100, grams || 0);
  return `${energy(state, n.kcal)} · ${t('n.pShort')} ${num(n.p, 1)} g · ${t('n.cShort')} ${num(n.c, 1)} g · ${t('n.fShort')} ${num(n.f, 1)} g`;
}

function patchEntry(ctx, fn) {
  const key = dateOf(ctx.params);
  ctx.update((s) => { const e = (s.diary[key] || []).find((x) => x.id === editId); if (e) fn(e); });
}

export const actions = {
  edit(el, ctx) { editId = el.dataset.id; ctx.openSheet(editSheet); },
  'edit-meal'(el, ctx) { patchEntry(ctx, (e) => { e.meal = el.dataset.v; }); },
  delete(el, ctx) {
    const key = dateOf(ctx.params);
    const list = ctx.state.diary[key] || [];
    const idx = list.findIndex((x) => x.id === editId);
    if (idx < 0) return;
    const removed = list[idx];
    ctx.closeSheet();
    ctx.update((s) => { s.diary[key].splice(idx, 1); });
    ctx.toast(t('food.deleted', { name: removed.name }), () => ctx.update((s) => { (s.diary[key] ||= []).splice(idx, 0, removed); }));
  },
};

export const inputs = {
  'edit-grams'(el, ctx) {
    const g = parseNum(el.value);
    const key = dateOf(ctx.params);
    const e = (ctx.state.diary[key] || []).find((x) => x.id === editId);
    if (!e || g == null) return;
    // Ohne Neuzeichnen speichern, damit das Eingabefeld den Fokus behält
    ctx.update((s) => { const x = s.diary[key].find((y) => y.id === editId); x.grams = g; x.n = forGrams(x.per100, g); }, { silent: true });
    document.getElementById('edit-preview').innerHTML = preview(ctx.state, e, g);
  },
};
export const changes = {
  'edit-grams'(el, ctx) { ctx.render(); },
};
