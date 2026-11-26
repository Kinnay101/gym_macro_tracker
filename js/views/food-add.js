// Lebensmittel hinzufügen: Suche (eigene, Rezepte, Schweizer Nährwertdatenbank, Open Food Facts), Barcode, eigenes anlegen, Portion.
// Mit ?recipe=<id> fügt die Seite Zutaten zu einem Rezept hinzu statt ins Tagebuch.
import { esc, num, today, uid, icon, I, parseNum, addDays } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { MEALS, forGrams, NUTRIENTS, validGrams, per100Error, MAX_GRAMS } from '../nutrition.js';
import { foodName, loadBlv, blvLoaded, searchLocal, searchOff, lookupBarcode, validBarcode } from '../foods.js';
import { openScanner } from '../scanner.js';
import { recipeFood, portionsLabel } from '../recipes.js';
import * as browser from './recipeBrowser.js';
import * as sync from '../sync.js';
import { energy, sheetHead, seg, segRects, placeSegs } from '../ui.js';

let query = '';
let online = { q: '', status: 'idle', list: [] }; // Open-Food-Facts-Suche
let shown = new Map(); // id → Lebensmittel, das gerade angezeigt wird
let picked = null; // Lebensmittel im Portions-Sheet
let pickedGrams = 100;
let scan = null; // { status: 'loading' | 'notfound' | 'error', code, name }
let newFoodPrefill = {};

const dateOf = (p) => p.date || today();
const recipeMode = (p) => !!p.recipe; // Zutaten für ein Rezept auswählen
function backParams(p) { const q = new URLSearchParams(); if (p.meal) q.set('meal', p.meal); if (p.date) q.set('date', p.date); if (p.from) q.set('from', p.from); return q; }
const mealOf = (p) => (MEALS.includes(p.meal) ? p.meal : defaultMeal());

function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h < 17 ? 'snacks' : 'dinner';
}

function findFood(state, id) {
  if (shown.has(id)) return shown.get(id);
  if (id.startsWith('pub-')) { const p = browser.discover.list.find((x) => 'pub-' + x.id === id); return p ? browser.publicFood(p) : null; }
  if (id.startsWith('recipe-')) { const r = (state.recipes || []).find((x) => 'recipe-' + x.id === id); return r ? recipeFood(r) : null; }
  const own = state.foods.find((f) => f.id === id);
  if (own) return { ...own, source: 'own' };
  return state.offCache?.[id] || (blvLoaded() || []).find((f) => f.id === id) || null;
}

function recent(state) {
  const ids = [];
  const start = addDays(today(), -30);
  Object.keys(state.diary).filter((k) => k >= start).sort().reverse().forEach((k) => {
    for (const e of [...state.diary[k]].reverse()) if (e.foodId && !ids.includes(e.foodId)) ids.push(e.foodId);
  });
  return ids.map((id) => findFood(state, id)).filter(Boolean).slice(0, 10);
}

function row(state, f) {
  shown.set(f.id, f);
  const tag = f.source === 'off' ? `${icon(I.barcode, 'icon tag-icon')} ${esc(t('src.off'))}` : esc(t('src.' + f.source));
  return `<div class="item"><button class="item-btn grow" data-act="pick" data-id="${esc(f.id)}">
      <div class="ellipsis" style="font-weight:600">${esc(foodName(f))}</div>
      <div class="meta ellipsis">${f.source === 'recipe'
        ? `${energy(state, f.perPortion.kcal)} ${esc(t('recipe.perPortionShort'))}`
        : `${f.brand ? `${esc(f.brand)} · ` : ''}${energy(state, f.per100.kcal)} ${esc(t('food.per100'))}`} · <span class="tag">${tag}</span></div></button>
      <button class="icon-btn" data-act="pick" data-id="${esc(f.id)}" aria-label="${esc(t('food.add'))}">${icon(I.plus)}</button></div>`;
}

let mode = {}; // aktuelle Parameter (für Ergebnisse, die ohne ctx neu gezeichnet werden)
let recipeTab = 'mine'; // 'mine' | 'discover'
function loadDiscover(ctx) {
  browser.load(() => { if (location.hash.startsWith('#/food/add')) refreshResults(ctx); });
}

