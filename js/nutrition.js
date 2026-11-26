// Ernährung: Tagesziele berechnen, Summen bilden, Grundnahrungsmittel.
import { round, today, addDays, daysBetween } from './util.js';
import { plannedPerWeek } from './plan.js';
import { cardioSessions } from './cardio.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'salt', 'sfa']; // sfa = gesättigte Fettsäuren (kann null sein)

/** Aktuelles Körpergewicht = letzter Eintrag. */
export function currentWeight(state) {
  const w = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : null;
}

// Aktivitätsfaktoren (Mifflin-St-Jeor) nach Einheiten pro Woche
const LEVELS = [[1, 1.2, 'sedentary'], [3, 1.375, 'light'], [5.5, 1.55, 'moderate'], [8, 1.725, 'high'], [Infinity, 1.9, 'veryHigh']];

/**
 * Aktivität aus dem, was in der App erfasst ist: Krafttrainings (Tage) + Cardio (45 min ≈ 1 Einheit)
 * der letzten 4 Wochen. Mit weniger als 2 Wochen Verlauf: Schätzung aus dem aktiven Split (Trainingstage + geplantes Cardio pro Woche).
 */
export function activityLevel(state, now = today()) {
  // Uhr-Workouts zählen mit: Krafttraining als Trainingstag, Cardio aus der zusammengeführten Liste
  // (dieselbe Einheit von Uhr und von Hand nur einmal, siehe js/cardio.js).
  const watch = Object.values(state.healthWorkouts || {});
  const strengthDays = [...state.workouts.map((w) => w.date), ...watch.filter((w) => w.kind === 'strength').map((w) => w.date)];
  const cardioList = cardioSessions(state, '0000-00-00', now);
  const all = [...strengthDays, ...cardioList.map((c) => c.date)].filter((d) => d <= now).sort();
  let perWeek;
  let source;
  if (!all.length || daysBetween(all[0], now) < 13) {
    perWeek = plannedPerWeek(state).total;
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

export const GOAL_FIELDS = ['kcal', 'p', 'c', 'f'];
const KCAL_PER_G = { p: 4, c: 4, f: 9 };

/** Welche Felder bleiben stehen: die drei zuletzt eingegebenen (order = Eingabe-Reihenfolge, ältestes zuerst). */
export function lockedFields(order) {
  return [...new Set([...order].reverse())].slice(0, 3);
}

/**
 * Ziel-Fenster: Ein Wert wurde eingegeben → die anderen passen sich an (base = Werte vor dieser Eingabe).
 * Die drei zuletzt eingegebenen Werte bleiben stehen (locked), der Rest wird ausgerechnet:
 * - kcal nicht mehr unter den letzten drei → kcal = 4 × Protein + 4 × KH + 9 × Fett
 * - nur kcal festgelegt → Protein, KH und Fett im gleichen Verhältnis mitskalieren
 * - zwei Makros offen → die teilen sich den Rest im bisherigen Verhältnis; Protein bleibt dabei möglichst stehen
 * Reicht der Rest nicht (Ausgleich wäre unter 0), steigen die kcal stattdessen.
 * Gibt { values, computed } zurück – computed = Felder, die ausgerechnet wurden.
 */
export function rebalanceGoals(base, locked, field, value) {
  const v = Math.max(0, value);
  const kcalOf = (o) => o.p * 4 + o.c * 4 + o.f * 9;
  const out = { ...base, [field]: v };
  const lock = new Set([...locked, field]);
  let free = ['p', 'c', 'f'].filter((m) => !lock.has(m));

  // kcal offen → aus den drei Makros ausrechnen
  if (!lock.has('kcal')) {
    out.kcal = Math.round(kcalOf(out));
    return { values: out, computed: ['kcal'] };
  }
  // Protein ändert sich nur, wenn sonst nichts offen ist (z. B. nur kcal eingegeben)
  if (free.length === 2 && free.includes('p')) free = free.filter((m) => m !== 'p');

  const fixedE = ['p', 'c', 'f'].filter((m) => !free.includes(m)).reduce((s, m) => s + out[m] * KCAL_PER_G[m], 0);
  const rest = out.kcal - fixedE;
  const baseE = free.reduce((s, m) => s + base[m] * KCAL_PER_G[m], 0);
  for (const m of free) {
    const share = baseE > 0 ? (base[m] * KCAL_PER_G[m]) / baseE : 1 / free.length;
    out[m] = Math.max(0, Math.round((rest * share) / KCAL_PER_G[m]));
  }
  // Reicht der Rest nicht (Makros schon über den kcal) → kcal steigen
  const need = kcalOf(out);
  if (need > out.kcal + 10) return { values: { ...out, kcal: Math.round(need) }, computed: [...free, 'kcal'] };
  return { values: out, computed: free };
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

/** Weitere Tagesziele (selbst einstellbar unter Körper → Ziel). Gesättigte Fette: max. 10 % der kcal (WHO). */
export const EXTRA_GOALS = ['fiber', 'sugar', 'salt', 'sfa'];
export function extraGoalDefaults(kcal) {
  return { fiber: 30, sugar: 50, salt: 5, sfa: Math.round((kcal * 0.1) / 9) };
}

/** Ziel, das die App benutzt: manuell gesetzt oder berechnet; weitere Ziele selbst gesetzt oder Standard. */
export function goals(state) {
  const base = state.profile.goalOverride || calcGoals(state);
  const main = base || { kcal: 2500, p: 150, c: 280, f: 80 };
  const extra = Object.fromEntries(Object.entries(state.profile.goalExtra || {}).filter(([k, v]) => EXTRA_GOALS.includes(k) && v != null));
  return { ...extraGoalDefaults(main.kcal), ...main, ...extra, isDefault: !base };
}

export function emptyTotals() {
  return Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
}

/**
 * Summen eines Tages. Gesättigte Fette sind nicht bei allen Einträgen bekannt (ältere Einträge, manche Produkte):
 * sfa = Summe der bekannten, sfaFat = Fett genau dieser Einträge (für das Verhältnis), sfaN/count = wie viele bekannt.
 */
export function sumEntries(entries) {
  const t = emptyTotals();
  t.sfaFat = 0; t.sfaN = 0; t.count = 0;
  for (const e of entries) {
    for (const k of NUTRIENTS) t[k] += e.n?.[k] || 0;
    t.count++;
    if (e.n?.sfa != null) { t.sfaN++; t.sfaFat += e.n.f || 0; }
    else if (!(e.n?.f > 0)) t.sfaN++; // ohne Fett ist nichts unbekannt
  }
  return t;
}

export function dayEntries(state, key) {
  return state.diary[key] || [];
}

/** Nährwerte für eine Menge berechnen (Werte pro 100 g). */
export function forGrams(per100, grams) {
  const out = {};
  for (const k of NUTRIENTS) {
    // gesättigte Fette: unbekannt bleibt unbekannt (null), nicht 0
    if (k === 'sfa' && per100?.sfa == null) { out.sfa = null; continue; }
    out[k] = round(((per100?.[k] || 0) * grams) / 100, k === 'salt' ? 2 : 1);
  }
  return out;
}

export function kcalToKj(kcal) { return kcal * 4.184; }

// ---- Eingaben prüfen (Prüfbericht A1: negative/unsinnige Mengen wurden gespeichert) ----
export const MAX_GRAMS = 5000;
/** Menge in Gramm gültig? (mehr als 0, höchstens 5 kg) */
export const validGrams = (g) => g != null && Number.isFinite(g) && g > 0 && g <= MAX_GRAMS;
/** Nährwerte pro 100 g eines eigenen Lebensmittels prüfen → Text-Schlüssel des Fehlers oder null. */
export function per100Error(n) {
  if (Object.values(n).some((v) => v != null && (!Number.isFinite(v) || v < 0))) return 'food.errNegative';
  if (n.kcal > 900) return 'food.errKcal100';
  if ((n.p || 0) + (n.c || 0) + (n.f || 0) > 101) return 'food.errOver100';
  for (const k of ['fiber', 'sugar', 'salt', 'sfa']) if ((n[k] || 0) > 100) return 'food.errOver100';
  if (n.sfa != null && n.sfa > (n.f || 0) + 0.05) return 'food.errSfa';
  if ((n.sugar || 0) > (n.c || 0) + 0.05) return 'food.errSugar';
  return null;
}
