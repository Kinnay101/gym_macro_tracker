// Training: laufendes Training starten/beenden, frühere Sätze, Bestwerte (PRs), Volumen.
import { uid, today, e1rm, num } from './util.js';
import { exCfg, loadOf, hasLoadRule } from './exercises.js';

// ---- Einseitige Ausführung (links/rechts) ----
// Eine Übung kann einseitig gemacht werden (Knopf „L/R“ im Training, Standard im Trainings-Editor). Dann gibt es pro Satz
// ein Gewicht und Wiederholungen links (`reps`) und rechts (`repsR`). Einseitig wird als eigene „Spur“ geführt
// (Fortschritt, Bestwerte, „Zuletzt“, Freunde) – ohne Umrechnung auf beidseitig, weil der Faktor je Übung stark schwankt.
export const UNI = '|uni';
export const trackOf = (ex) => (ex.uni ? ex.name + UNI : ex.name);
export const isUniTrack = (key) => typeof key === 'string' && key.endsWith(UNI);
export const trackBase = (key) => (isUniTrack(key) ? key.slice(0, -UNI.length) : key);
/** Bewegtes Gewicht eines Satzes: `load` (kg pro Seite ×2 bzw. + Stange, siehe js/exercises.js), sonst kg. */
export const setLoad = (s) => s.load ?? s.kg;
/** Geschätztes 1RM eines Satzes; einseitig: die schwächere Seite. */
export function setE1rm(s) {
  const kg = setLoad(s);
  return s.repsR != null ? Math.min(e1rm(kg, s.reps), e1rm(kg, s.repsR)) : e1rm(kg, s.reps);
}
/** Volumen eines Satzes (einseitig: beide Seiten zusammen). */
export const setVolume = (s) => setLoad(s) * ((s.reps || 0) + (s.repsR || 0));
/** Satz im laufenden Training mit bewegtem Gewicht (für den PR-Vergleich). */
export const liveSet = (ex, s) => (hasLoadRule(ex) ? { ...s, load: loadOf(ex, s.kg) } : s);
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

/**
 * Trainings, die als „vorher“ gelten. Beim Bearbeiten eines gespeicherten Trainings (`opt.exclude` = seine ID,
 * `opt.before` = sein Datum) zählen nur andere Trainings bis zu diesem Tag – sonst wäre „Zuletzt“ das Training selbst.
 */
function earlier(state, opt = {}) {
  return state.workouts.filter((w) => w.id !== opt.exclude && (!opt.before || w.date <= opt.before));
}

/** Sätze der Übung aus dem letzten Training, in dem sie vorkam (einseitig und beidseitig getrennt). */
export function lastSetsFor(state, name, uni = false, opt = {}) {
  const ws = earlier(state, opt).sort(sortByDate).reverse();
  for (const w of ws) {
    const ex = w.exercises.find((e) => e.name === name && !!e.uni === !!uni);
    if (ex && ex.sets.some((s) => s.done)) return { date: w.date, sets: ex.sets.filter((s) => s.done) };
  }
  return null;
}

/** Bestes geschätztes 1RM einer Spur (Übungsname, einseitig mit „|uni“) über alle gespeicherten Trainings. */
export function bestFor(state, key, opt = {}) {
  let best = null;
  for (const w of opt.exclude ? earlier(state, { exclude: opt.exclude }) : state.workouts) {
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
      row.l = Math.max(...sets.map((s) => e1rm(setLoad(s), s.reps)));
      row.r = Math.max(...sets.map((s) => e1rm(setLoad(s), s.repsR)));
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
export function prefill(state, name, uni = false, opt = {}) {
  const last = lastSetsFor(state, name, uni, opt);
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
      ...loadRule(state, e.name),
      useVar: false,
      skipped: e.optional, // optionale Übungen sind erst mal übersprungen
      sets: prefill(state, e.name, !!e.uni),
      varSets: e.variant ? prefill(state, e.variant.name, !!e.uni) : null,
    })),
  };
}

/** kg pro Seite (×2) und Grundgewicht aus der Übungsliste – nur gesetzte Felder. */
function loadRule(state, name) {
  const c = exCfg(state, name);
  return { ...(c.x2 ? { x2: true } : {}), ...(c.base ? { base: c.base } : {}) };
}

/** Übung im laufenden (oder bearbeiteten) Training anhängen – z. B. eine Extra-Übung, die nicht im Plan ist. */
export function extraExercise(state, name, muscle, opt = {}) {
  const c = exCfg(state, name);
  return {
    key: uid(), name, target: c.target, muscle: muscle || c.muscle || 'core', variant: null, optional: false,
    uni: c.uni, ...loadRule(state, name), useVar: false, skipped: false, extra: true,
    sets: prefill(state, name, c.uni, opt), varSets: null,
  };
}

/** Name und Sätze, die gerade gelten (Standard oder Variante). */
export function current(ex) {
  return ex.useVar && ex.variant
    ? { name: ex.variant.name, target: ex.variant.target, note: ex.variant.note, sets: ex.varSets }
    : { name: ex.name, target: ex.target, note: null, sets: ex.sets };
}

