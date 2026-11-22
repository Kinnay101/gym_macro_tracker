// Konto und Sync über Supabase.
//
// Ablauf eines Syncs:
//  1. Herunterladen: alle Dokumente, die seit dem letzten Mal beim Server angekommen sind.
//     Lokal unveränderte Dokumente werden übernommen. Hat dieses Gerät dasselbe Dokument inzwischen
//     selbst geändert, gewinnt die lokale Änderung (sie wird gleich danach hochgeladen).
//     Beim allerersten Sync eines Geräts gewinnt der Server (sonst würde ein leeres Gerät z. B. das Profil überschreiben).
//  2. Hochladen: alle Dokumente, die sich seit dem letzten Sync geändert haben oder gelöscht wurden.
// Gesynct wird beim Start, kurz nach jeder Änderung, beim Zurückkehren in die App und jede Minute.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as store from './store.js';
import { toDocs, applyDoc, fingerprint } from './docs.js';

const SYNC_KEY = 'gmt-sync-v1';
const OVERLAP_MS = 2 * 60 * 1000; // beim Herunterladen etwas überlappen (gleichzeitige Schreibvorgänge)
const PAGE = 1000;

let client = null;
let user = null;
let status = { state: 'off', lastSync: null, error: null, recovery: false };
const listeners = new Set();
let timer = null;
let running = null;
let again = false;
let applying = false;

export function isConfigured() { return !!(SUPABASE_URL && SUPABASE_KEY) || !!client; }
export function getUser() { return user; }
export function getStatus() { return { ...status, user }; }
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(patch) { status = { ...status, ...patch }; listeners.forEach((l) => l(getStatus())); }

// ---------- Sync-Gedächtnis dieses Geräts ----------
function loadMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch { return null; }
}
function saveMeta(m) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); } catch (e) { console.warn(e); }
}
function metaFor(uid) {
  const m = loadMeta();
  return m && m.userId === uid ? m : { userId: uid, cursor: null, synced: {}, initialDone: false };
}

// ---------- Supabase-Bibliothek laden ----------
function loadLib() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/supabase/supabase.js';
    s.onload = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('lib'));
    document.head.append(s);
  });
}

/** Für Tests: einen nachgebauten Supabase-Client verwenden. */
export async function _useClient(fake) {
  client = fake;
  await start();
}

export async function init() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const lib = await loadLib();
    client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
  } catch (e) {
    console.warn('Supabase nicht geladen', e);
    setStatus({ state: 'error', error: 'lib' });
    return;
  }
  await start();
}

async function start() {
  client.auth.onAuthStateChange((event, session) => {
    const before = user?.id;
    user = session?.user ?? null;
    if (event === 'PASSWORD_RECOVERY') setStatus({ recovery: true });
    if (user && user.id !== before) { setStatus({ state: 'idle', error: null }); schedule(0); }
    if (!user) setStatus({ state: 'loggedOut' });
  });
  const { data } = await client.auth.getSession();
  user = data?.session?.user ?? null;
  setStatus({ state: user ? 'idle' : 'loggedOut' });

  store.onSave(() => { if (!applying && user) schedule(3000); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  window.addEventListener('online', () => schedule(500));
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);
  if (user) schedule(0);
}

export function schedule(ms) {
  if (!user || !client) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, ms);
}