function recipesCard(state) {
  const list = (state.recipes || []).filter((r) => r.items?.length).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const rows = list.map((r) => {
    const f = recipeFood(r);
    shown.set(f.id, f);
    return `<div class="item"><button class="item-btn grow" data-act="pick" data-id="${esc(f.id)}">
        <div class="ellipsis" style="font-weight:600">${esc(r.name || t('recipe.title'))}</div>
        <div class="meta">${energy(state, f.perPortion.kcal)} ${esc(t('recipe.perPortionShort'))} · ${esc(t('recipe.itemsCount', { n: r.items.length }))}</div></button>
      <button class="icon-btn" data-act="edit-recipe" data-id="${esc(r.id)}" aria-label="${esc(t('recipe.edit'))}">${icon('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>')}</button>
      <button class="icon-btn" data-act="pick" data-id="${esc(f.id)}" aria-label="${esc(t('food.add'))}">${icon(I.plus)}</button></div>`;
  }).join('');
  const body = recipeTab === 'discover'
    ? browser.listHtml(state)
    : (rows ? `<div class="list">${rows}</div>` : `<div class="small muted">${esc(t('recipe.none'))}</div>`);
  return `<section class="card tight"><div class="card-head"><h3>${esc(t('recipe.list'))}</h3><button class="link" data-act="new-recipe">${esc(t('recipe.create'))}</button></div>
    ${seg('recipe-tab', [['mine', t('recipe.mine')], ['discover', t('recipe.discover')]], recipeTab)}
    ${body}</section>`;
}

function resultsHtml(state) {
  shown = new Map();
  const q = query.trim();
  if (!q) {
    const list = recent(state).filter((f) => !(recipeMode(mode) && f.source === 'recipe'));
    return `${recipeMode(mode) ? '' : recipesCard(state)}<section class="card tight"><h3>${esc(t('food.recent'))}</h3>${list.length ? `<div class="list">${list.map((f) => row(state, f)).join('')}</div>` : `<div class="empty">${esc(t('food.noRecent'))}</div>`}</section>`;
  }
  const local = searchLocal(state, q, 25).filter((f) => !(recipeMode(mode) && f.source === 'recipe'));
  const loading = !blvLoaded();
  // Ohne Treffer in der lokalen Datenbank nur einen kurzen Hinweis zeigen
  const localHtml = local.length || loading
    ? `<section class="card tight"><h3>${esc(t('food.inDatabase'))}</h3>
      ${local.length ? `<div class="list">${local.map((f) => row(state, f)).join('')}</div>` : `<div class="empty"><span class="spinner"></span></div>`}</section>`
    : `<div class="small muted" style="padding:0 4px">${esc(t('food.noLocal'))}</div>`;

  let onlineHtml;
  if (online.q !== q || online.status === 'idle') {
    onlineHtml = `<button class="btn block" data-act="search-online">${icon(I.search)} ${esc(t('food.searchOnline', { q }))}</button><div class="tiny muted" style="text-align:center">${esc(t('food.searchOnlineHint'))}</div>`;
  } else if (online.status === 'loading') {
    onlineHtml = `<div class="empty"><span class="spinner"></span> ${esc(t('food.searchingOnline'))}</div>`;
  } else if (online.status === 'error') {
    onlineHtml = `<div class="empty">${esc(t(online.error === 'rate' ? 'food.onlineRate' : 'food.onlineError'))}<br><button class="link" data-act="search-online" style="margin-top:8px">${esc(t('food.retry'))}</button></div>`;
  } else {
    onlineHtml = online.list.length ? `<div class="list">${online.list.map((f) => row(state, f)).join('')}</div>` : `<div class="small muted">${esc(t('food.noOnline'))}</div>`;
  }
  return `${localHtml}<section class="card tight"><h3>${esc(t('food.onlineTitle'))}</h3>${onlineHtml}
    <button class="link" data-act="new-food" style="align-self:flex-start">${esc(t('food.createOwn'))}</button></section>`;
}

