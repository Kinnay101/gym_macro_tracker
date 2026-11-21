// Lebensmittel hinzufügen: Suche (eigene, Schweizer Nährwertdatenbank, Open Food Facts), Barcode, eigenes anlegen, Portion
import { esc, num, today, uid, icon, I, parseNum, addDays } from '../util.js';
import { t } from '../i18n.js';
import { MEALS, forGrams, NUTRIENTS } from '../nutrition.js';
import { foodName, loadBlv, blvLoaded, searchLocal, searchOff, lookupBarcode, validBarcode } from '../foods.js';
import { openScanner } from '../scanner.js';
import { energy, sheetHead } from '../ui.js';

let query = '';
let online = { q: '', status: 'idle', list: [] }; // Open-Food-Facts-Suche
let shown = new Map(); // id → Lebensmittel, das gerade angezeigt wird
let picked = null; // Lebensmittel im Portions-Sheet
let pickedGrams = 100;
let scan = null; // { status: 'loading' | 'notfound' | 'error', code, name }
let newFoodPrefill = {};

const dateOf = (p) => p.date || today();
const mealOf = (p) => (MEALS.includes(p.meal) ? p.meal : defaultMeal());

function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h < 17 ? 'snacks' : 'dinner';
}

function findFood(state, id) {
  if (shown.has(id)) return shown.get(id);
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
      <div class="meta ellipsis">${f.brand ? `${esc(f.brand)} · ` : ''}${energy(state, f.per100.kcal)} ${esc(t('food.per100'))} · <span class="tag">${tag}</span></div></button>
      <button class="icon-btn" data-act="pick" data-id="${esc(f.id)}" aria-label="${esc(t('food.add'))}">${icon(I.plus)}</button></div>`;
}

function resultsHtml(state) {
  shown = new Map();
  const q = query.trim();
  if (!q) {
    const list = recent(state);
    return `<section class="card tight"><h3>${esc(t('food.recent'))}</h3>${list.length ? `<div class="list">${list.map((f) => row(state, f)).join('')}</div>` : `<div class="empty">${esc(t('food.noRecent'))}</div>`}</section>`;
  }
  const local = searchLocal(state, q, 25);
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
  const meal = mealOf(params);
  return `
    <header class="head"><div class="row"><a class="icon-btn" href="#/food?date=${dateOf(params)}" aria-label="${esc(t('common.back'))}">${icon(I.back)}</a><h1>${esc(t('food.add'))}</h1></div></header>
    <div class="chips">${MEALS.map((m) => `<button class="chip" data-act="meal" data-v="${m}" aria-pressed="${m === meal}">${esc(t('meal.' + m))}</button>`).join('')}</div>
    <div class="search">${icon(I.search)}<input class="input" id="food-q" type="search" enterkeyhint="search" data-in="q" value="${esc(query)}" placeholder="${esc(t('food.searchPh'))}" autocomplete="off"></div>
    <div class="grid2">
      <button class="btn" data-act="barcode">${icon(I.barcode)} ${esc(t('food.barcode'))}</button>
      <button class="btn" data-act="new-food">${icon(I.plus)} ${esc(t('food.own'))}</button>
    </div>
    <button class="btn ghost" data-act="quick">${esc(t('food.quick'))}</button>
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
}

function refreshResults(ctx) {
  const el = document.getElementById('results');
  if (el) el.innerHTML = resultsHtml(ctx.state);
}