/** Jetzt synchronisieren. Läuft schon einer, wird danach direkt noch einer gemacht. */
export function syncNow() {
  if (!user || !client) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus({ state: 'syncing' });
    try {
      do {
        again = false;
        await pull();
        await push();
      } while (again);
      setStatus({ state: 'idle', lastSync: new Date().toISOString(), error: null });
    } catch (e) {
      console.warn('Sync fehlgeschlagen', e);
      setStatus({ state: navigator.onLine === false ? 'offline' : 'error', error: e.message || String(e) });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

async function pull() {
  const meta = metaFor(user.id);
  const since = meta.cursor ? new Date(new Date(meta.cursor).getTime() - OVERLAP_MS).toISOString() : null;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from('docs').select('key,data,deleted,server_ts').eq('user_id', user.id);
    if (since) q = q.gt('server_ts', since);
    const page = check(await q.order('server_ts', { ascending: true }).range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (!rows.length) { if (!meta.initialDone) { meta.initialDone = true; saveMeta(meta); } return; }

  const local = toDocs(store.get());
  const apply = [];
  let cursor = meta.cursor;
  for (const r of rows) {
    if (!cursor || r.server_ts > cursor) cursor = r.server_ts;
    const has = local.has(r.key);
    const localFp = has ? fingerprint(local.get(r.key)) : null;
    const dirty = meta.initialDone && (localFp !== (meta.synced[r.key] ?? null));
    if (dirty) continue; // lokale Änderung gewinnt, wird gleich hochgeladen
    apply.push(r);
  }
  if (apply.length) {
    applying = true;
    try {
      store.update((s) => { for (const r of apply) applyDoc(s, r.key, r.deleted ? undefined : r.data); });
    } finally {
      applying = false;
    }
    const after = toDocs(store.get());
    for (const r of apply) {
      if (after.has(r.key)) meta.synced[r.key] = fingerprint(after.get(r.key));
      else delete meta.synced[r.key];
    }
  }
  meta.cursor = cursor;
  meta.initialDone = true;
  saveMeta(meta);
}

async function push() {
  const meta = metaFor(user.id);
  const docs = toDocs(store.get());
  const now = new Date().toISOString();
  const rows = [];
  const fps = {};
  for (const [key, value] of docs) {
    const fp = fingerprint(value);
    if (meta.synced[key] !== fp) { rows.push({ user_id: user.id, key, data: value, deleted: false, client_ts: now }); fps[key] = fp; }
  }
  for (const key of Object.keys(meta.synced)) {
    if (!docs.has(key)) { rows.push({ user_id: user.id, key, data: null, deleted: true, client_ts: now }); fps[key] = null; }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    check(await client.from('docs').upsert(chunk, { onConflict: 'user_id,key' }));
    for (const r of chunk) {
      if (fps[r.key] == null) delete meta.synced[r.key]; else meta.synced[r.key] = fps[r.key];
    }
    saveMeta(meta);
  }
}

// ---------- Konto ----------
export async function signUp(email, password) {
  const data = check(await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } }));
  return { needsConfirm: !data.session };
}
export async function signIn(email, password) {
  check(await client.auth.signInWithPassword({ email: email.trim(), password }));
}
export async function resetPassword(email) {
  check(await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
}
export async function updatePassword(password) {
  check(await client.auth.updateUser({ password }));
  setStatus({ recovery: false });
}

/**
 * Abmelden. Vorher wird synchronisiert; danach werden die Daten auf diesem Gerät gelöscht
 * (sie liegen ja im Konto). Klappt der Sync nicht, wird nicht abgemeldet.
 */
export async function signOut({ force = false } = {}) {
  if (!force) await syncNow();
  clearTimeout(timer);
  await client.auth.signOut();
  localStorage.removeItem(SYNC_KEY);
  user = null;
  store.resetAll();
  setStatus({ state: 'loggedOut', lastSync: null });
}

/** Fehler von Supabase in einen Text-Schlüssel für i18n übersetzen. */
export function errorKey(e) {
  const code = e?.code || '';
  const msg = (e?.message || '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'auth.errInvalid';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'auth.errExists';
  if (code === 'weak_password' || msg.includes('password should')) return 'auth.errWeak';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'auth.errNotConfirmed';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || msg.includes('rate limit')) return 'auth.errRate';
  if (code === 'email_address_invalid' || msg.includes('invalid format') || msg.includes('email address')) return 'auth.errEmail';
  if (msg.includes('fetch') || msg.includes('network') || navigator.onLine === false) return 'auth.errNetwork';
  return 'auth.errUnknown';
}