export function render(state, params) {
  mode = params;
  const meal = mealOf(params);
  const inRecipe = recipeMode(params);
  const recipe = inRecipe ? (state.recipes || []).find((r) => r.id === params.recipe) : null;
  const back = inRecipe ? `#/recipe?${new URLSearchParams({ ...Object.fromEntries(backParams(params)), id: params.recipe })}` : `#/food?date=${dateOf(params)}`;
  return `
    <header class="head"><div class="row"><a class="icon-btn" href="${back}" aria-label="${esc(t('common.back'))}">${icon(I.back)}</a>
      <div><h1>${esc(inRecipe ? t('recipe.addItem') : t('food.add'))}</h1>${inRecipe ? `<div class="sub">${esc(recipe?.name || t('recipe.title'))}</div>`
        : dateOf(params) !== today() ? `<div class="sub">${esc(t('food.forDate', { date: shortDate(dateOf(params)) }))}</div>` : ''}</div></div></header>
    ${inRecipe ? '' : seg('meal', MEALS.map((m) => [m, t('meal.' + m)]), meal)}
    <div class="search">${icon(I.search)}<input class="input" id="food-q" type="search" enterkeyhint="search" data-in="q" value="${esc(query)}" placeholder="${esc(t('food.searchPh'))}" autocomplete="off"></div>
    <div class="grid2">
      <button class="btn" data-act="barcode">${icon(I.barcode)} ${esc(t('food.barcode'))}</button>
      <button class="btn" data-act="new-food">${icon(I.plus)} ${esc(t('food.own'))}</button>
    </div>
    ${inRecipe ? '' : `<button class="btn ghost" data-act="quick">${esc(t('food.quick'))}</button>`}
    <div class="stack" id="results" style="gap:16px">${resultsHtml(state)}</div>
    <div class="credit">${esc(t('food.credit'))}<br><a href="https://naehrwertdaten.ch" target="_blank" rel="noopener">naehrwertdaten.ch</a> · <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">openfoodfacts.org</a> (ODbL)</div>
  `;
}

export function mounted(root, ctx) {
  const input = root.querySelector('#food-q');
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); actions['search-online'](input, ctx); }
  });
  if (!blvLoaded()) {
    loadBlv().then(() => refreshResults(ctx)).catch(() => {});
  }
  if (ctx.params.pick) {
    const id = ctx.params.pick;
    delete ctx.params.pick;
    history.replaceState(null, '', '#/food/add?' + new URLSearchParams(ctx.params));
    const f = findFood(ctx.state, id);
    if (f) setTimeout(() => openPortion(ctx, f), 0);
  }
}

function refreshResults(ctx) {
  const el = document.getElementById('results');
  if (!el) return;
  const segs = segRects(el);
  el.innerHTML = resultsHtml(ctx.state);
  placeSegs(el, segs);
}

// ---- Portion wählen ----
function portionSheet(state, ctx) {
  if (!picked) return null;
  const n = forGrams(picked.per100, pickedGrams || 0);
  const portion = picked.portion || 100;
  const inRecipe = recipeMode(ctx.params);
  const chips = picked.source === 'recipe'
    ? [0.5, 1, 1.5, 2].map((k) => `<button class="chip" data-act="grams" data-v="${Math.round(k * portion)}" aria-pressed="${Math.round(k * portion) === pickedGrams}">${esc(portionsLabel(k))}</button>`).join('')
    : [...new Set([portion, 50, 100, 150, 200])].sort((a, b) => a - b).map((g) => `<button class="chip" data-act="grams" data-v="${g}" aria-pressed="${g === pickedGrams}">${num(g)} g${g === portion && portion !== 100 ? ' · ' + esc(t('food.portionShort')) : ''}</button>`).join('');
  return `${sheetHead(foodName(picked))}
    <div class="small muted">${picked.brand ? esc(picked.brand) + ' · ' : ''}${inRecipe ? '' : esc(t('meal.' + mealOf(ctx.params))) + ' · '}${esc(t('src.' + picked.source))}${picked.source === 'recipe' ? ' · ' + esc(t('recipe.portionIs', { g: num(portion) })) : ''}</div>
    <div class="chips">${chips}</div>
    <label class="field">${esc(t('food.amount'))}<input class="input" inputmode="decimal" data-in="grams" value="${esc(pickedGrams)}" autofocus></label>
    <div class="grid2" id="portion-n">${portionNutrients(state, n)}</div>
    <div class="small" id="pick-err" style="color:var(--bad)" ${validGrams(pickedGrams) ? 'hidden' : ''}>${esc(t('food.errAmount', { max: num(MAX_GRAMS) }))}</div>
    <button class="btn primary block" data-act="add" ${validGrams(pickedGrams) ? '' : 'disabled'}>${esc(inRecipe ? t('recipe.addToRecipe') : t('food.addTo', { meal: t('meal.' + mealOf(ctx.params)) }))}</button>`;
}
function portionNutrients(state, n) {
  return `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(t('n.kcal'))}</span><span class="big">${energy(state, n.kcal)}</span></div>
    <div class="stack small" style="gap:2px"><span>${esc(t('n.p'))} <b>${num(n.p, 1)} g</b></span><span>${esc(t('n.c'))} <b>${num(n.c, 1)} g</b></span><span>${esc(t('n.f'))} <b>${num(n.f, 1)} g</b>${n.sfa != null && n.f > 0 ? ` <span class="tiny muted">(${esc(t('n.sfaShort'))} ${num(n.sfa, 1)} g)</span>` : ''}</span></div>`;
}

