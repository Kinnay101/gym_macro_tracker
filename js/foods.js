// Lebensmittel-Quellen: eigene, Schweizer Nährwertdatenbank (BLV, lokal) und Open Food Facts (online).
import { round } from './util.js';
import { lang } from './i18n.js';

// ---------- Suche: Text vereinheitlichen ("Müesli" = "muesli" = "Muesli") ----------
export function norm(s) {
  // ü → u und ue → u, damit "Müesli", "Muesli" und "Musli" gleich behandelt werden
  return String(s || '').toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
}
const words = (s) => norm(s).split(/[^a-z0-9%]+/).filter(Boolean);

export function foodName(f) {
  if (typeof f.name === 'string') return f.name;
  return f.name[lang()] || f.name.de;
}

// ---------- BLV ----------
let blv = null;
let blvPromise = null;
export function loadBlv() {
  if (blv) return Promise.resolve(blv);
  blvPromise ??= fetch('data/blv.json')
    .then((r) => r.json())
    .then((d) => {
      blv = d.rows.map(([id, de, en, syn, kind, kcal, p, c, f, fiber, sugar, salt]) => ({
        id: 'blv-' + id, source: kind === 2 ? 'blvBrand' : 'blv', name: { de, en }, syn,
        per100: { kcal, p: p ?? 0, c: c ?? 0, f: f ?? 0, fiber: fiber ?? 0, sugar: sugar ?? 0, salt: salt ?? 0 },
        portion: 100,
      }));
      return blv;
    })
    .catch((e) => { blvPromise = null; throw e; });
  return blvPromise;
}
export function blvLoaded() { return blv; }

// ---------- lokale Suche ----------
function haystack(f) {
  if (!f._hay) {
    const n = typeof f.name === 'string' ? f.name : `${f.name.de} ${f.name.en}`;
    const text = `${n} ${f.syn || ''} ${f.brand || ''}`;
    f._hay = { words: words(text), compact: norm(text).replace(/[^a-z0-9]/g, ''), first: words(foodName(f))[0] || '' };
  }
  return f._hay;
}

/** Eigene Lebensmittel, gespeicherte Online-Produkte und BLV durchsuchen. */
export function searchLocal(state, query, limit = 40) {
  const q = words(query);
  if (!q.length) return [];
  const compactQ = norm(query).replace(/[^a-z0-9]/g, '');
  const pool = [
    ...state.foods.map((f) => ({ ...f, source: 'own' })),
    ...Object.values(state.offCache || {}),
    ...(blv || []),
  ];
  const hits = [];
  for (const f of pool) {
    const h = haystack(f);
    let score = 0;
    const allWords = q.every((tok) => h.words.some((w) => w.startsWith(tok)));
    if (allWords) {
      score = 10;
      if (h.first.startsWith(q[0])) score += 5;
      if (norm(foodName(f)).startsWith(norm(query))) score += 5;
    } else if (compactQ.length >= 4 && h.compact.includes(compactQ)) {
      score = 5; // z. B. "pouletbrust" findet "Poulet, Brust, …"
    } else continue;
    if (f.source === 'own') score += 8;
    if (f.source === 'off') score += 3; // schon einmal benutzt
    if (/\broh\b|\braw\b/.test(norm(foodName(f)))) score += 1;
    score -= foodName(f).length / 40; // kurze, allgemeine Namen zuerst
    hits.push({ f, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.f);
}

// ---------- Open Food Facts ----------
const OFF_FIELDS = 'code,product_name,product_name_de,product_name_en,product_name_fr,brands,nutriments,serving_quantity,quantity';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/** Produkt aus Open Food Facts in unser Format bringen (null, wenn keine Kalorien bekannt). */
export function fromOff(p) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n['energy-kj_100g']) != null) kcal = num(n['energy-kj_100g']) / 4.184;
  if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184;
  if (kcal == null) return null;
  const nameDe = p.product_name_de || p.product_name || p.product_name_en || p.product_name_fr;
  const nameEn = p.product_name_en || p.product_name || nameDe;
  if (!nameDe) return null;
  const salt = num(n.salt_100g) ?? (num(n.sodium_100g) != null ? num(n.sodium_100g) * 2.5 : 0);
  const serving = num(p.serving_quantity);
  return {
    id: 'off-' + p.code,
    source: 'off',
    code: p.code,
    name: { de: nameDe.trim(), en: nameEn.trim() },
    brand: (p.brands || '').split(',')[0].trim() || null,
    per100: {
      kcal: Math.round(kcal), p: round(num(n.proteins_100g) ?? 0, 1), c: round(num(n.carbohydrates_100g) ?? 0, 1), f: round(num(n.fat_100g) ?? 0, 1),
      fiber: round(num(n.fiber_100g) ?? 0, 1), sugar: round(num(n.sugars_100g) ?? 0, 1), salt: round(salt, 2),
    },
    portion: serving && serving > 0 && serving < 2000 ? round(serving, 0) : 100,
  };
}

async function getJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Textsuche bei Open Food Facts. Zuerst Produkte, die in der Schweiz verkauft werden.
 * Hinweis: Open Food Facts erlaubt nur ca. 10 Suchen pro Minute – deshalb nur auf Knopfdruck.
 */
export async function searchOff(query) {
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '30', fields: OFF_FIELDS });
  const d = await getJson('https://ch.openfoodfacts.org/cgi/search.pl?' + params);
  const list = (d.products || []).map(fromOff).filter(Boolean);
  // Open Food Facts sortiert eher nach Beliebtheit – Produkte, deren Name alle Suchwörter enthält, nach vorne
  const q = words(query);
  const rank = (f) => {
    const name = words(`${f.name.de} ${f.name.en}`);
    const all = words(`${f.name.de} ${f.name.en} ${f.brand || ''}`);
    return (q.every((tok) => name.some((w) => w.startsWith(tok))) ? 2 : 0) + (q.every((tok) => all.some((w) => w.startsWith(tok))) ? 1 : 0);
  };
  return list.map((f, i) => ({ f, r: rank(f), i })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.f);
}

/** Produkt per Barcode: zuerst eigene/gespeicherte, dann Open Food Facts. */
export async function lookupBarcode(state, code) {
  const own = state.foods.find((f) => f.barcode === code);
  if (own) return { ...own, source: 'own' };
  const cached = state.offCache?.['off-' + code];
  if (cached) return cached;
  try {
    const d = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (d.status !== 1 || !d.product) return null;
    return fromOff({ ...d.product, code }) || { incomplete: true, code, name: d.product.product_name_de || d.product.product_name || '' };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/** Gültige EAN-8/EAN-13/UPC-A Prüfziffer? */
export function validBarcode(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
