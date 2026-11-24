// Ernährung: Tagesziele berechnen, Summen bilden, Grundnahrungsmittel.
import { round, today, addDays, daysBetween } from './util.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'salt'];

/** Aktuelles Körpergewicht = letzter Eintrag. */
export function currentWeight(state) {
  const w = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : null;
}

// Aktivitätsfaktoren (Mifflin-St-Jeor) nach Einheiten pro Woche
const LEVELS = [[1, 1.2, 'sedentary'], [3, 1.375, 'light'], [5.5, 1.55, 'moderate'], [8, 1.725, 'high'], [Infinity, 1.9, 'veryHigh']];

/**
 * Aktivität aus dem, was in der App erfasst ist: Krafttrainings (Tage) + Cardio (45 min ≈ 1 Einheit)
 * der letzten 4 Wochen. Mit weniger als 2 Wochen Verlauf: Schätzung aus dem Rhythmus (Volle Woche 6, Locker ≈ 5,25).
 */
export function activityLevel(state, now = today()) {
  // Apple-Watch-Workouts zählen mit: Krafttraining als Trainingstag, alles andere als Cardio-Minuten.
  // Doppelt erfasst (gleicher Tag schon als Cardio in der App) wird nicht doppelt gezählt.
  const watch = Object.values(state.healthWorkouts || {});
  const manualCardioDays = new Set(state.cardio.map((c) => c.date));
  const strengthDays = [...state.workouts.map((w) => w.date), ...watch.filter((w) => w.kind === 'strength').map((w) => w.date)];
  const cardioList = [...state.cardio, ...watch.filter((w) => w.kind !== 'strength' && !manualCardioDays.has(w.date))];
  const all = [...strengthDays, ...cardioList.map((c) => c.date)].filter((d) => d <= now).sort();
  let perWeek;
  let source;
  if (!all.length || daysBetween(all[0], now) < 13) {
    perWeek = state.profile.rhythm === 'light' ? 5.25 : 6;
    source = 'rhythm';
  } else {
    const from = addDays(now, -27);
    const start = all[0] > from ? all[0] : from;
    const span = daysBetween(start, now) + 1;
    const strength = new Set(strengthDays.filter((d) => d >= start && d <= now)).size;
    const cardioMin = cardioList.filter((c) => c.date >= start && c.date <= now).reduce((sum, c) => sum + (c.minutes || 0), 0);
    perWeek = ((strength + cardioMin / 45) / span) * 7;
    source = 'tracked';
  }
  const [, factor, key] = LEVELS.find(([max]) => perWeek < max);
  return { perWeek: round(perWeek, 1), factor, key, source };
}

/** Defizit (Diät) bzw. Überschuss (Aufbau) in kcal pro Tag – selbst einstellbar, sonst 500 bzw. 300. */
export const ADJ_DEFAULT = { cut: 500, bulk: 300 };
export const ADJ_MAX = 1500;
export function goalAmount(profile, goal = profile.goal) {
  if (goal !== 'cut' && goal !== 'bulk') return 0;
  return profile.goalAdj?.[goal] ?? ADJ_DEFAULT[goal];
}
export function goalAdjust(profile) {
  const v = goalAmount(profile);
  return profile.goal === 'cut' ? -v : v;
}

/**
 * Makros anpassen, wenn im Ziel-Fenster ein Wert geändert wird (base = Werte vor dem Ändern):
 * - kcal: Protein, Kohlenhydrate und Fett im gleichen Verhältnis mitskalieren
 * - Protein: kcal bleiben, Kohlenhydrate und Fett teilen sich den Rest im bisherigen Verhältnis
 * - Kohlenhydrate: kcal bleiben, Fett gleicht aus · Fett: kcal bleiben, Kohlenhydrate gleichen aus
 * Reicht der Rest nicht (Ausgleich wäre unter 0), steigen die kcal stattdessen.
 */
export function rebalanceGoals(base, field, value) {
  const v = Math.max(0, value);
  const kcalOf = (o) => o.p * 4 + o.c * 4 + o.f * 9;
  if (field === 'kcal') {
    const from = kcalOf(base) || 1;
    const k = v / from;
    return { kcal: Math.round(v), p: Math.round(base.p * k), c: Math.round(base.c * k), f: Math.round(base.f * k) };
  }
  const out = { ...base, [field]: v };
  const kcal = base.kcal;
  if (field === 'p') {
    const rest = kcal - v * 4;
    const cE = base.c * 4, fE = base.f * 9;
    const share = cE + fE > 0 ? cE / (cE + fE) : 0.6;
    out.c = Math.max(0, (rest * share) / 4);
    out.f = Math.max(0, (rest * (1 - share)) / 9);
  } else if (field === 'c') {
    out.f = Math.max(0, (kcal - base.p * 4 - v * 4) / 9);
  } else if (field === 'f') {
    out.c = Math.max(0, (kcal - base.p * 4 - v * 9) / 4);
  }
  for (const k of ['p', 'c', 'f']) out[k] = Math.round(out[k]);
  const need = kcalOf(out);
  out.kcal = need > kcal + 10 ? Math.round(need / 10) * 10 : kcal; // kleine Rundungsdifferenzen ignorieren
  return out;
}

/**
 * Tagesziel aus Profil (Mifflin-St-Jeor × Aktivität aus den erfassten Trainings, dann Ziel-Anpassung).
 * Protein 2,3 g pro kg, Fett ca. 28 % der Kalorien, Rest Kohlenhydrate.
 * Gibt null zurück, solange Angaben fehlen.
 */
export function calcGoals(state) {
  const pr = state.profile;
  const kg = currentWeight(state);
  const age = pr.birthYear ? new Date().getFullYear() - pr.birthYear : null;
  if (!kg || !pr.heightCm || !age || !pr.sex) return null;
  const bmr = 10 * kg + 6.25 * pr.heightCm - 5 * age + (pr.sex === 'f' ? -161 : 5);
  const act = activityLevel(state);
  const tdee = bmr * act.factor;
  const adj = goalAdjust(pr);
  const kcal = Math.round((tdee + adj) / 10) * 10;
  const p = Math.round((2.3 * kg) / 5) * 5;
  const f = Math.round((kcal * 0.28) / 9 / 5) * 5;
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, tdee: Math.round(tdee), bmr: Math.round(bmr), act };
}

/** Ziel, das die App benutzt: manuell gesetzt oder berechnet. */
export function goals(state) {
  const base = state.profile.goalOverride || calcGoals(state);
  return { fiber: 30, sugar: 50, salt: 5, ...(base || { kcal: 2500, p: 150, c: 280, f: 80 }), isDefault: !base };
}

export function emptyTotals() {
  return Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
}

export function sumEntries(entries) {
  const t = emptyTotals();
  for (const e of entries) for (const k of NUTRIENTS) t[k] += e.n?.[k] || 0;
  return t;
}

export function dayEntries(state, key) {
  return state.diary[key] || [];
}

/** Nährwerte für eine Menge berechnen (Werte pro 100 g). */
export function forGrams(per100, grams) {
  const out = {};
  for (const k of NUTRIENTS) out[k] = round(((per100?.[k] || 0) * grams) / 100, k === 'salt' ? 2 : 1);
  return out;
}

export function kcalToKj(kcal) { return kcal * 4.184; }