// ---- Barcode-Ergebnis ----
function scanSheet() {
  if (!scan) return null;
  if (scan.status === 'loading') return `${sheetHead(t('scan.title'))}<div class="empty"><span class="spinner"></span> ${esc(t('scan.lookingUp', { code: scan.code }))}</div>`;
  const text = scan.status === 'error' ? t('scan.lookupError') : t('scan.notFound', { code: scan.code });
  return `${sheetHead(t('scan.title'))}
    <div class="small">${esc(text)}</div>
    ${scan.status === 'notfound' ? `<div class="tiny muted">${esc(t('scan.notFoundHint'))}</div>` : ''}
    <button class="btn primary block" data-act="new-food-barcode">${esc(t('food.createOwn'))}</button>
    <button class="btn block" data-act="barcode">${icon(I.barcode)} ${esc(t('scan.again'))}</button>`;
}

// ---- Eigenes Lebensmittel / Schnell eintragen ----
const FIELDS = [['kcal', 'n.kcal'], ['p', 'n.p'], ['c', 'n.c'], ['f', 'n.f'], ['fiber', 'n.fiber'], ['sugar', 'n.sugar'], ['salt', 'n.salt'], ['sfa', 'n.sfa']];
function newFoodSheet() {
  const pre = newFoodPrefill;
  return `${sheetHead(t('food.ownTitle'))}
    <label class="field">${esc(t('food.name'))}<input class="input" id="nf-name" value="${esc(pre.name || '')}" autofocus></label>
    <div class="grid2"><label class="field">${esc(t('food.brand'))}<input class="input" id="nf-brand"></label>
      <label class="field">${esc(t('food.barcodeOpt'))}<input class="input" id="nf-barcode" inputmode="numeric" value="${esc(pre.barcode || '')}"></label></div>
    <div class="small muted">${esc(t('food.valuesPer100'))}</div>
    <div class="grid2">${FIELDS.map(([k, l]) => `<label class="field">${esc(t(l))}${k === 'kcal' ? ' (kcal)' : ' (g)'}<input class="input" inputmode="decimal" id="nf-${k}"></label>`).join('')}
      <label class="field">${esc(t('food.portion'))}<input class="input" inputmode="decimal" id="nf-portion" placeholder="${esc(t('common.std', { v: 100 }))}"></label></div>
    <div class="small" id="nf-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="save-food">${esc(t('common.save'))}</button>`;
}
function quickSheet() {
  return `${sheetHead(t('food.quick'))}
    <label class="field">${esc(t('food.name'))}<input class="input" id="q-name" placeholder="${esc(t('food.quickPh'))}"></label>
    <div class="grid2">${FIELDS.slice(0, 4).map(([k, l]) => `<label class="field">${esc(k === 'kcal' ? 'kcal' : t(l) + ' (g)')}<input class="input" inputmode="decimal" id="q-${k}" ${k === 'kcal' ? 'autofocus' : ''}></label>`).join('')}</div>
    <div class="small" id="q-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="save-quick">${esc(t('food.add'))}</button>`;
}

