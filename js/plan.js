// Trainingspläne (Workout_Plan_v5) und flexibler Rhythmus.
//
// Rhythmus-Regel: Die 6 Pläne bilden eine "Runde". Vorgeschlagen wird immer das nächste
// noch offene Training der Runde. Nach N Trainingstagen am Stück kommt eine Pause
// (Volle Woche: 6, Locker: 3). Ein Tag ohne Krafttraining zählt als Pause, auch mit Cardio.
// Verpasst man einen Tag, wartet das Training einfach – die Pause rückt nach hinten.
import { addDays, parseKey } from './util.js';

const V = (name, target = null, note = null) => ({ name, target, note });

// [Name, Ziel, Muskelgruppe, Variante?, optional?]
const RAW = [
  { id: 'P1', name: 'Push 1', focus: 'push', ex: [
    ['Incline Dumbbell Bench Press', 'upper chest', 'chest', V('Machine Chest Fly', 'middle chest')],
    ['Machine Chest Fly', 'middle chest', 'chest', V('Incline Smith Machine Bench Press', 'upper chest')],
    ['EZ-Bar French Press', 'triceps long head', 'triceps', V('Cable Tricep Pushdown', 'triceps', 'wenn Bänke besetzt')],
    ['Machine Lateral Raise', 'side delts', 'shoulders'],
    ['Lying Cable Lateral Raise', 'side delts', 'shoulders'],
    ['Cable Tricep Pushdown – Triangle / Single-Arm', 'triceps lateral head', 'triceps', V('Seated Machine Tricep Extension', 'triceps')],
  ] },
  { id: 'Pu1', name: 'Pull 1', focus: 'pull', ex: [
    ['Lat Pulldown', 'lats', 'back'],
    ['Seated Row Machine', 'upper back', 'back'],
    ['Kneeling Cable Lat Pulldown', 'lats', 'back'],
    ['Machine Preacher Curl – beidhändig', 'biceps short head', 'biceps'],
    ['Single-Arm Cable Bicep Curl', 'biceps long head', 'biceps'],
    ['Wrist Curl', 'forearm flexors', 'forearms'],
    ['Reverse Wrist Curl', 'forearm extensors', 'forearms'],
    ['Hammer Curl', 'brachialis / brachioradialis', 'biceps'],
  ] },
  { id: 'L1', name: 'Legs 1', focus: 'legs', ex: [
    ['Lying Leg Curl', 'hamstrings', 'legs', V('Seated Leg Curl', 'hamstrings')],
    ['Leg Press Calf Raise', 'calves', 'legs'],
    ['Leg Extension', 'quads', 'legs'],
    ['Deep Squat, leichtes Gewicht', 'quads / glutes', 'legs', null, true],
    ['Cable Crunch', 'abs', 'core'],
    ['Hip Adduction Machine', 'adductors', 'legs'],
    ['Machine Ab Crunch', 'abs', 'core'],
    ['Back Extension Machine', 'lower back', 'back'],
  ] },
  { id: 'P2', name: 'Push 2', focus: 'push', ex: [
    ['Machine Chest Press', 'middle chest', 'chest'],
    ['Decline Machine Fly – schräg sitzen', 'lower chest', 'chest', V('Dips', 'lower chest')],
    ['Barbell Overhead Press', 'front delts', 'shoulders'],
    ['EZ-Bar French Press', 'triceps long head', 'triceps'],
    ['Lying Cable Lateral Raise', 'side delts', 'shoulders'],
    ['Cable Tricep Pushdown – Triangle / Single-Arm', 'triceps lateral head', 'triceps'],
  ] },
  { id: 'Pu2', name: 'Pull 2', focus: 'pull', ex: [
    ['Deadlift', 'lower back / hamstrings / glutes', 'back'],
    ['Rope Straight-Arm Pulldown', 'lats', 'back'],
    ['Machine Shrug', 'traps', 'back'],
    ['Seated Incline Dumbbell Curl', 'biceps long head', 'biceps'],
    ['Single-Arm Machine Preacher Curl', 'biceps short head', 'biceps'],
    ['Wrist Curl', 'forearm flexors', 'forearms'],
    ['Reverse Wrist Curl', 'forearm extensors', 'forearms'],
    ['Hammer Curl', 'brachialis / brachioradialis', 'biceps'],
  ] },
  { id: 'L2', name: 'Legs 2', focus: 'legs', ex: [
    ['Lying Leg Curl', 'hamstrings', 'legs', V('Seated Leg Curl', 'hamstrings')],
    ['Leg Press Calf Raise', 'calves', 'legs'],
    ['Leg Extension', 'quads', 'legs'],
    ['Cable Crunch', 'abs', 'core'],
    ['Hip Adduction Machine', 'adductors', 'legs'],
    ['Machine Ab Crunch', 'abs', 'core', V('Rotary Torso Machine', 'obliques')],
    ['Rotary Torso Machine', 'obliques', 'core', null, true],
  ] },
];