/** Training abschließen: nur gemachte Übungen und abgehakte Sätze werden gespeichert. */
/** Dauer in Minuten: aus Start/Ende (App) oder gespeichert (Uhr). */
export function workoutMinutes(w) {
  if (w.startedAt && w.finishedAt) return Math.round((new Date(w.finishedAt) - new Date(w.startedAt)) / 60000);
  return w.minutes ?? null;
}

export function finishWorkout(state) {
  const a = state.active;
  if (!a) return null;
  // Am selben Tag schon „ohne Details“ eingetragen oder von der Uhr übernommen → das echte Training ersetzt es
  state.workouts = state.workouts.filter((x) => !(x.date === a.date && !x.exercises.length && (x.quick || x.source === 'watch')));
  const exercises = collectExercises(a);
  const w = { id: a.id, planId: a.planId, date: a.date, startedAt: a.startedAt, finishedAt: new Date().toISOString(), note: a.note, exercises };
  state.workouts.push(w);
  if (a.cardio && a.cardio.minutes > 0 && a.cardio.minutes <= 600) { // negative/unsinnige Minuten nicht speichern
    state.cardio.push({ id: uid(), workoutId: a.id, date: a.date, type: a.cardio.type, minutes: a.cardio.minutes, km: a.cardio.km > 0 && a.cardio.km <= 300 ? a.cardio.km : null, after: true });
  }
  state.active = null;
  return w;
}

/** Gemachte Übungen mit abgehakten Sätzen aus einem laufenden bzw. bearbeiteten Training. */
function collectExercises(a) {
  return a.exercises
    .filter((ex) => !ex.skipped)
    .map((ex) => {
      const c = current(ex);
      // kg pro Seite / Grundgewicht: eingetippter Wert bleibt kg, bewegtes Gewicht steht als load daneben
      const rule = hasLoadRule(ex);
      const sets = c.sets.filter((s) => s.done).map(({ kg, reps, repsR, warmup }) => ({
        kg, reps, ...(ex.uni ? { repsR: repsR ?? reps } : {}), warmup, done: true, ...(rule && kg != null ? { load: loadOf(ex, kg) } : {}),
      }));
      return { name: c.name, muscle: ex.muscle, variant: !!ex.useVar, ...(ex.uni ? { uni: true } : {}), ...(ex.x2 ? { x2: true } : {}), ...(ex.base > 0 ? { base: ex.base } : {}), sets };
    })
    .filter((ex) => ex.sets.length);
}

/**
 * Gespeichertes Training im Trainings-Bildschirm bearbeiten (state.editing, nur auf diesem Gerät).
 * Gespeicherte Übungen mit ihren Sätzen (abgehakt), dazu die übrigen Übungen des Plans – bei einem Training ohne
 * Details (oder von der Uhr) wie beim Start vorbelegt, sonst als übersprungen. `back` = Seite, zu der es danach zurückgeht.
 */
export function startEdit(state, id, back = 'training') {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return false;
  const plan = state.plans.find((p) => p.id === w.planId);
  const opt = { exclude: w.id, before: w.date };
  const bare = !w.exercises.length;
  const fromPlan = (e) => ({
    key: e.id, name: e.name, target: e.target, muscle: e.muscle, variant: e.variant, optional: e.optional, uni: !!e.uni, ...loadRule(state, e.name), useVar: false,
    skipped: bare ? e.optional : true,
    sets: prefill(state, e.name, !!e.uni, opt),
    varSets: e.variant ? prefill(state, e.variant.name, !!e.uni, opt) : null,
  });
  const saved = w.exercises.map((ex) => {
    const pe = plan?.ex.find((e) => e.name === ex.name || e.variant?.name === ex.name);
    const sets = ex.sets.map(({ load, ...s }) => ({ ...s, id: uid(), done: true }));
    const isVar = !!pe?.variant && pe.variant.name === ex.name && pe.name !== ex.name;
    return {
      key: pe?.id || uid(), name: isVar ? pe.name : ex.name, target: pe?.target || '', muscle: ex.muscle, variant: pe?.variant || null,
      optional: false, uni: !!ex.uni, ...(ex.x2 ? { x2: true } : {}), ...(ex.base > 0 ? { base: ex.base } : {}), useVar: isVar, skipped: false,
      sets: isVar ? prefill(state, pe.name, !!ex.uni, opt) : sets,
      varSets: isVar ? sets : (pe?.variant ? prefill(state, pe.variant.name, !!ex.uni, opt) : null),
    };
  });
  const have = new Set(w.exercises.map((e) => e.name));
  const rest = (plan?.ex || []).filter((e) => !have.has(e.name) && !have.has(e.variant?.name)).map(fromPlan);
  state.editing = { id: w.id, planId: w.planId, date: w.date, note: w.note || '', back, exercises: [...saved, ...rest], initial: null };
  state.editing.initial = JSON.stringify(state.editing.exercises);
  return true;
}

/** Bearbeitetes Training übernehmen: Übungen ersetzen (nur abgehakte Sätze), Notiz übernehmen. */
export function finishEdit(state) {
  const e = state.editing;
  if (!e) return null;
  const w = state.workouts.find((x) => x.id === e.id);
  if (w) {
    w.exercises = collectExercises(e);
    w.note = e.note;
    if (w.exercises.length) delete w.quick;
  }
  state.editing = null;
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
