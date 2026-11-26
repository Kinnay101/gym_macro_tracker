// Zerlegt die App-Daten in kleine "Dokumente" (für den Sync) und setzt sie wieder zusammen.
// Jeder Tagebuch-Eintrag, jedes Training, jedes Gewicht … ist ein eigenes Dokument.
// So gehen keine Einträge verloren, wenn PC und iPhone gleichzeitig etwas ändern.
// Trainings (Pläne) und Splits sind ebenfalls einzelne Dokumente (plan:, split:, shift:, restart:, wcardio:, dazu
// Reihenfolge/Einstellungen in planorder und tmeta). Früher waren es zwei grosse Dokumente „plans“ und „training“ –
// die werden von alten App-Versionen noch verstanden und weiterhin übernommen.

/** Dokument-Arten, die es seit der Aufteilung gibt (für die einmalige Umstellung im Sync). */
export const SPLIT_KINDS = new Set(['plan', 'planorder', 'split', 'tmeta', 'shift', 'restart', 'wcardio']);
export const DOCS_VERSION = 2;

/** Alle Dokumente des Zustands als Map key → Wert. */
export function toDocs(state) {
  const m = new Map();
  m.set('profile', state.profile);
  for (const p of state.plans || []) m.set(`plan:${p.id}`, p);
  m.set('planorder', (state.plans || []).map((p) => p.id));
  if (state.active) m.set('active', state.active);
  for (const [date, list] of Object.entries(state.diary || {})) {
    for (const e of list) m.set(`entry:${date}:${e.id}`, e);
  }
  for (const f of state.foods || []) m.set(`food:${f.id}`, f);
  for (const r of state.recipes || []) m.set(`recipe:${r.id}`, r);
  for (const [id, f] of Object.entries(state.offCache || {})) m.set(`off:${id}`, f);
  for (const w of state.weights || []) m.set(`weight:${w.date}`, w);
  for (const x of state.measures || []) m.set(`measure:${x.date}`, x);
  for (const w of state.workouts || []) m.set(`workout:${w.id}`, w);
  for (const c of state.cardio || []) m.set(`cardio:${c.id}`, c);
  for (const [date, v] of Object.entries(state.dayChoice || {})) m.set(`choice:${date}`, v);
  if (state.training) {
    const { splits = [], shifts = [], restarts = [], weeklyCardio = [], ...rest } = state.training;
    m.set('tmeta', { ...rest, splitOrder: splits.map((x) => x.id) });
    for (const sp of splits) m.set(`split:${sp.id}`, sp);
    for (const d of shifts) m.set(`shift:${d}`, 1);
    for (const r of restarts) m.set(`restart:${r.date}`, r);
    for (const w of weeklyCardio) m.set(`wcardio:${w.id}`, w);
  }
  for (const [date, v] of Object.entries(state.plannedCardio || {})) if (v?.length) m.set(`pcardio:${date}`, v);
  for (const [date, v] of Object.entries(state.sickDays || {})) if (v) m.set(`sick:${date}`, v);
  for (const [date, v] of Object.entries(state.healthDays || {})) m.set(`hday:${date}`, v);
  for (const [id, v] of Object.entries(state.healthWorkouts || {})) m.set(`hw:${id}`, v);
  for (const [date, v] of Object.entries(state.healthSleep || {})) m.set(`sleep:${date}`, v);
  for (const [id, v] of Object.entries(state.healthInbox || {})) m.set(`hinbox:${id}`, v);
  // Hinweis „Gewicht übernommen – Ziel geändert“ mitsynchronisieren: der Kurzbefehl wird oft auf einem anderen Gerät verarbeitet
  if (state.healthLastImport) m.set('hmeta', { lastImport: state.healthLastImport, ...(state.healthWeightNew ? { weightNew: state.healthWeightNew } : {}) });
  return m;
}

