// Übungen: alle bekannten Übungen (aus Trainings, Verlauf und eigener Liste) und ihre Einstellungen.
//
// Eigene Liste `state.exLib`: [{ id, name, muscle, x2, base, uni, target? }] – Sync-Dokument `exlib:<id>`.
//   target = Ziel (z. B. „obere Brust“) für Übungen, die im Training hinzugefügt werden (Plan-Übungen haben ihr eigenes)
//   x2   = Gewicht wird pro Seite eingegeben (z. B. Maschine mit zwei Armen, zwei Kabelzüge) → bewegt = kg × 2
//   base = festes Grundgewicht, das dazukommt (z. B. Langhantelstange 20 kg) → bewegt = kg + base
//   uni  = Standard „einseitig (L/R)“, wenn die Übung im Training hinzugefügt wird
// Eingetippt und als „Zuletzt“ angezeigt wird immer der Wert wie an der Maschine (pro Seite / ohne Stange).
// Volumen, 1RM, Bestwerte und Rangliste rechnen mit dem bewegten Gewicht: am gespeicherten Satz steht dafür `load`.
import { uid } from './util.js';
import { livePlans } from './plan.js';

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function libEntry(state, name) {
  return (state.exLib || []).find((x) => same(x.name, name)) || null;
}

/** Einstellungen einer Übung (Standard: Gesamtgewicht, kein Grundgewicht). */
export function exCfg(state, name) {
  const e = libEntry(state, name);
  return { x2: !!e?.x2, base: e?.base > 0 ? e.base : null, uni: !!e?.uni, muscle: e?.muscle || null, target: e?.target || '' };
}

/** Bewegtes Gewicht aus dem eingetippten Wert. `ex` = Übung mit x2/base (laufend oder gespeichert). */
export function loadOf(ex, kg) {
  if (kg == null) return null;
  const v = kg * (ex?.x2 ? 2 : 1) + (ex?.base > 0 ? ex.base : 0);
  return Math.round(v * 100) / 100;
}
export const hasLoadRule = (ex) => !!ex?.x2 || ex?.base > 0;

/** Einstellungen einer Übung setzen (legt den Eintrag an, wenn nötig). */
export function setLib(state, name, patch) {
  state.exLib ||= [];
  let e = libEntry(state, name);
  if (!e) { e = { id: 'x' + uid(), name: name.trim(), muscle: null, x2: false, base: null, uni: false }; state.exLib.push(e); }
  // Wieder benutzt/bearbeitet → gelöschte Übung erscheint wieder
  if (e.hidden && !('hidden' in patch)) delete e.hidden;
  Object.assign(e, patch);
  if (!(e.base > 0)) e.base = null;
  return e;
}

/**
 * Übung löschen: aus allen aktuellen Trainings entfernen (als Variante: Variante weg) und in der Übungsliste
 * ausblenden (`hidden`). Gespeicherte Trainings, Verlauf und Bestwerte bleiben – deshalb nur ausblenden statt löschen.
 */
export function deleteExercise(state, name) {
  for (const p of livePlans(state)) {
    p.ex = (p.ex || []).filter((e) => !same(e.name, name));
    for (const e of p.ex) if (e.variant && same(e.variant.name, name)) e.variant = null;
  }
  setLib(state, name, { hidden: true });
}

/**
 * Alle bekannten Übungen, alphabetisch: { name, muscle, lib, plans: [Trainingsnamen], last: Datum, count }.
 * Quelle: eigene Liste, aktuelle Trainings (auch Varianten) und gespeicherte Trainings.
 */
export function allExercises(state) {
  const map = new Map();
  const get = (name) => {
    const k = name.trim().toLowerCase();
    if (!map.has(k)) map.set(k, { name: name.trim(), muscle: null, lib: null, plans: [], last: null, count: 0 });
    return map.get(k);
  };
  for (const w of state.workouts || []) {
    for (const ex of w.exercises || []) {
      if (!ex.name) continue;
      const x = get(ex.name);
      x.count++;
      if (!x.last || w.date > x.last) { x.last = w.date; x.muscle = ex.muscle || x.muscle; }
    }
  }
  for (const p of livePlans(state)) {
    for (const e of p.ex || []) {
      for (const n of [e.name, e.variant?.name]) {
        if (!n?.trim()) continue;
        const x = get(n);
        x.muscle = e.muscle || x.muscle;
        if (!x.plans.includes(p.name)) x.plans.push(p.name);
      }
    }
  }
  for (const e of state.exLib || []) {
    if (!e.name?.trim()) continue;
    const x = get(e.name);
    x.lib = e;
    x.name = e.name.trim();
    if (e.muscle) x.muscle = e.muscle;
  }
  // Gelöschte Übungen (nur noch im Verlauf) nicht mehr anzeigen – ausser sie steht wieder in einem Training
  return [...map.values()].filter((x) => !x.lib?.hidden || x.plans.length).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Alle schon benutzten Ziele (z. B. „obere Brust“) für die Auswahlliste – aus Trainings, Varianten und Übungsliste. */
export function allTargets(state, extra = []) {
  const set = new Map();
  const add = (v) => { const s = String(v || '').trim(); if (s && !set.has(s.toLowerCase())) set.set(s.toLowerCase(), s); };
  extra.forEach(add);
  for (const p of state.plans || []) for (const e of p.ex || []) { add(e.target); add(e.variant?.target); }
  for (const e of state.exLib || []) add(e.target);
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'de'));
}
export const targetList = (state, extra = [], id = 'ex-targets') => `<datalist id="${id}">${allTargets(state, extra).map((v) => `<option value="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`).join('')}</datalist>`;

/** Wie oft die Übung in gespeicherten Trainings vorkommt. */
export function historyCount(state, name) {
  let n = 0;
  for (const w of state.workouts || []) for (const ex of w.exercises || []) if (same(ex.name, name)) n++;
  return n;
}

/**
 * Neue Regel (kg pro Seite / Grundgewicht) auch auf frühere Trainings anwenden – wenn man dort schon pro Seite bzw.
 * ohne Stange eingetragen hatte. Sonst würde das bewegte Gewicht ab jetzt plötzlich doppelt so hoch (lauter „PRs“).
 */
export function reapplyHistory(state, name, rule) {
  for (const w of state.workouts || []) {
    for (const ex of w.exercises || []) {
      if (!same(ex.name, name)) continue;
      if (rule.x2) ex.x2 = true; else delete ex.x2;
      if (rule.base > 0) ex.base = rule.base; else delete ex.base;
      for (const s of ex.sets || []) { if (hasLoadRule(ex) && s.kg != null) s.load = loadOf(ex, s.kg); else delete s.load; }
    }
  }
}

/** Übung überall umbenennen (Trainings, Varianten, Verlauf, laufendes Training, eigene Liste). */
export function renameExercise(state, from, to) {
  const fix = (o, f = 'name') => { if (o && same(o[f], from)) o[f] = to; };
  for (const p of state.plans || []) for (const e of p.ex || []) { fix(e); fix(e.variant); }
  for (const w of state.workouts || []) for (const ex of w.exercises || []) fix(ex);
  for (const k of ['active', 'editing']) for (const ex of state[k]?.exercises || []) { fix(ex); fix(ex.variant); }
  const e = libEntry(state, from);
  if (e) e.name = to;
}
