// Training: laufendes Training starten/beenden, frühere Sätze, Bestwerte (PRs), Volumen.
import { uid, today, e1rm, num } from './util.js';

// ---- Einseitige Ausführung (links/rechts) ----
// Eine Übung kann einseitig gemacht werden (Knopf „L/R“ im Training, Standard im Trainings-Editor). Dann gibt es pro Satz
// ein Gewicht und Wiederholungen links (`reps`) und rechts (`repsR`). Einseitig wird als eigene „Spur“ geführt
// (Fortschritt, Bestwerte, „Zuletzt“, Freunde) – ohne Umrechnung auf beidseitig, weil der Faktor je Übung stark schwankt.
export const UNI = '|uni';
export const trackOf = (ex) => (ex.uni ? ex.name + UNI : ex.name);
export const isUniTrack = (key) => typeof key === 'string' && key.endsWith(UNI);
export const trackBase = (key) => (isUniTrack(key) ? key.slice(0, -UNI.length) : key);
/** Geschätztes 1RM eines Satzes; einseitig: die schwächere Seite. */
export function setE1rm(s) {
  return s.repsR != null ? Math.min(e1rm(s.kg, s.reps), e1rm(s.kg, s.repsR)) : e1rm(s.kg, s.reps);
}
/** Bewegtes Gewicht eines Satzes (einseitig: beide Seiten zusammen). */
export const setVolume = (s) => s.kg * ((s.reps || 0) + (s.repsR || 0));
/** Satz als Text: „30 kg × 10“ bzw. einseitig „30 kg × 10 L · 9 R“. */
export function setText(s, { unit = ' kg', x = ' × ' } = {}) {
  const w = s.warmup ? 'W ' : '';
  return s.repsR != null ? `${w}${num(s.kg, 2)}${unit}${x}${num(s.reps)} L · ${num(s.repsR)} R` : `${w}${num(s.kg, 2)}${unit}${x}${num(s.reps)}`;
}

const sortByDate = (a, b) => (a.date + (a.finishedAt || '')).localeCompare(b.date + (b.finishedAt || ''));

/** Arbeitssätze (ohne Aufwärmsätze), die abgehakt wurden. */
export function workingSets(ex) {
  return (ex.sets || []).filter((s) => s.done && !s.warmup && s.kg != null && s.reps && (!ex.uni || s.repsR));
}

/** Sätze der Übung aus dem letzten Training, in dem sie vorkam (einseitig und beidseitig getrennt). */
export function lastSetsFor(state, name, uni = false) {
  const ws = [...state.workouts].sort(sortByDate).reverse();
  for (const w of ws) {
    const ex = w.exercises.find((e) => e.name === name && !!e.uni === !!uni);
    if (ex && ex.sets.some((s) => s.done)) return { date: w.date, sets: ex.sets.filter((s) => s.done) };
  }
  return null;
}

/** Bestes geschätztes 1RM einer Spur (Übungsname, einseitig mit „|uni“) über alle gespeicherten Trainings. */
export function bestFor(state, key) {
  let best = null;
  for (const w of state.workouts) {
    for (const ex of w.exercises) {
      if (trackOf(ex) !== key) continue;
      for (const s of workingSets(ex)) {
        const v = setE1rm(s);
        if (!best || v > best.e1rm) best = { e1rm: v, kg: s.kg, reps: s.reps, repsR: s.repsR ?? null, date: w.date };
      }
    }
  }
  return best;
}

/** Verlauf: bestes 1RM pro Trainingstag. Einseitig zusätzlich je Seite (`l`, `r`); `e1rm` = schwächere Seite. */
export function historyFor(state, key) {
  const out = [];
  for (const w of [...state.workouts].sort(sortByDate)) {
    const ex = w.exercises.find((e) => trackOf(e) === key);
    if (!ex) continue;
    const sets = workingSets(ex);
    if (!sets.length) continue;
    const row = { date: w.date, e1rm: Math.max(...sets.map(setE1rm)) };
    if (ex.uni) {
      row.l = Math.max(...sets.map((s) => e1rm(s.kg, s.reps)));
      row.r = Math.max(...sets.map((s) => e1rm(s.kg, s.repsR)));
    }
    out.push(row);
  }
  return out;
}

export function volume(w) {
  let v = 0;
  for (const ex of w.exercises) for (const s of workingSets(ex)) v += setVolume(s);
  return v;
}

