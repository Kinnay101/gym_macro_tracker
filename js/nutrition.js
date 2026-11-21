// Ernährung: Tagesziele berechnen, Summen bilden, Grundnahrungsmittel.
import { round } from './util.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'salt'];

/** Aktuelles Körpergewicht = letzter Eintrag. */
export function currentWeight(state) {
  const w = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : null;
}

/**
 * Tagesziel aus Profil (Mifflin-St-Jeor × Aktivität, dann Ziel-Anpassung).
 * Protein 2,3 g pro kg, Fett ca. 28 % der Kalorien, Rest Kohlenhydrate.
 * Gibt null zurück, solange Angaben fehlen.
 */
export function calcGoals(state) {
  const pr = state.profile;
  const kg = currentWeight(state);
  const age = pr.birthYear ? new Date().getFullYear() - pr.birthYear : null;
  if (!kg || !pr.heightCm || !age || !pr.sex) return null;
  const bmr = 10 * kg + 6.25 * pr.heightCm - 5 * age + (pr.sex === 'f' ? -161 : 5);
  const tdee = bmr * (pr.activity || 1.55);
  const adj = { cut: -500, maintain: 0, bulk: 300 }[pr.goal] ?? 0;
  const kcal = Math.round((tdee + adj) / 10) * 10;
  const p = Math.round((2.3 * kg) / 5) * 5;
  const f = Math.round((kcal * 0.28) / 9 / 5) * 5;
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, tdee: Math.round(tdee), bmr: Math.round(bmr) };
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
