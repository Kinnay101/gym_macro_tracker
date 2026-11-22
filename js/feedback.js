// Feedback (Bugs & Ideen) in der Supabase-Tabelle feedback.
// Jeder sieht nur seine eigenen Einträge, Admins (app_admins) alle – geregelt in supabase/feedback.sql.
import * as sync from './sync.js';
import * as store from './store.js';

export const KINDS = ['bug', 'idea'];
export const STATUSES = ['new', 'planned', 'done', 'rejected'];
const COLS = 'id,user_id,author_name,kind,body,app_version,status,reply,created_at,updated_at';

/** Version der App (Name des Service-Worker-Zwischenspeichers, z. B. "gym-v40"). */
async function appVersion() {
  try { return (await caches.keys()).filter((k) => k.startsWith('gym-')).sort().pop() || null; } catch { return null; }
}

export async function isAdmin() {
  const c = sync.getClient();
  if (!c) return false;
  const { data, error } = await c.rpc('is_app_admin');
  if (error) throw error;
  return data === true;
}

/** Eigene Einträge bzw. als Admin alle (neueste zuerst). */
export async function list() {
  const c = sync.getClient();
  if (!c) return [];
  const { data, error } = await c.from('feedback').select(COLS).order('created_at', { ascending: false }).range(0, 299);
  if (error) throw error;
  return data;
}

export async function submit(kind, body) {
  const c = sync.getClient();
  const user = sync.getUser();
  if (!c || !user) throw new Error('not signed in');
  const row = {
    user_id: user.id,
    author_name: store.get().profile.displayName?.slice(0, 30) || null,
    kind,
    body: body.trim().slice(0, 2000),
    app_version: await appVersion(),
  };
  const { data, error } = await c.from('feedback').insert(row).select(COLS).single();
  if (error) throw error;
  return data;
}

/** Nur Admins: Status und Antwort setzen. */
export async function answer(id, status, reply) {
  const c = sync.getClient();
  if (!c) throw new Error('not signed in');
  const patch = { status, reply: reply?.trim() ? reply.trim().slice(0, 1000) : null, updated_at: new Date().toISOString() };
  const { data, error } = await c.from('feedback').update(patch).eq('id', id).select(COLS).single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const c = sync.getClient();
  if (!c) throw new Error('not signed in');
  const { error } = await c.from('feedback').delete().eq('id', id);
  if (error) throw error;
}

export function errorKey(e) {
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('feedback limit')) return 'fb.errLimit';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || msg.includes('could not find')) return 'fb.errSetup';
  if (msg.includes('fetch') || msg.includes('network') || navigator.onLine === false) return 'auth.errNetwork';
  return 'auth.errUnknown';
}