export function defaultPlans() {
  return RAW.map((p) => ({
    id: p.id,
    name: p.name,
    focus: p.focus,
    ex: p.ex.map(([name, target, muscle, variant = null, optional = false], i) => ({
      id: `${p.id}-${i}`, name, target, muscle, variant, optional,
    })),
  }));
}

export const RHYTHMS = { full: 6, light: 3 };
export const MUSCLES = ['chest', 'back', 'shoulders', 'triceps', 'biceps', 'forearms', 'legs', 'core'];

/** Muskelgruppen eines Plans (Reihenfolge wie im Plan, ohne Doppelte). */
export function planMuscles(plan) {
  return [...new Set(plan.ex.map((e) => e.muscle))];
}

function strengthDays(workouts) {
  const m = new Map();
  for (const w of workouts) if (w.planId || w.exercises?.length) m.set(w.date, w);
  return m;
}

/** Welche Pläne der aktuellen Runde vor einem Tag schon erledigt sind. */
export function roundDone(workouts, order, beforeKey) {
  let done = [];
  const sorted = workouts.filter((w) => w.date < beforeKey && order.includes(w.planId))
    .sort((a, b) => (a.date + (a.finishedAt || '')).localeCompare(b.date + (b.finishedAt || '')));
  for (const w of sorted) {
    if (!done.includes(w.planId)) done.push(w.planId);
    if (done.length === order.length) done = [];
  }
  return done;
}

/** Trainingstage am Stück direkt vor einem Tag. */
export function streakBefore(workouts, key) {
  const days = strengthDays(workouts);
  let n = 0;
  let k = addDays(key, -1);
  while (days.has(k)) { n++; k = addDays(k, -1); }
  return n;
}

/**
 * Plant die nächsten Tage ab startKey.
 * Rückgabe: [{ date, kind: 'done' | 'train' | 'rest', planId?, chosen? }]
 */
export function schedule(state, startKey, days = 7) {
  const order = state.plans.map((p) => p.id);
  const n = RHYTHMS[state.profile.rhythm] ?? 6;
  let done = roundDone(state.workouts, order, startKey);
  let streak = streakBefore(state.workouts, startKey);
  const out = [];
  const markDone = (id) => {
    if (!done.includes(id)) done.push(id);
    if (done.length === order.length) done = [];
  };
  for (let i = 0; i < days; i++) {
    const date = addDays(startKey, i);
    const already = i === 0 ? state.workouts.filter((w) => w.date === date) : [];
    if (already.length) {
      already.forEach((w) => w.planId && markDone(w.planId));
      out.push({ date, kind: 'done', planId: already[already.length - 1].planId });
      streak++;
      continue;
    }
    const choice = state.dayChoice[date];
    const firstOpen = order.find((id) => !done.includes(id)) ?? order[0];
    if (choice === 'rest' || (!choice && streak >= n)) {
      out.push({ date, kind: 'rest', chosen: choice === 'rest', firstOpen });
      streak = 0;
    } else {
      const planId = choice && order.includes(choice) ? choice : firstOpen;
      out.push({ date, kind: 'train', planId, chosen: !!choice, firstOpen });
      markDone(planId);
      streak++;
    }
  }
  return out;
}

/** Status der Pläne in der aktuellen Runde (für "Anderes Training"). */
export function roundStatus(state, key) {
  const order = state.plans.map((p) => p.id);
  const done = roundDone(state.workouts, order, addDays(key, 1));
  return Object.fromEntries(order.map((id) => [id, done.includes(id)]));
}

export function weekdayIndex(key) { return (parseKey(key).getDay() + 6) % 7; }
