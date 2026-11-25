// Training: laufendes Training starten/beenden, frühere Sätze, Bestwerte (PRs), Volumen.
import { uid, today, e1rm } from './util.js';

const sortByDate = (a, b) => (a.date + (a.finishedAt || '')).localeCompare(b.date + (b.finishedAt || ''));

/** Arbeitssätze (ohne Aufwärmsätze), die abgehakt wurden. */
export function workingSets(ex) {
  return (ex.sets || []).filter((s) => s.done && !s.warmup && s.kg != null && s.reps);
}

/** Sätze der Übung aus dem letzten Training, in dem sie vorkam. */
export function lastSetsFor(state, name) {
  const ws = [...state.workouts].sort(sortByDate).reverse();
  for (const w of ws) {
    const ex = w.exercises.find((e) => e.name === name);
    if (ex && ex.sets.some((s) => s.done)) return { date: w.date, sets: ex.sets.filter((s) => s.done) };
  }
  return null;
}

/** Bestes geschätztes 1RM einer Übung über alle gespeicherten Trainings. */
export function bestFor(state, name) {
  let best = null;
  for (const w of state.workouts) {
    for (const ex of w.exercises) {
      if (ex.name !== name) continue;
      for (const s of workingSets(ex)) {
        const v = e1rm(s.kg, s.reps);
        if (!best || v > best.e1rm) best = { e1rm: v, kg: s.kg, reps: s.reps, date: w.date };
      }
    }
  }
  return best;
}

/** Verlauf: bestes 1RM pro Trainingstag. */
export function historyFor(state, name) {
  const out = [];
  for (const w of [...state.workouts].sort(sortByDate)) {
    const ex = w.exercises.find((e) => e.name === name);
    if (!ex) continue;
    const vals = workingSets(ex).map((s) => e1rm(s.kg, s.reps));
    if (vals.length) out.push({ date: w.date, e1rm: Math.max(...vals) });
  }
  return out;
}

export function volume(w) {
  let v = 0;
  for (const ex of w.exercises) for (const s of workingSets(ex)) v += s.kg * s.reps;
  return v;
}

/**
 * Sätze beim Start: immer 3 Arbeitssätze (Wunsch Nutzer). Gab es die Übung schon, stehen kg und Wiederholungen
 * der Arbeitssätze vom letzten Mal drin (hatte man weniger als 3, wird der letzte wiederholt). Aufwärmsätze nicht.
 */
export const DEFAULT_SETS = 3;
function prefill(state, name) {
  const last = lastSetsFor(state, name);
  const work = last ? last.sets.filter((s) => !s.warmup) : [];
  return Array.from({ length: DEFAULT_SETS }, (_, i) => {
    const s = work[i] || work[work.length - 1];
    return blankSet(false, s?.kg ?? null, s?.reps ?? null);
  });
}
export function blankSet(warmup = false, kg = null, reps = null) {
  return { id: uid(), kg, reps, warmup, done: false };
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
      useVar: false,
      skipped: e.optional, // optionale Übungen sind erst mal übersprungen
      sets: prefill(state, e.name),
      varSets: e.variant ? prefill(state, e.variant.name) : null,
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
      return { name: c.name, muscle: ex.muscle, variant: !!ex.useVar, sets: c.sets.filter((s) => s.done).map(({ kg, reps, warmup }) => ({ kg, reps, warmup, done: true })) };
    })
    .filter((ex) => ex.sets.length);
  const w = { id: a.id, planId: a.planId, date: a.date, startedAt: a.startedAt, finishedAt: new Date().toISOString(), note: a.note, exercises };
  state.workouts.push(w);
  if (a.cardio && a.cardio.minutes) {
    state.cardio.push({ id: uid(), date: a.date, type: a.cardio.type, minutes: a.cardio.minutes, km: a.cardio.km ?? null, after: true });
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