/** Ein Dokument in den Zustand übernehmen. value === undefined bedeutet: gelöscht. */
export function applyDoc(state, key, value) {
  const del = value === undefined || value === null;
  const [kind, a, b] = splitKey(key);
  const upsertBy = (list, field, id) => {
    const i = list.findIndex((x) => x[field] === id);
    if (del) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = value; else list.push(value);
  };
  switch (kind) {
    case 'profile': if (!del) state.profile = { ...state.profile, ...value }; break;
    case 'plans': if (!del && Array.isArray(value) && value.length) state.plans = value; break; // alte App-Versionen
    case 'plan': {
      if (del && state.plans.length <= 1) break; // nie ganz ohne Trainings
      upsertBy(state.plans, 'id', a);
      received.plans.add(a);
      break;
    }
    case 'planorder': if (!del && Array.isArray(value)) { pending.planOrder = value; sortBy(state.plans, value); } break;
    case 'active': state.active = del ? null : value; break;
    case 'entry': {
      const list = (state.diary[a] ||= []);
      upsertBy(list, 'id', b);
      if (!list.length) delete state.diary[a];
      break;
    }
    case 'food': upsertBy(state.foods, 'id', a); break;
    case 'recipe': upsertBy((state.recipes ||= []), 'id', a); break;
    case 'off': if (del) delete state.offCache[a]; else state.offCache[a] = value; break;
    case 'weight': upsertBy(state.weights, 'date', a); break;
    case 'measure': upsertBy(state.measures, 'date', a); break;
    case 'workout': upsertBy(state.workouts, 'id', a); break;
    case 'cardio': upsertBy(state.cardio, 'id', a); break;
    case 'choice': if (del) delete state.dayChoice[a]; else state.dayChoice[a] = value; break;
    case 'training': if (!del && value?.splits?.length) state.training = value; break; // alte App-Versionen
    case 'split': {
      const tr = trainingOf(state);
      if (del && tr.splits.length <= 1) break;
      upsertBy(tr.splits, 'id', a);
      received.splits.add(a);
      break;
    }
    case 'tmeta': {
      if (del) break;
      const tr = trainingOf(state);
      const { splitOrder, ...rest } = value;
      Object.assign(tr, rest);
      if (Array.isArray(splitOrder)) { pending.splitOrder = splitOrder; sortBy(tr.splits, splitOrder); }
      break;
    }
    case 'shift': {
      const tr = trainingOf(state);
      const set = new Set(tr.shifts || []);
      if (del) set.delete(a); else set.add(a);
      tr.shifts = [...set].sort();
      break;
    }
    case 'restart': {
      const tr = trainingOf(state);
      tr.restarts = (tr.restarts || []).filter((r) => r.date !== a);
      if (!del) tr.restarts.push({ ...value, date: a });
      tr.restarts.sort((x, y) => x.date.localeCompare(y.date));
      break;
    }
    case 'wcardio': upsertBy((trainingOf(state).weeklyCardio ||= []), 'id', a); break;
    case 'pcardio': state.plannedCardio ||= {}; if (del) delete state.plannedCardio[a]; else state.plannedCardio[a] = value; break;
    case 'sick': state.sickDays ||= {}; if (del) delete state.sickDays[a]; else state.sickDays[a] = value; break;
    case 'hday': state.healthDays ||= {}; if (del) delete state.healthDays[a]; else state.healthDays[a] = value; break;
    case 'hw': state.healthWorkouts ||= {}; if (del) delete state.healthWorkouts[a]; else state.healthWorkouts[a] = value; break;
    case 'sleep': state.healthSleep ||= {}; if (del) delete state.healthSleep[a]; else state.healthSleep[a] = value; break;
    case 'hinbox': state.healthInbox ||= {}; if (del) delete state.healthInbox[a]; else state.healthInbox[a] = value; break;
    case 'hmeta': if (!del) { state.healthLastImport = value.lastImport; if (value.weightNew) state.healthWeightNew = value.weightNew; else delete state.healthWeightNew; } break;
    default: console.warn('Unbekanntes Dokument', key);
  }
}

// Reihenfolge (planorder/tmeta) kann vor oder nach den einzelnen Plänen/Splits ankommen → nach dem Übernehmen nochmals sortieren
let pending = {};
let received = { plans: new Set(), splits: new Set() };
const trainingOf = (state) => (state.training ||= { splits: [], activeSplit: null, anchor: { date: new Date().toISOString().slice(0, 10), index: 0 }, shifts: [], weeklyCardio: [], restarts: [] });
function sortBy(list, order) {
  const pos = new Map(order.map((id, i) => [id, i]));
  list.sort((x, y) => (pos.get(x.id) ?? 1e9) - (pos.get(y.id) ?? 1e9));
}

/**
 * Nach einer Reihe von applyDoc: Reihenfolge herstellen. Beim ersten Abgleich eines Geräts (`initial`) fallen lokale
 * Standard-Trainings/-Splits weg, die es im Konto nicht (mehr) gibt – sonst kämen gelöschte Standard-Trainings zurück.
 */
export function finishDocs(state, { initial = false } = {}) {
  if (pending.planOrder) {
    if (initial) {
      const keep = new Set([...pending.planOrder, ...received.plans]);
      const left = state.plans.filter((p) => keep.has(p.id));
      if (left.length) state.plans = left;
    }
    sortBy(state.plans, pending.planOrder);
  }
  if (pending.splitOrder && state.training) {
    if (initial) {
      const keep = new Set([...pending.splitOrder, ...received.splits]);
      const left = state.training.splits.filter((x) => keep.has(x.id));
      if (left.length) state.training.splits = left;
    }
    sortBy(state.training.splits, pending.splitOrder);
  }
  pending = {};
  received = { plans: new Set(), splits: new Set() };
}

// 'entry:2026-11-22:abc' → ['entry', '2026-11-22', 'abc']; IDs selbst enthalten keine Doppelpunkte
// ausser bei OFF-Produkten ('off:off-761…') – dort ist alles nach dem ersten ':' die ID.
function splitKey(key) {
  const i = key.indexOf(':');
  if (i < 0) return [key];
  const kind = key.slice(0, i);
  const rest = key.slice(i + 1);
  if (kind === 'entry') {
    const j = rest.indexOf(':');
    return [kind, rest.slice(0, j), rest.slice(j + 1)];
  }
  return [kind, rest];
}

/** Kurzer Fingerabdruck eines Werts (FNV-1a), um Änderungen zu erkennen. */
export function fingerprint(value) {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** JSON mit sortierten Schlüsseln (die Datenbank sortiert Schlüssel um – der Fingerabdruck soll gleich bleiben). */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
