// Rezept bearbeiten: Name, Portionen, Gewicht nach dem Kochen, Zutaten, Nährwerte pro Portion
import { esc, num, icon, I, parseNum } from '../util.js';
import { t } from '../i18n.js';
import { recipeTotals } from '../recipes.js';
import { energy } from '../ui.js';

const recipeOf = (state, params) => (state.recipes || []).find((r) => r.id === params.id);

/** Parameter für den Weg zurück (Mahlzeit/Datum bleiben erhalten). */
function backParams(params) {
  const p = new URLSearchParams();
  if (params.meal) p.set('meal', params.meal);
  if (params.date) p.set('date', params.date);
  return p;
}

export function render(state, params) {
  const r = recipeOf(state, params);
  const back = `#/food/add?${backParams(params)}`;
  if (!r) {
    return `<header class="head"><div class="row"><a class="icon-btn" href="${back}">${icon(I.back)}</a><h1>${esc(t('recipe.title'))}</h1></div></header>
      <div class="empty">${esc(t('recipe.notFound'))}</div>`;
  }
  const tot = recipeTotals(r);
  const items = (r.items || []).map((it) => {
    const kcal = (it.per100.kcal * (it.grams || 0)) / 100;
    return `<div class="item"><div class="grow"><div class="ellipsis" style="font-weight:600">${esc(it.name)}</div>
        <div class="meta">${energy(state, kcal)}</div></div>
      <div style="width:84px"><input class="input num" inputmode="decimal" data-in="r-grams" data-id="${esc(it.id)}" value="${esc(it.grams ?? '')}" aria-label="${esc(t('food.amount'))}"></div><span class="tiny muted">g</span>
      <button class="icon-btn" data-act="r-remove" data-id="${esc(it.id)}" aria-label="${esc(t('common.remove'))}">${icon(I.x)}</button></div>`;
  }).join('');
  const add = new URLSearchParams(backParams(params));
  add.set('recipe', r.id);
  return `
    <header class="head"><div class="row grow"><button class="icon-btn" data-act="r-back" aria-label="${esc(t('common.back'))}">${icon(I.back)}</button><h1>${esc(t('recipe.title'))}</h1></div></header>
    <label class="field">${esc(t('recipe.name'))}<input class="input" id="r-name" data-in="r-name" value="${esc(r.name || '')}" placeholder="${esc(t('recipe.namePh'))}" maxlength="60" ${r.name ? '' : 'autofocus'}></label>
    <div class="grid2">
      <label class="field">${esc(t('recipe.servings'))}<input class="input" inputmode="decimal" data-in="r-servings" value="${esc(r.servings ?? 1)}"></label>
      <label class="field">${esc(t('recipe.cooked'))}<input class="input" inputmode="decimal" data-in="r-cooked" value="${esc(r.cookedWeight ?? '')}" placeholder="${esc(t('recipe.optional'))}"></label>
    </div>
    <div class="tiny muted" style="margin-top:-8px">${esc(t('recipe.cookedHint'))}</div>
    <section class="card tight"><div class="card-head"><h3>${esc(t('recipe.ingredients'))}</h3><span class="tiny muted">${esc(t('recipe.raw', { g: num(tot.raw) }))}</span></div>
      ${items ? `<div class="list">${items}</div>` : `<div class="small muted">${esc(t('recipe.noItems'))}</div>`}
      <a class="btn sm ghost" href="#/food/add?${add}">${icon(I.plus)} ${esc(t('recipe.addItem'))}</a>
    </section>
    <section class="card" id="r-totals">${totalsHtml(state, tot)}</section>
    ${r.items?.length ? `<button class="btn primary block" data-act="r-log">${esc(t('recipe.log'))}</button>` : ''}
    <button class="link" data-act="r-delete" style="align-self:flex-start;color:var(--bad)">${esc(t('recipe.delete'))}</button>
  `;
}

