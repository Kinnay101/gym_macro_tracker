// Trainingspläne (Workout_Plan_v5), Splits und Kalender-Planung.
//
// Split = feste Reihenfolge aus Trainings und Ruhetagen, die sich wiederholt (z. B. Push 1 … Legs 2, Ruhetag).
// Der Ablauf hängt am Kalender: Ankerpunkt (Datum + Position im Split), ab dort ein Tag = ein Schritt.
// Verpasst man ein Training, fällt es weg (der Plan bleibt am Kalender). Wer stattdessen „verschieben“ wählt,
// setzt an diesem Tag eine Pause (shifts) – ab da rutscht alles einen Tag nach hinten.
// Einzelne Tage lassen sich ändern (dayChoice: 'rest' oder Training), Cardio kommt aus dem Split,
// aus festen Wochentagen (weeklyCardio) oder ist für einen Tag eingetragen (plannedCardio).
import { addDays, parseKey, daysBetween, today, uid } from './util.js';

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
export const CARDIO_TYPES = ['run', 'treadmill', 'bike', 'crosstrainer', 'rowing', 'stairs', 'swim', 'other'];
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

/** Alte Rhythmus-Planung (vor den Splits) – nur noch für die einmalige Umstellung auf Splits. */
function legacySchedule(state, startKey, days = 7) {
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

export function weekdayIndex(key) { return (parseKey(key).getDay() + 6) % 7; }

// ---------- Splits ----------

/** Standard-Splits aus den bisherigen Rhythmen: Volle Woche (6 + 1 Ruhetag), Locker (3 + 1, 3 + 1). */
export function defaultSplits() {
  const T = (planId) => ({ kind: 'train', planId });
  const R = () => ({ kind: 'rest' });
  return [
    { id: 'full', name: null, days: [T('P1'), T('Pu1'), T('L1'), T('P2'), T('Pu2'), T('L2'), R()] },
    { id: 'light', name: null, days: [T('P1'), T('Pu1'), T('L1'), R(), T('P2'), T('Pu2'), T('L2'), R()] },
  ];
}

/**
 * Sorgt dafür, dass state.training existiert. Beim ersten Mal (Umstellung vom Rhythmus) beginnt der Split heute
 * genau dort, wo der alte Vorschlag stand – am heutigen Training ändert sich also nichts.
 */
export function ensureTraining(state, now = today()) {
  state.plannedCardio ||= {};
  if (state.training?.splits?.length) return state;
  const splits = defaultSplits().map((x) => ({ ...x, name: state.profile?.rhythmNames?.[x.id] || null }));
  const activeId = state.profile?.rhythm === 'light' ? 'light' : 'full';
  const sp = splits.find((x) => x.id === activeId);
  let index = 0;
  try {
    const doneToday = (state.workouts || []).filter((w) => w.date === now && w.planId).pop();
    const old = doneToday ? { kind: 'train', planId: doneToday.planId } : legacySchedule(state, now, 1)[0];
    if (old.kind === 'train' || old.kind === 'done') {
      const i = sp.days.findIndex((d) => d.planId === old.planId);
      if (i >= 0) index = i;
    } else {
      const i = sp.days.findIndex((d, k) => d.kind === 'rest' && sp.days[(k + 1) % sp.days.length].planId === old.firstOpen);
      index = i >= 0 ? i : sp.days.findIndex((d) => d.kind === 'rest');
    }
  } catch { index = 0; }
  state.training = { splits, activeSplit: activeId, anchor: { date: now, index: Math.max(0, index) }, shifts: [], weeklyCardio: [] };
  return state;
}

export function activeSplit(state) {
  const tr = state.training;
  return tr?.splits?.find((s) => s.id === tr.activeSplit) || tr?.splits?.[0] || null;
}

const mod = (a, n) => ((a % n) + n) % n;

/** Position im Split an einem Tag (Verschiebungen zwischen Anker und Tag eingerechnet). */
export function cyclePos(state, date) {
  const tr = state.training;
  const sp = activeSplit(state);
  const len = sp?.days?.length || 1;
  const a = tr?.anchor || { date, index: 0 };
  const shifts = tr?.shifts || [];
  const n = date >= a.date
    ? shifts.filter((s) => s >= a.date && s < date).length
    : -shifts.filter((s) => s >= date && s < a.date).length;
  return mod(a.index + daysBetween(a.date, date) - n, len);
}

/**
 * Geplanter Tag: { date, kind: 'train' | 'rest', planId, chosen (Tag geändert), shifted (Pause durch Verschieben),
 *   pos, base (Tag laut Split), cardio: [{ type, minutes, from: 'split' | 'weekly' | 'day', id? }] }
 */
export function dayPlan(state, date) {
  const tr = state.training || {};
  const sp = activeSplit(state);
  const planIds = new Set(state.plans.map((p) => p.id));
  const shifted = (tr.shifts || []).includes(date);
  const pos = cyclePos(state, date);
  const base = shifted ? { kind: 'rest' } : (sp?.days?.[pos] || { kind: 'rest' });
  let kind = base.kind === 'train' && planIds.has(base.planId) ? 'train' : 'rest';
  let planId = kind === 'train' ? base.planId : null;
  let chosen = false;
  const choice = state.dayChoice?.[date];
  if (!shifted && choice) {
    if (choice === 'rest') { kind = 'rest'; planId = null; chosen = true; }
    else if (planIds.has(choice)) { kind = 'train'; planId = choice; chosen = true; }
  }
  const cardio = [];
  if (!shifted && !chosen && base.cardio?.minutes) cardio.push({ type: base.cardio.type, minutes: base.cardio.minutes, from: 'split' });
  for (const w of tr.weeklyCardio || []) if (w.weekday === weekdayIndex(date)) cardio.push({ type: w.type, minutes: w.minutes, from: 'weekly', id: w.id });
  for (const c of state.plannedCardio?.[date] || []) cardio.push({ ...c, from: 'day' });
  return { date, kind, planId, chosen, shifted, pos, base, cardio };
}

/** Nächstes Training im Split nach einer Position (für „Trotzdem trainieren“ an einem Ruhetag). */
function nextTrainAfter(state, pos) {
  const sp = activeSplit(state);
  const ids = new Set(state.plans.map((p) => p.id));
  const len = sp?.days?.length || 0;
  for (let i = 1; i <= len; i++) {
    const d = sp.days[(pos + i) % len];
    if (d.kind === 'train' && ids.has(d.planId)) return d.planId;
  }
  return state.plans[0]?.id;
}

/**
 * Plan für die nächsten Tage ab startKey.
 * Rückgabe wie dayPlan, dazu kind 'done' (an dem Tag schon trainiert; planId = gemachtes Training) und firstOpen.
 */
export function schedule(state, startKey, days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startKey, i);
    const p = dayPlan(state, date);
    const done = state.workouts.filter((w) => w.date === date);
    const firstOpen = p.kind === 'train' ? p.planId : nextTrainAfter(state, p.pos);
    if (done.length) out.push({ ...p, kind: 'done', plannedKind: p.kind, plannedPlanId: p.planId, planId: done[done.length - 1].planId, firstOpen });
    else out.push({ ...p, firstOpen });
  }
  return out;
}

