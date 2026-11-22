// Apple Health über einen iPhone-Kurzbefehl.
//
// Der Kurzbefehl schickt Textzeilen an health_sync (supabase/health.sql); sie landen als Dokument "hinbox:…"
// im Konto. Nach jedem Sync verarbeitet die App diese Zeilen und löscht das Dokument wieder.
//
// Zeilen (Trennzeichen ;, Datum "yyyy-MM-dd HH:mm" oder "yyyy-MM-dd", Zahlen dürfen Komma und Einheit haben):
//   W;Datum;Gewicht            Gewicht (kg)
//   F;Datum;Körperfett         Körperfett (% oder Anteil 0–1)
//   S;Tag;Schritte             Schritte pro Tag
//   A;Tag;kcal                 aktive Energie pro Tag
//   T;Start;Ende;Name[;kcal[;km[;Puls]]]   Workout
//   P;Start;Ende;Phase         Schlaf (Kern/Tief/REM/Wach/Im Bett/Schlafend)
import { dayKey, parseNum, round, addDays, today } from './util.js';
import * as sync from './sync.js';
import * as store from './store.js';

// ---------- Text lesen ----------
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}
const minuteKey = (d) => `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Workout-Name aus Health → eigene Art */
export function workoutKind(name) {
  const n = String(name || '').toLowerCase();
  if (/kraft|strength|functional|gewichtheben/.test(n)) return 'strength'; // vor "rad" prüfen ("Traditionelles Krafttraining")
  if (/laufband|treadmill|indoor.?lauf|indoor.?run/.test(n)) return 'treadmill';
  if (/lauf|run|jog/.test(n)) return 'run';
  if (/(^|\s|-)rad|fahrrad|velo|cycl|bike/.test(n)) return 'bike';
  if (/cross|ellipti/.test(n)) return 'crosstrainer';
  if (/ruder|row/.test(n)) return 'rowing';
  if (/trepp|stair|stepper/.test(n)) return 'stairs';
  if (/schwimm|swim/.test(n)) return 'swim';
  if (/geh|walk|wander|hik/.test(n)) return 'walk';
  if (/hiit|intervall|interval/.test(n)) return 'hiit';
  return 'other';
}

function sleepStage(v) {
  const s = String(v || '').toLowerCase();
  if (/tief|deep/.test(s)) return 'deep';
  if (/rem/.test(s)) return 'rem';
  if (/kern|core|leicht|light/.test(s)) return 'core';
  if (/wach|awake/.test(s)) return 'awake';
  if (/bett|bed/.test(s)) return 'inBed';
  return 'asleep';
}

export function parseHealth(text) {
  const out = { weights: {}, bodyFat: {}, steps: {}, active: {}, workouts: {}, sleepSamples: [], unknown: 0 };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const parts = raw.split(';').map((x) => x.trim());
    const kind = parts[0]?.toUpperCase();
    if (!kind) continue;
    if (kind === 'W' || kind === 'F') {
      const d = parseDate(parts[1]); let v = parseNum(parts[2]);
      if (!d || v == null) { out.unknown++; continue; }
      if (kind === 'F' && v <= 1) v *= 100; // Anteil → Prozent
      const map = kind === 'W' ? out.weights : out.bodyFat;
      const k = dayKey(d);
      if (!map[k] || d >= map[k].at) map[k] = { at: d, v: round(v, 1) };
    } else if (kind === 'S' || kind === 'A') {
      const d = parseDate(parts[1]); const v = parseNum(parts[2]);
      if (!d || v == null) { out.unknown++; continue; }
      (kind === 'S' ? out.steps : out.active)[dayKey(d)] = Math.round(v);
    } else if (kind === 'T') {
      const s = parseDate(parts[1]); const e = parseDate(parts[2]);
      if (!s || !e || e <= s) { out.unknown++; continue; }
      const id = minuteKey(s);
      const kcal = parseNum(parts[4]); const km = parseNum(parts[5]); const hr = parseNum(parts[6]);
      out.workouts[id] = {
        id, date: dayKey(s), start: id, minutes: Math.round((e - s) / 60000), name: parts[3] || '', kind: workoutKind(parts[3]),
        kcal: kcal ? Math.round(kcal) : null, km: km ? round(km, 2) : null, avgHr: hr ? Math.round(hr) : null,
      };
    } else if (kind === 'P') {
      const s = parseDate(parts[1]); const e = parseDate(parts[2]);
      if (!s || !e || e <= s) { out.unknown++; continue; }
      out.sleepSamples.push({ s, e, stage: sleepStage(parts[3]) });
    } else {
      out.unknown++;
    }
  }
  return out;
}

/** Schlaf-Proben zu Nächten zusammenfassen (Nacht = Tag des Aufwachens). */
export function sleepNights(samples) {
  const nights = {};
  for (const x of samples) {
    const date = dayKey(new Date(x.e.getTime() + 8 * 3600000)); // endet vor 16 Uhr → gleicher Tag, später → nächster
    const n = (nights[date] ||= { date, deep: 0, rem: 0, core: 0, asleep: 0, awake: 0, inBed: 0, bed: null, wake: null });
    const min = (x.e - x.s) / 60000;
    n[x.stage] += min;
    if (x.stage !== 'awake') {
      if (!n.bed || x.s < n.bed) n.bed = x.s;
      if (!n.wake || x.e > n.wake) n.wake = x.e;
    }
  }
  const out = {};
  for (const n of Object.values(nights)) {
    const staged = n.deep + n.rem + n.core + n.asleep;
    const total = staged || n.inBed; // ältere Geräte kennen nur "Im Bett"
    if (total < 30) continue;
    out[n.date] = {
      date: n.date, minutes: Math.round(total), deep: Math.round(n.deep), rem: Math.round(n.rem), core: Math.round(n.core),
      awake: Math.round(n.awake), bed: n.bed ? minuteKey(n.bed) : null, wake: n.wake ? minuteKey(n.wake) : null,
    };
  }
  return out;
}

/** Geparste Daten in den App-Zustand übernehmen. Manuell eingetragenes Gewicht hat Vorrang. */
export function applyHealth(state, p) {
  state.healthDays ||= {}; state.healthWorkouts ||= {}; state.healthSleep ||= {};
  for (const [date, w] of Object.entries(p.weights)) {
    const i = state.weights.findIndex((x) => x.date === date);
    if (i >= 0 && state.weights[i].source !== 'health') continue;
    const entry = { date, kg: w.v, source: 'health' };
    if (i >= 0) state.weights[i] = entry; else state.weights.push(entry);
  }
  const day = (d) => (state.healthDays[d] ||= { date: d });
  for (const [d, v] of Object.entries(p.bodyFat)) day(d).bodyFat = v.v;
  for (const [d, v] of Object.entries(p.steps)) day(d).steps = v;
  for (const [d, v] of Object.entries(p.active)) day(d).activeKcal = v;
  for (const w of Object.values(p.workouts)) state.healthWorkouts[w.id] = w;
  Object.assign(state.healthSleep, sleepNights(p.sleepSamples));
  state.healthLastImport = new Date().toISOString();
}

/** Nach dem Sync: neue Daten aus dem Kurzbefehl verarbeiten und das Eingangs-Dokument löschen. */
export function processInbox() {
  const inbox = store.get().healthInbox || {};
  const keys = Object.keys(inbox);
  if (!keys.length) return false;
  store.update((s) => {
    for (const k of keys.sort()) applyHealth(s, parseHealth(s.healthInbox[k]?.text));
    s.healthInbox = {};
  });
  return true;
}

// ---------- Auswertungen für die Anzeige ----------
export function lastNight(state) {
  const nights = Object.values(state.healthSleep || {}).sort((a, b) => b.date.localeCompare(a.date));
  return nights.find((n) => n.date >= addDays(today(), -1)) || null;
}

/** Health-Workouts im Zeitraum. Krafttraining der Watch nur, wenn an dem Tag kein Training in der App erfasst ist. */
export function healthWorkoutsBetween(state, from, to) {
  const appDays = new Set(state.workouts.map((w) => w.date));
  return Object.values(state.healthWorkouts || {})
    .filter((w) => w.date >= from && w.date <= to)
    .filter((w) => w.kind !== 'strength' || !appDays.has(w.date))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Watch-Werte zu einem App-Training am selben Tag (Krafttraining). */
export function watchStatsFor(state, date) {
  return Object.values(state.healthWorkouts || {}).find((w) => w.date === date && w.kind === 'strength') || null;
}

// ---------- Verbindung (Schlüssel) ----------
export async function connectionStatus() {
  const c = sync.getClient();
  if (!c) return null;
  const { data, error } = await c.from('health_tokens').select('created_at,last_used,last_export');
  if (error) throw error;
  return data[0] || null;
}
export async function createToken() {
  const { data, error } = await sync.getClient().rpc('create_health_token');
  if (error) throw error;
  return data;
}
export async function disconnect() {
  const { error } = await sync.getClient().from('health_tokens').delete().eq('user_id', sync.getUser().id);
  if (error) throw error;
}

sync.onAfterPull(processInbox);