function addEntry(ctx, entry, food) {
  const key = dateOf(ctx.params);
  const meal = mealOf(ctx.params);
  const e = { id: uid(), meal, ...entry };
  ctx.update((s) => {
    (s.diary[key] ||= []).push(e);
    // Online-Produkte merken, damit sie bei "zuletzt benutzt" und offline wieder auftauchen
    if (food?.source === 'off') {
      const { _hay, ...clean } = food;
      (s.offCache ||= {})[food.id] = clean;
    }
  });
  ctx.closeSheet();
  ctx.toast(t('food.added', { name: e.name }), () => ctx.update((s) => { s.diary[key] = (s.diary[key] || []).filter((x) => x.id !== e.id); }));
}

const val = (id) => parseNum(document.getElementById(id)?.value);

function openPortion(ctx, food) {
  picked = food;
  pickedGrams = food.portion || 100;
  ctx.openSheet(portionSheet);
}

export const actions = {
  meal(el, ctx) {
    const p = new URLSearchParams({ ...ctx.params, meal: el.dataset.v });
    history.replaceState(null, '', '#/food/add?' + p);
    ctx.params.meal = el.dataset.v;
    ctx.render();
  },
  pick(el, ctx) {
    const f = findFood(ctx.state, el.dataset.id);
    if (f) openPortion(ctx, f);
  },
  grams(el, ctx) { pickedGrams = Number(el.dataset.v); ctx.refreshSheet(); },
  add(el, ctx) {
    if (!picked || !validGrams(pickedGrams)) return;
    if (recipeMode(ctx.params)) {
      const rid = ctx.params.recipe;
      const food = picked;
      ctx.update((s) => {
        const r = (s.recipes || []).find((x) => x.id === rid);
        if (!r) return;
        (r.items ||= []).push({ id: uid(), foodId: food.id, name: foodName(food), grams: pickedGrams, per100: food.per100 });
        r.updatedAt = new Date().toISOString();
        if (food.source === 'off') { const { _hay, ...clean } = food; (s.offCache ||= {})[food.id] = clean; }
      });
      ctx.closeSheet();
      query = ''; online = { q: '', status: 'idle', list: [] };
      ctx.go(`recipe?${new URLSearchParams({ ...Object.fromEntries(backParams(ctx.params)), id: rid })}`);
      ctx.toast(t('recipe.itemAdded', { name: foodName(food) }));
      return;
    }
    if (picked.source === 'recipe') {
      const portions = Math.round((pickedGrams / (picked.portion || 1)) * 100) / 100;
      addEntry(ctx, { foodId: picked.id, name: picked.name, grams: pickedGrams, portions, per100: picked.per100, n: forGrams(picked.per100, pickedGrams) }, picked);
      return;
    }
    addEntry(ctx, { foodId: picked.id, name: foodName(picked), grams: pickedGrams, per100: picked.per100, n: forGrams(picked.per100, pickedGrams) }, picked);
  },
  async 'search-online'(el, ctx) {
    const q = query.trim();
    if (!q || (online.q === q && online.status === 'loading')) return;
    online = { q, status: 'loading', list: [] };
    refreshResults(ctx);
    try {
      const list = await searchOff(q);
      if (online.q === q) online = { q, status: 'done', list };
    } catch (e) {
      if (online.q === q) online = { q, status: 'error', list: [], error: navigator.onLine === false ? 'net' : 'rate' }; // offline oder Server überlastet
    }
    if (location.hash.startsWith('#/food/add')) refreshResults(ctx);
  },
  barcode(el, ctx) {
    ctx.closeSheet();
    openScanner(async (code) => {
      scan = { status: 'loading', code };
      ctx.openSheet(scanSheet);
      try {
        const food = await lookupBarcode(ctx.state, code);
        if (food && !food.incomplete) { scan = null; openPortion(ctx, food); return; }
        scan = { status: 'notfound', code, name: food?.name || '' };
      } catch {
        scan = { status: 'error', code };
      }
      ctx.refreshSheet();
    });
  },
  'new-food'(el, ctx) {
    newFoodPrefill = { name: query.trim() };
    ctx.openSheet(newFoodSheet);
  },
  'new-food-barcode'(el, ctx) {
    newFoodPrefill = { name: scan?.name || '', barcode: scan?.code || '' };
    scan = null;
    ctx.openSheet(newFoodSheet);
  },
  'save-food'(el, ctx) {
    const name = document.getElementById('nf-name').value.trim();
    const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, val('nf-' + k) ?? (k === 'sfa' ? null : 0)])); // gesättigte Fette leer = unbekannt
    const barcode = document.getElementById('nf-barcode').value.replace(/\D/g, '') || null;
    const err = document.getElementById('nf-err');
    if (!name || val('nf-kcal') == null) { err.textContent = t('food.needNameKcal'); return; } // 0 kcal ist erlaubt (Wasser, Tee)
    const bad = per100Error(per100);
    if (bad) { err.textContent = t(bad); return; }
    const portion = val('nf-portion');
    if (portion != null && !validGrams(portion)) { err.textContent = t('food.errAmount', { max: num(MAX_GRAMS) }); return; }
    if (barcode && !validBarcode(barcode)) { err.textContent = t('scan.invalid'); return; }
    const food = { id: uid(), name, brand: document.getElementById('nf-brand').value.trim() || null, barcode, per100, portion: portion || 100 };
    ctx.update((s) => { s.foods.push(food); }, { silent: true });
    openPortion(ctx, { ...food, source: 'own' });
  },
  quick(el, ctx) { ctx.openSheet(quickSheet); },
  'recipe-tab'(el, ctx) {
    recipeTab = el.dataset.v;
    refreshResults(ctx);
    if (recipeTab === 'discover') loadDiscover(ctx);
  },
  'discover-reload'(el, ctx) { loadDiscover(ctx); },
  'pub-open'(el, ctx) { browser.open(el.dataset.id, ctx); },
  'pub-log'(el, ctx) {
    const p = browser.current();
    if (p) openPortion(ctx, browser.publicFood(p));
  },
  'pub-copy'(el, ctx) {
    if (!browser.copyCurrent(ctx)) return;
    recipeTab = 'mine';
    refreshResults(ctx);
  },
  'new-recipe'(el, ctx) {
    const r = { id: uid(), name: '', servings: 1, cookedWeight: null, items: [], updatedAt: new Date().toISOString() };
    ctx.update((s) => { (s.recipes ||= []).push(r); }, { silent: true });
    ctx.go(`recipe?${new URLSearchParams({ ...Object.fromEntries(backParams(ctx.params)), id: r.id })}`);
  },
  'edit-recipe'(el, ctx) {
    ctx.go(`recipe?${new URLSearchParams({ ...Object.fromEntries(backParams(ctx.params)), id: el.dataset.id })}`);
  },
  'save-quick'(el, ctx) {
    const kcal = val('q-kcal');
    const err = document.getElementById('q-err');
    if (!kcal) { err.textContent = t('food.needKcal'); return; }
    const n = { kcal, p: val('q-p') || 0, c: val('q-c') || 0, f: val('q-f') || 0, fiber: 0, sugar: 0, salt: 0 };
    if (Object.values(n).some((v) => !Number.isFinite(v) || v < 0)) { err.textContent = t('food.errNegative'); return; }
    if (kcal > 10000 || n.p > 1000 || n.c > 1000 || n.f > 1000) { err.textContent = t('food.errTooMuch'); return; }
    addEntry(ctx, { foodId: null, name: document.getElementById('q-name').value.trim() || t('food.quickName'), grams: 100, per100: n, n });
  },
};

export const inputs = {
  q(el, ctx) {
    query = el.value;
    refreshResults(ctx);
  },
  grams(el, ctx) {
    pickedGrams = parseNum(el.value) || 0;
    const ok = validGrams(pickedGrams);
    document.getElementById('portion-n').innerHTML = portionNutrients(ctx.state, forGrams(picked.per100, ok ? pickedGrams : 0));
    // Ungültige Menge (0, negativ, über 5 kg): Hinweis zeigen, Knopf sperren
    document.getElementById('pick-err')?.toggleAttribute('hidden', ok);
    const add = document.querySelector('#sheet-root [data-act="add"]');
    if (add) add.disabled = !ok;
  },
};
