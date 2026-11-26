// Cardio: gemachte Einheiten aus zwei Quellen zusammenführen und mit dem Plan abgleichen.
//
// Quellen: von Hand eingetragen (state.cardio) und von der Uhr (Apple Health / Health Connect, state.healthWorkouts).
// Dieselbe Einheit zählt nur einmal: gleicher Tag + gleiche Art (z. B. beide „Velo“) → angezeigt werden die Uhr-Werte
// (genaue Zeit, km, kcal, Puls), der Hand-Eintrag hängt als `manual` daran. Hand-Eintrag „Anderes“ gehört zu einem
// übrigen Uhr-Workout am gleichen Tag. Verschiedene Arten bleiben getrennt. Krafttrainings der Uhr sind kein Cardio.
//
// Plan: Geplantes Cardio (Split, feste Wochentage, einzelner Tag) gilt als erfüllt, sobald an dem Tag eine gemachte
// Einheit derselben Art da ist (geplant „Anderes“ → irgendeine). Android: kommt automatisch von der Uhr.
// iPhone: Kurzbefehle können keine einzelnen Workouts lesen → „✓ Erledigt“ trägt die Einheit von Hand ein.
import { healthWorkoutsBetween } from './health.js';
import { dayPlan } from './plan.js';

/** Android (App-Hülle oder Android-Browser): Uhr-Workouts kommen automatisch über Health Connect. */
export function isAndroid() { return !!window.GymHC || /Android/i.test(navigator.userAgent); }

/**
 * Gemachte Cardio-Einheiten zwischen zwei Tagen, ohne Doppelte, nach Zeit sortiert.
 * Einträge: { source: 'watch' | 'manual', id, date, type, minutes, km?, kcal?, avgHr?, start?, manual? }
 */
export function cardioSessions(state, from, to) {
  const watch = healthWorkoutsBetween(state, from, to)
    .filter((w) => w.kind !== 'strength')
    .map((w) => ({ ...w, source: 'watch', type: w.kind, manual: null }));
  const manual = (state.cardio || []).filter((c) => c.date >= from && c.date <= to);
  const rest = [];
  for (const c of manual) {
    const m = watch.find((w) => !w.manual && w.date === c.date && w.type === c.type);
    if (m) m.manual = c; else rest.push(c);
  }
  const out = [...watch];
  for (const c of rest) {
    const m = c.type === 'other' ? watch.find((w) => !w.manual && w.date === c.date) : null;
    if (m) m.manual = c; else out.push({ ...c, source: 'manual' });
  }
  return out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

/** Minuten aller Einheiten (jede nur einmal). */
export function cardioMinutes(sessions) {
  return sessions.reduce((s, c) => s + (c.minutes || 0), 0);
}

/**
 * Cardio eines Tages: geplante Einheiten mit Status ({ ...geplant, done: gemachte Einheit | null })
 * und gemachte Einheiten ohne Plan (extra).
 */
export function cardioDay(state, date) {
  const sessions = cardioSessions(state, date, date);
  const free = [...sessions];
  const planned = state.training ? dayPlan(state, date).cardio : [];
  const done = planned.map(() => null);
  const take = (pred) => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : null; };
  // Erst gleiche Art, dann „Anderes“ geplant = beliebige Einheit, zuletzt eine „Anderes“-Einheit für eine bestimmte Art (K11)
  planned.forEach((p, k) => { if (p.type !== 'other') done[k] = take((s) => s.type === p.type); });
  planned.forEach((p, k) => { if (!done[k] && p.type === 'other') done[k] = take(() => true); });
  planned.forEach((p, k) => { if (!done[k]) done[k] = take((s) => s.type === 'other'); });
  const items = planned.map((p, k) => ({ ...p, done: done[k] }));
  return { items, extra: free, sessions };
}

// ---- Cardio-Eingabe prüfen (Prüfbericht A2/A3: negative Minuten und Tage in der Zukunft wurden gespeichert) ----
export const MAX_CARDIO_MIN = 600;
/** → Text-Schlüssel des Fehlers oder null. `todayKey` = heutiges Datum (JJJJ-MM-TT). */
export function cardioError({ minutes, km, date }, todayKey) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_CARDIO_MIN) return 'cardio.errMinutes';
  if (km != null && (!Number.isFinite(km) || km < 0 || km > 300)) return 'cardio.errKm';
  if (date && date > todayKey) return 'cardio.errFuture';
  return null;
}
