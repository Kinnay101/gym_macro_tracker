// Datenspeicher. Vorerst nur lokal im Browser (localStorage).
// Später kommt hier der Sync mit Supabase dazu – der Rest der App spricht nur mit diesem Modul.
import { uid } from './util.js';
import { defaultPlans, ensureTraining } from './plan.js';

const KEY = 'gmt-data-v1';
const listeners = new Set();
let data = load();

function blank() {
  return ensureTraining(blankRaw());
}
function blankRaw() {
  return {
    version: 1,
    profile: {
      lang: 'de',
      energyUnit: 'kcal', // oder 'kj'
      sex: null, // 'm' | 'f'
      birthYear: null,
      heightCm: null,
      goal: 'maintain', // 'cut' | 'maintain' | 'bulk'
      goalOverride: null, // { kcal, p, c, f } wenn manuell gesetzt
      displayName: null, // Name, den Freunde sehen
      share: { strength: true, consistency: true, volume: true, prs: true }, // was Freunde sehen dürfen
    },
    plans: defaultPlans(),
    foods: [], // eigene Lebensmittel: { id, name, brand, barcode, per100: { kcal, p, c, f, fiber, sugar, salt }, portion }
    offCache: {}, // benutzte Produkte aus Open Food Facts (für "zuletzt benutzt" und offline)
    recipes: [], // { id, name, servings, cookedWeight?, items: [{ id, foodId, name, grams, per100 }], updatedAt } – siehe js/recipes.js
    diary: {}, // { 'JJJJ-MM-TT': [ { id, meal, foodId, name, grams, n: {…} } ] }
    weights: [], // { date, kg }
    measures: [], // { date, status?, bf?, shoulders, chest, waist, hips, bicepsR/L, bicepsR/LFlex, forearmR/LFlex, thighR/L, calfR/L … } in cm, siehe js/measures.js
    workouts: [], // abgeschlossene Trainings
    exLib: [], // eigene Übungsliste mit Einstellungen: { id, name, muscle, x2, base, uni } – siehe js/exercises.js
    cardio: [], // { id, date, type, minutes, km, after }
    dayChoice: {}, // { 'JJJJ-MM-TT': 'rest' | planId } – Tag im Plan geändert
    // Splits & Kalender-Planung (siehe js/plan.js): { splits (auch archivierte Fassungen), activeSplit, anchor: { date, index, splitId }, shifts: [Datum], restarts, weeklyCardio: [{ id, weekday, type, minutes, from?, until? }] }
    training: null,
    plannedCardio: {}, // { 'JJJJ-MM-TT': [{ id, type, minutes }] } – Cardio für einen bestimmten Tag geplant
    sickDays: {}, // { 'JJJJ-MM-TT': 'shift' | 'skip' } – krank (Plan rückt nach bzw. Training fällt weg)
    active: null, // laufendes Training
    // Apple Health (über Kurzbefehl, siehe js/health.js)
    healthDays: {}, // { 'JJJJ-MM-TT': { steps, activeKcal, bodyFat } }
    healthWorkouts: {}, // { id: { id, date, start, minutes, name, kind, kcal, km, avgHr } }
    healthSleep: {}, // { 'JJJJ-MM-TT' (Aufwachtag): { minutes, deep, rem, core, awake, bed, wake } }
    healthInbox: {}, // noch nicht verarbeitete Daten vom Kurzbefehl
    healthLastImport: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Daten konnten nicht geladen werden', e);
  }
  return blank();
}

/** Ergänzt fehlende Felder, wenn eine ältere Version gespeichert war. */
function migrate(d) {
  const b = blankRaw();
  const out = { ...b, ...d, profile: { ...b.profile, ...(d.profile || {}) } };
  if (!Array.isArray(out.plans) || !out.plans.length) out.plans = b.plans;
  // Vor den Splits: Rhythmus „Volle Woche“/„Locker“ → Split, beginnt heute beim bisherigen Vorschlag
  ensureTraining(out);
  // Felder aus der Zeit vor den Splits bzw. vor der Aktivität aus den Trainings – nach der Umstellung unbenutzt (Prüfbericht B8)
  for (const k of ['activity', 'rhythm', 'rhythmNames']) delete out.profile[k];
  // Alte Masse (vor 22.11.): 'arm' hiess jetzt 'biceps'
  out.measures = (out.measures || []).map((m) => {
    if (m.arm == null) return m;
    const { arm, ...rest } = m;
    return { biceps: arm, ...rest };
  });
  return out;
}

const saveListeners = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
  }
  saveListeners.forEach((l) => l());
}

/** Wird nach jedem Speichern aufgerufen (auch bei stillen Änderungen) – für den Sync. */
export function onSave(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }

export function get() { return data; }

/** Ändert Daten, speichert und meldet allen Ansichten die Änderung. */
export function update(fn, { silent = false } = {}) {
  fn(data);
  save();
  if (!silent) listeners.forEach((l) => l());
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function exportJSON() {
  return JSON.stringify({ app: 'gym-macro-tracker', exported: new Date().toISOString(), data }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const d = parsed.data ?? parsed;
  if (!d || typeof d !== 'object' || !d.profile) throw new Error('invalid');
  data = migrate(d);
  save();
  listeners.forEach((l) => l());
}

export function resetAll() {
  data = blank();
  save();
  listeners.forEach((l) => l());
}

export { uid };