// ---- Portion wählen ----
function portionSheet(state, ctx) {
  if (!picked) return null;
  const n = forGrams(picked.per100, pickedGrams || 0);
  const portion = picked.portion || 100;
  const chips = [...new Set([portion, 50, 100, 150, 200])].sort((a, b) => a - b);
  return `${sheetHead(foodName(picked))}
    <div class="small muted">${picked.brand ? esc(picked.brand) + ' · ' : ''}${esc(t('meal.' + mealOf(ctx.params)))} · ${esc(t('src.' + picked.source))}</div>
    <div class="chips">${chips.map((g) => `<button class="chip" data-act="grams" data-v="${g}" aria-pressed="${g === pickedGrams}">${num(g)} g${g === portion && portion !== 100 ? ' · ' + esc(t('food.portionShort')) : ''}</button>`).join('')}</div>
    <label class="field">${esc(t('food.amount'))}<input class="input" inputmode="decimal" data-in="grams" value="${esc(pickedGrams)}" autofocus></label>
    <div class="grid2" id="portion-n">${portionNutrients(state, n)}</div>
    <button class="btn primary block" data-act="add">${esc(t('food.addTo', { meal: t('meal.' + mealOf(ctx.params)) }))}</button>`;
}
function portionNutrients(state, n) {
  return `<div class="stack" style="gap:2px"><span class="tiny muted">${esc(t('n.kcal'))}</span><span class="big">${energy(state, n.kcal)}</span></div>
    <div class="stack small" style="gap:2px"><span>${esc(t('n.p'))} <b>${num(n.p, 1)} g</b></span><span>${esc(t('n.c'))} <b>${num(n.c, 1)} g</b></span><span>${esc(t('n.f'))} <b>${num(n.f, 1)} g</b></span></div>`;
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
const FIELDS = [['kcal', 'n.kcal'], ['p', 'n.p'], ['c', 'n.c'], ['f', 'n.f'], ['fiber', 'n.fiber'], ['sugar', 'n.sugar'], ['salt', 'n.salt']];
function newFoodSheet() {
  const pre = newFoodPrefill;
  return `${sheetHead(t('food.ownTitle'))}
    <label class="field">${esc(t('food.name'))}<input class="input" id="nf-name" value="${esc(pre.name || '')}" autofocus></label>
    <div class="grid2"><label class="field">${esc(t('food.brand'))}<input class="input" id="nf-brand"></label>
      <label class="field">${esc(t('food.barcodeOpt'))}<input class="input" id="nf-barcode" inputmode="numeric" value="${esc(pre.barcode || '')}"></label></div>
    <div class="small muted">${esc(t('food.valuesPer100'))}</div>
    <div class="grid2">${FIELDS.map(([k, l]) => `<label class="field">${esc(t(l))}${k === 'kcal' ? ' (kcal)' : ' (g)'}<input class="input" inputmode="decimal" id="nf-${k}"></label>`).join('')}
      <label class="field">${esc(t('food.portion'))}<input class="input" inputmode="decimal" id="nf-portion" placeholder="100"></label></div>
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
    if (!picked || !pickedGrams) return;
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
    const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, val('nf-' + k) ?? 0]));
    const barcode = document.getElementById('nf-barcode').value.replace(/\D/g, '') || null;
    const err = document.getElementById('nf-err');
    if (!name || !val('nf-kcal')) { err.textContent = t('food.needNameKcal'); return; }
    if (barcode && !validBarcode(barcode)) { err.textContent = t('scan.invalid'); return; }
    const food = { id: uid(), name, brand: document.getElementById('nf-brand').value.trim() || null, barcode, per100, portion: val('nf-portion') || 100 };
    ctx.update((s) => { s.foods.push(food); }, { silent: true });
    openPortion(ctx, { ...food, source: 'own' });
  },
  quick(el, ctx) { ctx.openSheet(quickSheet); },
  'save-quick'(el, ctx) {
    const kcal = val('q-kcal');
    if (!kcal) { document.getElementById('q-err').textContent = t('food.needKcal'); return; }
    const n = { kcal, p: val('q-p') || 0, c: val('q-c') || 0, f: val('q-f') || 0, fiber: 0, sugar: 0, salt: 0 };
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
    document.getElementById('portion-n').innerHTML = portionNutrients(ctx.state, forGrams(picked.per100, pickedGrams));
  },
};
