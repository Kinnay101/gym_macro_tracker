// Freunde & Rangliste: geteilte Zusammenfassung berechnen/veröffentlichen, Gruppen laden, anlegen, beitreten.
// Freunde sehen nur shared_stats (und nur freigegebene Bereiche) – nie die eigentlichen Daten.
import { today, addDays, weekStart, e1rm, round } from './util.js';
import { currentWeight } from './nutrition.js';
import { workingSets, trackOf, setE1rm, setVolume } from './workout.js';
import { plannedPerWeek } from './plan.js';
import { fingerprint } from './docs.js';
import * as sync from './sync.js';
import * as store from './store.js';

export const CATEGORIES = ['strength', 'consistency', 'volume', 'prs'];
const PUB_KEY = 'gmt-shared-fp';
const sortByDate = (a, b) => (a.date + (a.finishedAt || '')).localeCompare(b.date + (b.finishedAt || ''));

/** Teilen-Einstellungen mit Standardwerten. */
export function shareSettings(state) {
  return { strength: true, consistency: true, volume: true, prs: true, ...(state.profile.share || {}) };
}

/** Wochenziel aus dem aktiven Split: Krafttrainings pro Woche (Volle Woche 6, Locker ≈ 5,25). */
function weeklyTarget(state) { return plannedPerWeek(state).strength || 1; }

/** Die Zusammenfassung, die Freunde sehen dürfen (nur freigegebene Bereiche). */
export function computeStats(state, now = today()) {
  const share = shareSettings(state);
  const out = {};
  const ws = [...state.workouts].sort(sortByDate);

  if (share.strength) {
    const kg = currentWeight(state);
    if (kg) {
      const from = addDays(now, -180);
      const best = {};
      for (const w of ws) {
        if (w.date < from) continue;
        for (const ex of w.exercises) for (const s of workingSets(ex)) best[trackOf(ex)] = Math.max(best[trackOf(ex)] || 0, setE1rm(s));
      }
      const strength = {};
      // nur das Verhältnis zum Körpergewicht – keine absoluten Kilos, kein Körpergewicht
      for (const [name, v] of Object.entries(best).sort((a, b) => b[1] - a[1]).slice(0, 40)) strength[name] = round(v / kg, 2);
      if (Object.keys(strength).length) out.strength = strength;
    }
  }

  if (share.consistency) {
    const days = new Set(ws.map((w) => w.date));
    const from28 = addDays(now, -27);
    const n28 = [...days].filter((d) => d >= from28 && d <= now).length;
    const target = weeklyTarget(state);
    // Wochen am Stück mit mindestens 3 Trainings (aktuelle Woche zählt, sobald sie es geschafft hat)
    const countWeek = (ws0) => [...days].filter((d) => d >= ws0 && d <= addDays(ws0, 6)).length;
    let wk = weekStart(now);
    let streak = 0;
    if (countWeek(wk) >= 3) streak++;
    wk = addDays(wk, -7);
    while (countWeek(wk) >= 3) { streak++; wk = addDays(wk, -7); }
    out.consistency = { workouts28: n28, pct: Math.min(100, Math.round((n28 / (target * 4)) * 100)), weekStreak: streak };
  }

  if (share.volume) {
    const from7 = addDays(now, -6);
    let kg7 = 0; let sets7 = 0;
    for (const w of ws) {
      if (w.date < from7 || w.date > now) continue;
      for (const ex of w.exercises) for (const s of workingSets(ex)) { kg7 += setVolume(s); sets7++; }
    }
    out.volume = { kg7: Math.round(kg7), sets7 };
  }

  if (share.prs) {
    const best = {};
    const prs = [];
    for (const w of ws) {
      for (const ex of w.exercises) {
        const top = Math.max(0, ...workingSets(ex).map(setE1rm));
        if (!top) continue;
        const k = trackOf(ex);
        if (best[k] && top > best[k]) prs.push({ name: k, date: w.date });
        best[k] = Math.max(best[k] || 0, top);
      }
    }
    const from30 = addDays(now, -29);
    const recent = prs.filter((p) => p.date >= from30);
    out.prs = { prs30: recent.length, recent: recent.slice(-3).reverse() };
  }
  return out;
}

// ---------- Veröffentlichen ----------
let pubTimer = null;
export function schedulePublish(ms = 2000) {
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => publish().catch((e) => console.warn('Teilen fehlgeschlagen', e)), ms);
}

/** Eigene Zusammenfassung hochladen (nur wenn angemeldet, Name gesetzt und etwas geändert). */
export async function publish({ force = false } = {}) {
  const c = sync.getClient();
  const user = sync.getUser();
  const state = store.get();
  const name = state.profile.displayName;
  if (!c || !user || !name) return;
  const row = { user_id: user.id, display_name: name, stats: computeStats(state), updated_at: new Date().toISOString() };
  const fp = user.id + fingerprint({ n: row.display_name, s: row.stats });
  if (!force && localStorage.getItem(PUB_KEY) === fp) return;
  const { error } = await c.from('shared_stats').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
  localStorage.setItem(PUB_KEY, fp);
}

// ---------- Gruppen ----------
function check({ data, error }) { if (error) throw error; return data; }

/** Alle eigenen Gruppen mit Mitgliedern und deren geteilten Werten. */
export async function loadGroups() {
  const c = sync.getClient();
  const groups = check(await c.from('groups').select('id,name,invite_code,created_at').order('created_at', { ascending: true }));
  if (!groups.length) return { groups: [], members: [], stats: {} };
  const members = check(await c.from('group_members').select('group_id,user_id,display_name,joined_at').in('group_id', groups.map((g) => g.id)));
  const ids = [...new Set(members.map((m) => m.user_id))];
  const rows = check(await c.from('shared_stats').select('user_id,display_name,stats,updated_at').in('user_id', ids));
  return { groups, members, stats: Object.fromEntries(rows.map((r) => [r.user_id, r])) };
}

export async function createGroup(groupName) {
  const name = store.get().profile.displayName;
  const g = check(await sync.getClient().rpc('create_group', { group_name: groupName, member_name: name }));
  await publish({ force: true });
  return g;
}

export async function joinGroup(code) {
  const name = store.get().profile.displayName;
  const g = check(await sync.getClient().rpc('join_group', { code, member_name: name }));
  await publish({ force: true });
  return g;
}

export async function renameGroup(gid, groupName) {
  return check(await sync.getClient().rpc('rename_group', { gid, group_name: groupName }));
}

export async function leaveGroup(gid) {
  check(await sync.getClient().rpc('leave_group', { gid }));
}

export async function setDisplayName(name) {
  store.update((s) => { s.profile.displayName = name; });
  const c = sync.getClient();
  if (c && sync.getUser()) {
    check(await c.rpc('set_display_name', { member_name: name }));
    await publish({ force: true });
  }
}

/** Fehler in einen Text-Schlüssel übersetzen. */
export function errorKey(e) {
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('invalid code')) return 'friends.errCode';
  if (msg.includes('group full')) return 'friends.errFull';
  if (msg.includes('too many groups')) return 'friends.errTooMany';
  if (msg.includes('invalid name')) return 'friends.errGroupName';
  if (msg.includes('could not find the function') || msg.includes('rename_group')) return 'friends.errSqlMissing';
  if (msg.includes('fetch') || msg.includes('network') || navigator.onLine === false) return 'auth.errNetwork';
  return 'auth.errUnknown';
}

// Nach jedem erfolgreichen Sync die Zusammenfassung aktualisieren
sync.onStatus((st) => { if (st.state === 'idle' && st.user) schedulePublish(1500); });