function totalsHtml(state, tot) {
  const p = tot.perPortion;
  return `<div class="row between"><h3>${esc(t('recipe.perPortion'))}</h3><span class="small muted">${tot.portionGrams ? `${num(tot.portionGrams)} g` : ''}</span></div>
    <div class="grid2"><div class="stack" style="gap:2px"><span class="tiny muted">${esc(t('n.kcal'))}</span><span class="big">${energy(state, p.kcal)}</span></div>
      <div class="stack small" style="gap:2px"><span>${esc(t('n.p'))} <b>${num(p.p, 1)} g</b></span><span>${esc(t('n.c'))} <b>${num(p.c, 1)} g</b></span><span>${esc(t('n.f'))} <b>${num(p.f, 1)} g</b></span></div></div>
    <div class="tiny muted">${esc(t('recipe.totalLine', { kcal: energy(state, tot.total.kcal), g: num(tot.totalWeight), n: num(tot.servings, 1), per100: energy(state, tot.per100.kcal) }))}</div>`;
}

function patch(ctx, fn, rerender = true) {
  ctx.update((s) => {
    const r = (s.recipes || []).find((x) => x.id === ctx.params.id);
    if (r) { fn(r); r.updatedAt = new Date().toISOString(); }
  }, { silent: !rerender });
}

/** Summen ohne komplettes Neuzeichnen aktualisieren (Tastatur bleibt offen). */
function refreshTotals(ctx) {
  const r = recipeOf(ctx.state, ctx.params);
  const el = document.getElementById('r-totals');
  if (r && el) el.innerHTML = totalsHtml(ctx.state, recipeTotals(r));
}

function leave(ctx) {
  // Leeres, unbenanntes Rezept nicht aufheben
  const r = recipeOf(ctx.state, ctx.params);
  if (r && !r.name?.trim() && !r.items?.length) ctx.update((s) => { s.recipes = s.recipes.filter((x) => x.id !== r.id); });
  ctx.go(`food/add?${backParams(ctx.params)}`);
}

export const actions = {
  'r-back'(el, ctx) { leave(ctx); },
  'r-remove'(el, ctx) { patch(ctx, (r) => { r.items = r.items.filter((it) => it.id !== el.dataset.id); }); },
  'r-log'(el, ctx) {
    const p = backParams(ctx.params);
    p.set('pick', 'recipe-' + ctx.params.id);
    ctx.go(`food/add?${p}`);
  },
  'r-delete'(el, ctx) {
    const r = recipeOf(ctx.state, ctx.params);
    if (!r || !confirm(t('recipe.deleteConfirm', { name: r.name || t('recipe.title') }))) return;
    ctx.update((s) => { s.recipes = s.recipes.filter((x) => x.id !== r.id); });
    ctx.go(`food/add?${backParams(ctx.params)}`);
    ctx.toast(t('recipe.deleted'), () => ctx.update((s) => { s.recipes.push(r); }));
  },
};

export const inputs = {
  'r-name'(el, ctx) { patch(ctx, (r) => { r.name = el.value; }, false); },
  'r-servings'(el, ctx) { const v = parseNum(el.value); if (v > 0) { patch(ctx, (r) => { r.servings = v; }, false); refreshTotals(ctx); } },
  'r-cooked'(el, ctx) { const v = parseNum(el.value); patch(ctx, (r) => { r.cookedWeight = v > 0 ? v : null; }, false); refreshTotals(ctx); },
  'r-grams'(el, ctx) {
    const v = parseNum(el.value);
    patch(ctx, (r) => { const it = r.items.find((x) => x.id === el.dataset.id); if (it) it.grams = v || 0; }, false);
    refreshTotals(ctx);
  },
};

// Beim Verlassen eines Feldes neu zeichnen (z. B. kcal pro Zutat)
export const changes = {
  'r-grams'(el, ctx) { ctx.render(); },
};