/** Wann ein Training zuletzt gemacht wurde (für „Anderes Training“). */
export function lastDone(state) {
  const m = {};
  for (const w of state.workouts) if (w.planId && (!m[w.planId] || w.date > m[w.planId])) m[w.planId] = w.date;
  return m;
}

/** Geplante Einheiten pro Woche laut Split und Cardio-Plan (45 min Cardio ≈ 1 Einheit). */
export function plannedPerWeek(state) {
  const sp = activeSplit(state);
  const len = sp?.days?.length || 7;
  const train = (sp?.days || []).filter((d) => d.kind === 'train').length;
  const splitCardio = (sp?.days || []).reduce((s, d) => s + (d.cardio?.minutes || 0), 0);
  const weekly = (state.training?.weeklyCardio || []).reduce((s, w) => s + (w.minutes || 0), 0);
  return { strength: (train / len) * 7, total: ((train + splitCardio / 45) / len) * 7 + weekly / 45 };
}

/** Kürzel eines Trainings für den Kalender (selbst gesetzt, sonst aus dem Namen). */
export function planShort(plan) {
  if (!plan) return '';
  if (plan.short) return plan.short;
  if (/^(P|Pu|L)\d$/.test(plan.id)) return plan.id;
  const words = plan.name.trim().split(/\s+/);
  const num = words.find((w) => /^\d+$/.test(w)) || '';
  return (words[0].slice(0, num ? 2 : 3) + num).slice(0, 4);
}

export function newPlan(name) {
  return { id: 'u' + uid(), name, short: null, focus: null, ex: [] };
}
export function newSplit(name, plans) {
  return { id: 's' + uid(), name, days: [...plans.slice(0, 3).map((p) => ({ kind: 'train', planId: p.id })), { kind: 'rest' }] };
}
