// Ernährung: Tab "Tagebuch" (ein Tag, nach Mahlzeiten, mit Bearbeiten/Löschen) und Tab "Rezepte" (eigene + Entdecken)
import { esc, num, today, addDays, icon, I, parseNum, uid } from '../util.js';
import { t, longDate } from '../i18n.js';
import { goals, sumEntries, dayEntries, MEALS, forGrams } from '../nutrition.js';
import { header, bar, energy, sheetHead, seg } from '../ui.js';
import { portionsLabel, recipeFood } from '../recipes.js';
import * as browser from './recipeBrowser.js';

let editId = null;

const dateOf = (params) => params.date || today();

const tabOf = (params) => (params.tab === 'recipes' ? 'recipes' : 'diary');

function tabs(params) {
  return seg('food-tab', [['diary', t('food.tabDiary')], ['recipes', t('food.tabRecipes')]], tabOf(params));
}

export function render(state, params, ctx) {
  if (tabOf(params) === 'recipes') return renderRecipes(state, ctx);
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
        <div class="meta">${e.portions ? esc(portionsLabel(e.portions)) + ' · ' : ''}${num(e.grams)} g · ${t('n.pShort')} ${num(e.n.p)} · ${t('n.cShort')} ${num(e.n.c)} · ${t('n.fShort')} ${num(e.n.f)}</div></button>
        <span class="small muted">${energy(state, e.n.kcal)}</span></div>`).join('');
    return `<section class="card tight">
      <div class="card-head"><h3>${esc(t('meal.' + m))}</h3><span class="small muted">${list.length ? energy(state, kcal) : ''}</span></div>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(t('food.nothingYet'))}</div>`}
      <a class="btn sm ghost" href="#/food/add?meal=${m}&date=${key}">${icon(I.plus)} ${esc(t('food.add'))}</a>
    </section>`;
  }).join('');

  return `
    ${header(t('nav.food'), isToday ? longDate(key) + ' · ' + t('common.today') : longDate(key), nav)}
    ${tabs(params)}
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

// ---------- Tab Rezepte ----------
let rbTab = 'mine'; // 'mine' | 'discover'
let rbQuery = '';

function renderRecipes(state, ctx) {
  if (rbTab === 'discover' && browser.discover.status === 'idle') setTimeout(() => browser.load(() => refreshRecipeList(ctx)), 0);
  return `
    ${header(t('nav.food'))}
    ${tabs({ tab: 'recipes' })}
    <button class="btn primary block" data-act="rb-new">${icon(I.plus)} ${esc(t('recipe.create'))}</button>
    ${seg('rb-tab', [['mine', t('recipe.mine')], ['discover', t('recipe.discover')]], rbTab)}
    <div class="search">${icon(I.search)}<input class="input" id="rb-q" type="search" data-in="rb-q" value="${esc(rbQuery)}" placeholder="${esc(t('recipe.searchPh'))}" autocomplete="off"></div>
    <section class="card tight" id="rb-list">${recipeListHtml(state)}</section>`;
}

function recipeListHtml(state) {
  if (rbTab === 'discover') return browser.listHtml(state, rbQuery);
  const needle = rbQuery.trim().toLowerCase();
  const all = (state.recipes || []).filter((r) => r.name?.trim() || r.items?.length);
  const list = all.filter((r) => !needle || (r.name || '').toLowerCase().includes(needle))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  if (!all.length) return `<div class="small muted">${esc(t('recipe.none'))}</div>`;
  if (!list.length) return `<div class="small muted">${esc(t('recipe.noMatch'))}</div>`;
  return `<div class="list">${list.map((r) => {
    const f = recipeFood(r);
    const n = r.items?.length || 0;
    return `<div class="item"><button class="item-btn grow" data-act="rb-edit" data-id="${esc(r.id)}">
        <div class="ellipsis" style="font-weight:600">${esc(r.name || t('recipe.title'))}</div>
        <div class="meta ellipsis">${n ? `${energy(state, f.perPortion.kcal)} ${esc(t('recipe.perPortionShort'))} · ${esc(t('n.pShort'))} ${num(f.perPortion.p)} g · ` : ''}${esc(t('recipe.itemsCount', { n }))}${r.public ? ` · <span class="tag accent">${esc(t('recipe.public'))}</span>` : ''}</div></button>
      ${n ? `<button class="icon-btn" data-act="rb-log" data-id="${esc(r.id)}" aria-label="${esc(t('recipe.log'))}">${icon(I.plus)}</button>` : ''}</div>`;
  }).join('')}</div>`;
}

/** Nur die Liste neu zeichnen (Suchfeld behält Fokus). */
function refreshRecipeList(ctx) {
  const el = document.getElementById('rb-list');
  if (el && location.hash.startsWith('#/food') && !location.hash.startsWith('#/food/add')) el.innerHTML = recipeListHtml(ctx.state);
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
  'food-tab'(el, ctx) {
    const p = new URLSearchParams();
    if (ctx.params.date) p.set('date', ctx.params.date);
    if (el.dataset.v === 'recipes') p.set('tab', 'recipes');
    ctx.go('food' + (p.toString() ? '?' + p : ''));
  },
  'rb-tab'(el, ctx) {
    rbTab = el.dataset.v;
    ctx.render();
    if (rbTab === 'discover') browser.load(() => refreshRecipeList(ctx));
  },
  'rb-new'(el, ctx) {
    const r = { id: uid(), name: '', servings: 1, cookedWeight: null, items: [], updatedAt: new Date().toISOString() };
    ctx.update((s) => { (s.recipes ||= []).push(r); }, { silent: true });
    ctx.go(`recipe?id=${encodeURIComponent(r.id)}&from=recipes`);
  },
  'rb-edit'(el, ctx) { ctx.go(`recipe?id=${encodeURIComponent(el.dataset.id)}&from=recipes`); },
  'rb-log'(el, ctx) { ctx.go(`food/add?pick=${encodeURIComponent('recipe-' + el.dataset.id)}`); },
  'discover-reload'(el, ctx) { browser.load(() => refreshRecipeList(ctx)); refreshRecipeList(ctx); },
  'pub-open'(el, ctx) { browser.open(el.dataset.id, ctx); },
  'pub-log'(el, ctx) {
    const p = browser.current();
    if (!p) return;
    ctx.closeSheet();
    ctx.go(`food/add?pick=${encodeURIComponent('pub-' + p.id)}`);
  },
  'pub-copy'(el, ctx) {
    if (!browser.copyCurrent(ctx)) return;
    rbTab = 'mine';
    ctx.render();
  },
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
  'rb-q'(el, ctx) { rbQuery = el.value; refreshRecipeList(ctx); },
  'edit-grams'(el, ctx) {
    const g = parseNum(el.value);
    const key = dateOf(ctx.params);
    const e = (ctx.state.diary[key] || []).find((x) => x.id === editId);
    if (!e || g == null) return;
    // Ohne Neuzeichnen speichern, damit das Eingabefeld den Fokus behält
    ctx.update((s) => { const x = s.diary[key].find((y) => y.id === editId); if (x.portions) x.portions = Math.round((x.portions * g / x.grams) * 100) / 100; x.grams = g; x.n = forGrams(x.per100, g); }, { silent: true });
    document.getElementById('edit-preview').innerHTML = preview(ctx.state, e, g);
  },
};
export const changes = {
  'edit-grams'(el, ctx) { ctx.render(); },
};
