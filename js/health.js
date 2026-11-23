// Apple Health über einen iPhone-Kurzbefehl (Android/Health Connect: js/healthConnect.js, nutzt applyHealth von hier).
//
// Der Kurzbefehl schickt Textzeilen an health_sync (supabase/health.sql); sie landen als Dokument "hinbox:…"
// im Konto. Nach jedem Sync verarbeitet die App diese Zeilen und löscht das Dokument wieder.
//
// Zeilen (Trennzeichen ;, Datum "yyyy-MM-dd HH:mm" oder "yyyy-MM-dd", Zahlen dürfen Komma und Einheit haben):
//   W;Datum;Gewicht            Gewicht (kg)
//   F;Datum;Körperfett         Körperfett (% oder Anteil 0–1)
//   S;Tag;Schritte             Schritte pro Tag
//   A;Tag;kcal                 aktive Energie pro Tag
//   E;Tag;Minuten              Trainingsminuten pro Tag (grüner Ring)
//   D;Tag;km                   Distanz Gehen + Laufen pro Tag
//   T;Start;Ende;Name[;kcal[;km[;Puls]]]   Workout (Kurzbefehle kann Workouts derzeit nicht lesen – für später)
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
  if (/kraft|strength|functional|gewichtheben|weightlifting|calisthenics/.test(n)) return 'strength'; // vor "rad" prüfen ("Traditionelles Krafttraining")
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
  const s = String(v || '').trim().toLowerCase();
  // Als Zahl (HealthKit): 0 Im Bett, 1 Schlafend, 2 Wach, 3 Kern, 4 Tief, 5 REM
  if (/^\d$/.test(s)) return ['inBed', 'asleep', 'awake', 'core', 'deep', 'rem'][Number(s)] || 'asleep';
  if (/tief|deep/.test(s)) return 'deep';
  if (/rem/.test(s)) return 'rem';
  if (/kern|core|leicht|light/.test(s)) return 'core';
  if (/wach|awake/.test(s)) return 'awake';
  if (/bett|bed/.test(s)) return 'inBed';
  return 'asleep';
}

export function parseHealth(text) {
  const out = { weights: {}, bodyFat: {}, steps: {}, active: {}, exercise: {}, distance: {}, workouts: {}, sleepSamples: [], unknown: 0, hasExercise: false, exerciseBad: false };
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
    } else if (kind === 'S' || kind === 'A' || kind === 'E' || kind === 'D') {
      const d = parseDate(parts[1]); const v = parseNum(parts[2]);
      if (!d || v == null) { out.unknown++; continue; }
      if (kind === 'E') out.hasExercise = true;
      const map = { S: out.steps, A: out.active, E: out.exercise, D: out.distance }[kind];
      map[dayKey(d)] = kind === 'D' ? round(v, 2) : Math.round(v);
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
      // Ein Schlaf-Eintrag über 13 h ist unmöglich (dann liest der Repeat z. B. die Tageswerte der aktiven Energie)
      if (!s || !e || e <= s || e - s > 13 * 3600000) { out.unknown++; continue; }
      out.sleepSamples.push({ s, e, stage: sleepStage(parts[3]) });
    } else {
      out.unknown++;
    }
  }
  // Unmögliche Trainingsminuten verwerfen: mehr als ein Tag, oder gleich wie die Schritte
  // (dann liest der Kurzbefehl im Block «Trainingsminuten» versehentlich die Schritte)
  for (const [d, v] of Object.entries(out.exercise)) {
    if (v > 1440 || (v > 0 && out.steps[d] === v)) { delete out.exercise[d]; out.exerciseBad = true; out.unknown++; }
  }
  // Tage mit Schritten, aber ohne E-Zeile: Health hat an dem Tag (noch) keine Trainingsminuten → 0
  if (out.hasExercise && !out.exerciseBad) {
    for (const d of Object.keys(out.steps)) if (!(d in out.exercise)) out.exercise[d] = 0;
  }
  return out;
}

/** Zeitspannen zusammenführen (Überlappungen nur einmal zählen) → Minuten und frühester/spätester Zeitpunkt */
function union(list) {
  const xs = list.slice().sort((a, b) => a.s - b.s);
  let min = 0; let cur = null; let first = null; let last = null;
  for (const x of xs) {
    if (!first) first = x.s;
    if (!last || x.e > last) last = x.e;
    if (cur && x.s <= cur.e) { if (x.e > cur.e) cur.e = x.e; continue; }
    if (cur) min += (cur.e - cur.s) / 60000;
    cur = { s: x.s, e: x.e };
  }
  if (cur) min += (cur.e - cur.s) / 60000;
  return { min, first, last };
}

/** Schlaf-Proben zu Nächten zusammenfassen (Nacht = Tag des Aufwachens).
 *  iPhone, Watch und andere Apps liefern oft dieselbe Nacht mehrfach → Zeitspannen zusammenführen statt addieren. */
export function sleepNights(samples) {
  const nights = {};
  for (const x of samples) {
    const date = dayKey(new Date(x.e.getTime() + 8 * 3600000)); // endet vor 16 Uhr → gleicher Tag, später → nächster
    (nights[date] ||= []).push(x);
  }
  const out = {};
  for (const [date, xs] of Object.entries(nights)) {
    const of = (...st) => xs.filter((x) => st.includes(x.stage));
    let main = union(of('deep', 'rem', 'core', 'asleep'));
    if (main.min < 30) main = union(of('inBed')); // ältere Geräte kennen nur "Im Bett"
    if (main.min < 30) continue;
    const m = (st) => Math.round(union(of(st)).min);
    out[date] = {
      date, minutes: Math.round(main.min), deep: m('deep'), rem: m('rem'), core: m('core'), awake: m('awake'),
      bed: main.first ? minuteKey(main.first) : null, wake: main.last ? minuteKey(main.last) : null,
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
  for (const [d, v] of Object.entries(p.exercise)) day(d).exerciseMin = v;
  for (const [d, v] of Object.entries(p.distance)) day(d).distanceKm = v;
  for (const w of Object.values(p.workouts)) state.healthWorkouts[w.id] = w;
  Object.assign(state.healthSleep, sleepNights(p.sleepSamples));
  // Früher übernommene unmögliche Werte aufräumen (falsch verbundener Repeat im Kurzbefehl)
  for (const x of Object.values(state.healthDays)) {
    if (x.exerciseMin != null && (x.exerciseMin > 1440 || (x.exerciseMin > 0 && x.exerciseMin === x.steps))) delete x.exerciseMin;
  }
  for (const [d, n] of Object.entries(state.healthSleep)) if (n.minutes > 16 * 60) delete state.healthSleep[d];
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

// ---------- Kurzbefehl aus der App starten (iPhone) ----------
// Eine Web-App kann Apple Health nicht selbst lesen. Sie kann aber den Kurzbefehl starten: iOS wechselt kurz in die
// Kurzbefehle-App, der Kurzbefehl schickt die Daten, und beim Zurückkehren holt die App sie über den Sync ab.
export const SHORTCUT_NAME = 'Gym Sync';
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function runShortcut() { location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME); }

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