/**
 * Sätze beim Start: immer 3 Arbeitssätze (Wunsch Nutzer). Gab es die Übung schon, steht nur das Gewicht (kg) der
 * Arbeitssätze vom letzten Mal drin (hatte man weniger als 3, wird der letzte wiederholt). Wiederholungen bleiben leer
 * und werden selbst eingetragen – damit gilt der Satz als gemacht (siehe views/active.js). „Zuletzt“ zeigt kg×Wdh.
 */
export const DEFAULT_SETS = 3;
function prefill(state, name, uni = false) {
  const last = lastSetsFor(state, name, uni);
  const work = last ? last.sets.filter((s) => !s.warmup) : [];
  return Array.from({ length: DEFAULT_SETS }, (_, i) => {
    const s = work[i] || work[work.length - 1];
    const b = blankSet(false, s?.kg ?? null, null);
    if (uni) b.repsR = null;
    return b;
  });
}
export function blankSet(warmup = false, kg = null, reps = null, repsR = null) {
  const s = { id: uid(), kg, reps, warmup, done: false };
  if (repsR != null) s.repsR = repsR;
  return s;
}
/** Sätze für einseitig/beidseitig neu vorbelegen (Knopf „L/R“): erledigte Sätze bleiben, offene bekommen die kg vom letzten Mal. */
export function refillFor(state, name, uni, sets) {
  const fresh = prefill(state, name, uni);
  let n = 0;
  return sets.map((s) => {
    const { repsR, ...base } = s;
    if (s.done || s.warmup) return uni ? { ...base, repsR: repsR ?? s.reps ?? null } : base;
    const f = fresh[Math.min(n++, fresh.length - 1)];
    // kg vom letzten Mal in dieser Ausführung; gab es sie noch nie, bleibt das Feld leer (einseitig geht meist weniger)
    return { ...base, kg: f ? f.kg : null, reps: null, ...(uni ? { repsR: null } : {}) };
  });
}

export function startWorkout(state, planId) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return;
  state.active = {
    id: uid(),
    planId,
    date: today(),
    startedAt: new Date().toISOString(),
    note: '',
    cardio: null,
    exercises: plan.ex.map((e) => ({
      key: e.id,
      name: e.name,
      target: e.target,
      muscle: e.muscle,
      variant: e.variant,
      optional: e.optional,
      uni: !!e.uni, // im Trainings-Editor als „einseitig“ vorgemerkt
      useVar: false,
      skipped: e.optional, // optionale Übungen sind erst mal übersprungen
      sets: prefill(state, e.name, !!e.uni),
      varSets: e.variant ? prefill(state, e.variant.name, !!e.uni) : null,
    })),
  };
}

/** Name und Sätze, die gerade gelten (Standard oder Variante). */
export function current(ex) {
  return ex.useVar && ex.variant
    ? { name: ex.variant.name, target: ex.variant.target, note: ex.variant.note, sets: ex.varSets }
    : { name: ex.name, target: ex.target, note: null, sets: ex.sets };
}

/** Training abschließen: nur gemachte Übungen und abgehakte Sätze werden gespeichert. */
export function finishWorkout(state) {
  const a = state.active;
  if (!a) return null;
  const exercises = a.exercises
    .filter((ex) => !ex.skipped)
    .map((ex) => {
      const c = current(ex);
      const sets = c.sets.filter((s) => s.done).map(({ kg, reps, repsR, warmup }) => (ex.uni ? { kg, reps, repsR: repsR ?? reps, warmup, done: true } : { kg, reps, warmup, done: true }));
      return { name: c.name, muscle: ex.muscle, variant: !!ex.useVar, ...(ex.uni ? { uni: true } : {}), sets };
    })
    .filter((ex) => ex.sets.length);
  const w = { id: a.id, planId: a.planId, date: a.date, startedAt: a.startedAt, finishedAt: new Date().toISOString(), note: a.note, exercises };
  state.workouts.push(w);
  if (a.cardio && a.cardio.minutes > 0 && a.cardio.minutes <= 600) { // negative/unsinnige Minuten nicht speichern
    state.cardio.push({ id: uid(), date: a.date, type: a.cardio.type, minutes: a.cardio.minutes, km: a.cardio.km > 0 && a.cardio.km <= 300 ? a.cardio.km : null, after: true });
  }
  state.active = null;
  return w;
}

/** Sätze pro Muskelgruppe in einem Zeitraum (nur Arbeitssätze). */
export function setsPerMuscle(state, fromKey, toKey) {
  const out = {};
  for (const w of state.workouts) {
    if (w.date < fromKey || w.date > toKey) continue;
    for (const ex of w.exercises) out[ex.muscle] = (out[ex.muscle] || 0) + workingSets(ex).length;
  }
  return out;
}
