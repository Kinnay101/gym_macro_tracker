// Öffentliche Rezepte: eigene als "öffentlich" markierte Rezepte in public_recipes ablegen, die der anderen laden.
// Private Rezepte verlassen die eigene (geschützte) docs-Tabelle nie.
import * as sync from './sync.js';
import * as store from './store.js';
import { fingerprint } from './docs.js';
import { recipeTotals } from './recipes.js';

const FP_KEY = 'gmt-pubrec-fp'; // { userId, fps: { recipeId: Fingerabdruck } } – was zuletzt veröffentlicht wurde

function loadFps(uid) {
  try { const m = JSON.parse(localStorage.getItem(FP_KEY)); return m?.userId === uid ? m.fps : {}; } catch { return {}; }
}
function saveFps(uid, fps) {
  try { localStorage.setItem(FP_KEY, JSON.stringify({ userId: uid, fps })); } catch { /* egal */ }
}

/** Was öffentlich sichtbar ist (Snapshot des Rezepts inkl. Nährwerte). */
function publicData(r) {
  const tot = recipeTotals(r);
  return {
    servings: r.servings, cookedWeight: r.cookedWeight ?? null, instructions: r.instructions || '',
    items: (r.items || []).map(({ name, grams, per100 }) => ({ name, grams, per100 })),
    per100: tot.per100, perPortion: tot.perPortion, portionGrams: tot.portionGrams, totalWeight: tot.totalWeight,
  };
}

let running = false;
/** Eigene öffentliche Rezepte hochladen, nicht mehr öffentliche/gelöschte entfernen. */
export async function publishRecipes() {
  const c = sync.getClient();
  const user = sync.getUser();
  if (!c || !user || running) return;
  running = true;
  try {
    const state = store.get();
    const fps = loadFps(user.id);
    const author = state.profile.displayName || null;
    const pub = (state.recipes || []).filter((r) => r.public && r.name?.trim() && r.items?.length);
    for (const r of pub) {
      const row = { id: r.id, user_id: user.id, author_name: author, name: r.name.trim().slice(0, 60), data: publicData(r), updated_at: r.updatedAt || new Date().toISOString() };
      const fp = fingerprint({ a: row.author_name, n: row.name, d: row.data });
      if (fps[r.id] === fp) continue;
      const { error } = await c.from('public_recipes').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      fps[r.id] = fp;
      saveFps(user.id, fps);
    }
    // Auch Rezepte entfernen, die auf einem anderen Gerät privat geschaltet oder gelöscht wurden
    const keep = new Set(pub.map((r) => r.id));
    const { data: mine, error: listErr } = await c.from('public_recipes').select('id').eq('user_id', user.id);
    if (listErr) throw listErr;
    // Eigenes öffentliches Rezept fehlt auf dem Server (z. B. gleichzeitig von einem anderen Gerät mit altem Stand
    // gelöscht) → trotz gleichem Fingerabdruck neu hochladen (Prüfbericht K20)
    const onServer = new Set(mine.map((x) => x.id));
    for (const r of pub) {
      if (onServer.has(r.id)) continue;
      const row = { id: r.id, user_id: user.id, author_name: author, name: r.name.trim().slice(0, 60), data: publicData(r), updated_at: r.updatedAt || new Date().toISOString() };
      const { error } = await c.from('public_recipes').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      mine.push({ id: r.id });
    }
    for (const id of new Set([...Object.keys(fps), ...mine.map((x) => x.id)])) {
      if (keep.has(id)) continue;
      const { error } = await c.from('public_recipes').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      delete fps[id];
      saveFps(user.id, fps);
    }
  } finally {
    running = false;
  }
}

let timer = null;
export function schedulePublish(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => publishRecipes().catch((e) => console.warn('Rezepte veröffentlichen fehlgeschlagen', e)), ms);
}

// ---- Fremddaten absichern: Rezepte anderer kommen ungeprüft vom Server (andere App-Version, kaputte oder absichtlich
// falsche Daten). Nur bekannte Felder mit gültigen Werten übernehmen, fehlende Werte ausrechnen, sonst Rezept weglassen.
const NUTR = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'salt', 'sfa'];
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
function nutrients(o, max) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const k of NUTR) out[k] = num(o[k], max);
  if (out.kcal == null) return null;
  for (const k of NUTR) if (k !== 'sfa') out[k] ??= 0; // gesättigt: null = unbekannt
  return out;
}
const scaled = (n, f) => Object.fromEntries(NUTR.map((k) => [k, n[k] == null ? null : n[k] * f]));

/** Öffentliches Rezept eines anderen prüfen → bereinigte Kopie oder null (wird nicht angezeigt). */
export function cleanPublic(r) {
  const d = r?.data;
  if (!r || typeof r.id !== 'string' || !d || typeof d !== 'object') return null;
  const items = (Array.isArray(d.items) ? d.items.slice(0, 100) : [])
    .map((it) => ({ name: str(it?.name, 120), grams: num(it?.grams, 100000), per100: nutrients(it?.per100, 1000) }))
    .filter((it) => it.name && it.grams && it.per100);
  const per100 = nutrients(d.per100, 1000);
  if (!per100) return null;
  const totalWeight = num(d.totalWeight, 100000) || items.reduce((s, it) => s + it.grams, 0) || null;
  const servings = Math.max(1, Math.round(num(d.servings, 1000) || 1));
  const portionGrams = num(d.portionGrams, 100000) || (totalWeight ? totalWeight / servings : 100);
  const perPortion = nutrients(d.perPortion, 100000) || scaled(per100, portionGrams / 100);
  return {
    id: r.id, user_id: str(r.user_id, 64), author_name: str(r.author_name, 40) || null, name: str(r.name, 60).trim() || '?', updated_at: str(r.updated_at, 40),
    data: { servings, cookedWeight: num(d.cookedWeight, 100000), instructions: str(d.instructions, 5000), items, per100, perPortion, portionGrams, totalWeight },
  };
}

/** Öffentliche Rezepte der anderen (neueste zuerst). */
export async function loadPublic() {
  const c = sync.getClient();
  const user = sync.getUser();
  if (!c || !user) return [];
  const q = c.from('public_recipes').select('id,user_id,author_name,name,data,updated_at').order('updated_at', { ascending: false }).range(0, 199);
  const { data, error } = await q;
  if (error) throw error;
  return data.filter((r) => r.user_id !== user.id).map(cleanPublic).filter(Boolean);
}

// Nach jedem Sync abgleichen (z. B. wenn ein Rezept auf einem anderen Gerät geändert wurde)
sync.onStatus((st) => { if (st.state === 'idle' && st.user) schedulePublish(2000); });
