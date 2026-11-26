// Health Connect (Android) – Gegenstück zum iPhone-Kurzbefehl.
//
// Eine Web-App kann Health Connect nicht direkt lesen. Darum braucht es eine kleine Android-App (siehe android/README.md),
// die diese Seite in einer WebView zeigt und eine Brücke "GymHC" bereitstellt (WebViewCompat.addWebMessageListener,
// nur für die eigene Adresse freigegeben). Ohne diese App (normaler Browser, iPhone) ist available() false.
//
// Nachrichten (JSON als Text):
//   Web → App:  { id, method, params }
//   App → Web:  { id, ok: true, result } | { id, ok: false, error }
// Methoden:
//   status()                 → { available: bool, granted: [Rechte], needsUpdate?: bool }
//   requestPermissions()     → { granted: [Rechte] }
//   read({ from, to })       → siehe fromHealthConnect() (Zeiten als ISO-Text)
//   writeNutrition({ upsert: [Datensätze], remove: [ids] }) → { written, removed }
//   openSettings()           → öffnet die Health-Connect-Einstellungen
//   saveFile({ name, text }) → Android-Dialog „Speichern unter“ (ab App 1.4) → { saved }
import { dayKey, round, addDays, today } from './util.js';
import { MEALS, sumEntries, dayEntries } from './nutrition.js';
import { workoutKind, applyHealth } from './health.js';
import * as store from './store.js';

const bridge = () => window.GymHC || null;
export const available = () => !!bridge();
/** Android-Gerät, aber nicht in der App (normaler Browser) */
export const isAndroidBrowser = () => !bridge() && /Android/i.test(navigator.userAgent);

// ---------- Brücke ----------
let seq = 0;
const pending = new Map();
let listening = false;

function listen() {
  if (listening || !bridge()) return;
  listening = true;
  bridge().onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error || 'health connect'));
  };
}

export function call(method, params = {}, timeoutMs = 60000) {
  if (!bridge()) return Promise.reject(new Error('no bridge'));
  listen();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    bridge().postMessage(JSON.stringify({ id, method, params }));
  });
}

// ---------- Lesen ----------
// Schlafphasen in Health Connect: awake, sleeping, out_of_bed, light, deep, rem, awake_in_bed, unknown
const STAGE = { light: 'core', deep: 'deep', rem: 'rem', awake: 'awake', awake_in_bed: 'awake', out_of_bed: 'awake', sleeping: 'asleep', unknown: 'asleep' };
const minuteKey = (d) => `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const date = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Antwort von read() in dasselbe Format wie parseHealth() (iPhone) umwandeln, damit applyHealth() beides übernimmt.
 * {
 *   days:     [{ date: 'yyyy-MM-dd', steps, activeKcal, distanceKm }],   // Tagessummen – Health Connect rechnet Doppelte (Handy + Uhr) heraus
 *   weights:  [{ time, kg }],
 *   bodyFat:  [{ time, percent }],
 *   exercise: [{ start, end, type, title, kcal, km, avgHr }],           // type = Health-Connect-Name, z. B. "strength_training"
 *   sleep:    [{ start, end, stages: [{ start, end, stage }] }],
 * }
 */
export function fromHealthConnect(d = {}, { workoutsFrom = null } = {}) {
  // workoutsFrom: ab diesem Tag sind alle Workouts geliefert → in Health Connect gelöschte fallen auch in der App weg
  const out = { weights: {}, bodyFat: {}, steps: {}, active: {}, exercise: {}, distance: {}, workouts: {}, sleepSamples: [], unknown: 0, hasExercise: false, exerciseBad: false, workoutsFrom };
  const latest = (map, time, v) => {
    const at = date(time);
    if (!at || !finite(v)) { out.unknown++; return; }
    const k = dayKey(at);
    if (!map[k] || at >= map[k].at) map[k] = { at, v: round(v, 1) };
  };
  for (const w of d.weights || []) latest(out.weights, w.time, w.kg);
  for (const f of d.bodyFat || []) latest(out.bodyFat, f.time, f.percent);

  for (const x of d.days || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) { out.unknown++; continue; }
    if (finite(x.steps)) out.steps[x.date] = Math.round(x.steps);
    if (finite(x.activeKcal)) out.active[x.date] = Math.round(x.activeKcal);
    if (finite(x.distanceKm)) out.distance[x.date] = round(x.distanceKm, 2);
  }

  // Trainings: Android liefert echte Einheiten (anders als der iPhone-Kurzbefehl) → auch Trainingsminuten pro Tag daraus
  const minutesPerDay = {};
  for (const x of d.exercise || []) {
    const s = date(x.start); const e = date(x.end);
    if (!s || !e || e <= s || e - s > 24 * 3600000) { out.unknown++; continue; }
    let id = minuteKey(s);
    if (out.workouts[id]) id += ':' + String(s.getSeconds()).padStart(2, '0'); // zwei Workouts in derselben Minute
    const minutes = Math.round((e - s) / 60000);
    const type = String(x.type || '').replace(/_/g, ' ');
    out.workouts[id] = {
      id, date: dayKey(s), start: id, minutes, name: x.title || type, kind: workoutKind(type + ' ' + (x.title || '')),
      kcal: finite(x.kcal) && x.kcal > 0 ? Math.round(x.kcal) : null, km: finite(x.km) && x.km > 0 ? round(x.km, 2) : null,
      avgHr: finite(x.avgHr) && x.avgHr > 0 ? Math.round(x.avgHr) : null, source: 'hc',
    };
    minutesPerDay[dayKey(s)] = (minutesPerDay[dayKey(s)] || 0) + minutes;
  }
  if ((d.days || []).length || (d.exercise || []).length) {
    out.hasExercise = true;
    for (const k of new Set([...Object.keys(out.steps), ...Object.keys(minutesPerDay)])) out.exercise[k] = Math.min(1440, minutesPerDay[k] || 0);
  }

  for (const x of d.sleep || []) {
    const s = date(x.start); const e = date(x.end);
    if (!s || !e || e <= s || e - s > 16 * 3600000) { out.unknown++; continue; }
    const stages = (x.stages || []).map((st) => ({ s: date(st.start), e: date(st.end), stage: STAGE[st.stage] || 'asleep' })).filter((st) => st.s && st.e && st.e > st.s);
    if (stages.length) out.sleepSamples.push(...stages);
    else out.sleepSamples.push({ s, e, stage: 'asleep' }); // Uhr/App ohne Phasen
  }
  return out;
}

// ---------- Nährwerte nach Health Connect ----------
// Pro Tag und Mahlzeit ein Datensatz mit fester ID (clientRecordId) → bei Änderungen wird er ersetzt, nicht verdoppelt.
const MEAL_TIME = { breakfast: '08:00', lunch: '12:30', snacks: '15:30', dinner: '19:00' };
const MEAL_HC = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snack' };

export function nutritionRecords(state, from, to) {
  const upsert = []; const empty = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const entries = dayEntries(state, k);
    for (const m of MEALS) {
      const id = `gmt-${k}-${m}`;
      const list = entries.filter((e) => e.meal === m);
      if (!list.length) { empty.push(id); continue; }
      const n = sumEntries(list);
      const [h, min] = MEAL_TIME[m].split(':').map(Number);
      const [y, mo, da] = k.split('-').map(Number);
      // Health Connect lehnt Zeitpunkte in der Zukunft ab (z. B. Abendessen schon am Mittag eingetragen) → auf "jetzt" vorziehen
      const latest = Date.now() - 16 * 60000;
      const start = new Date(Math.min(new Date(y, mo - 1, da, h, min).getTime(), latest));
      upsert.push({
        id, date: k, mealType: MEAL_HC[m], name: list.map((e) => e.name).join(' · ').slice(0, 200),
        start: start.toISOString(), end: new Date(start.getTime() + 15 * 60000).toISOString(),
        kcal: round(n.kcal, 0), proteinG: round(n.p, 1), carbsG: round(n.c, 1), fatG: round(n.f, 1),
        fiberG: round(n.fiber, 1), sugarG: round(n.sugar, 1), sodiumG: round(n.salt / 2.5, 3), // Salz → Natrium
        // Gesättigte/ungesättigte Fette nur, wenn sie für alle Einträge der Mahlzeit bekannt sind (sonst wären sie zu tief)
        ...(n.sfaN === n.count ? { saturatedFatG: round(n.sfa, 1), unsaturatedFatG: round(Math.max(0, n.f - n.sfa), 1) } : {}),
      });
    }
  }
  return { upsert, empty };
}

const SENT_KEY = 'gmt-hc-sent'; // pro Gerät: was zuletzt an Health Connect geschickt wurde { id: Fingerabdruck }
const loadSent = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY)) || {}; } catch { return {}; } };
const saveSent = (m) => { try { localStorage.setItem(SENT_KEY, JSON.stringify(m)); } catch { /* egal */ } };
const fp = (r) => JSON.stringify([r.kcal, r.proteinG, r.carbsG, r.fatG, r.fiberG, r.sugarG, r.sodiumG, r.saturatedFatG ?? null, r.unsaturatedFatG ?? null, r.name]);

/** Nur Geänderte schicken; gelöschte Mahlzeiten (früher geschickt, jetzt leer) entfernen. */
export function nutritionChanges(state, from, to, sent = loadSent()) {
  const { upsert, empty } = nutritionRecords(state, from, to);
  return {
    upsert: upsert.filter((r) => sent[r.id] !== fp(r)),
    remove: empty.filter((id) => id in sent),
  };
}

// ---------- Abgleich ----------
let running = null;
let granted = null; // zuletzt bekannte Rechte (aus status)
export function sendsNutrition(state) { return state.profile.hcNutrition !== false; } // Standard: an

/** Geänderte Mahlzeiten der letzten 7 Tage schreiben. Gibt die Anzahl geschriebener Mahlzeiten zurück. */
async function pushNutrition() {
  if (!sendsNutrition(store.get()) || !granted?.includes('write_nutrition')) return 0;
  const sent = loadSent();
  const ch = nutritionChanges(store.get(), addDays(today(), -6), today(), sent);
  if (!ch.upsert.length && !ch.remove.length) return 0;
  await call('writeNutrition', ch);
  for (const r of ch.upsert) sent[r.id] = fp(r);
  for (const id of ch.remove) delete sent[id];
  saveSent(sent);
  return ch.upsert.length;
}

/** Daten lesen und übernehmen, danach Mahlzeiten der letzten 7 Tage schreiben. */
export function syncNow() {
  if (!available()) return Promise.resolve(null);
  if (running) return running;
  running = (async () => {
    const st = await call('status');
    granted = st?.available ? (st.granted || []) : [];
    if (!granted.length) return { skipped: true };
    const last = store.get().healthConnect?.lastRead;
    const from = last ? addDays(last.slice(0, 10), -2) : addDays(today(), -30); // ohne Zusatzrecht liefert Health Connect max. 30 Tage
    const res = await call('read', { from: new Date(from + 'T00:00:00').toISOString(), to: new Date().toISOString() });
    store.update((s) => {
      applyHealth(s, fromHealthConnect(res, { workoutsFrom: granted.includes('read_exercise') && Array.isArray(res?.exercise) ? from : null }));
      s.healthConnect = { ...(s.healthConnect || {}), lastRead: new Date().toISOString() };
    });
    return { written: await pushNutrition() };
  })().finally(() => { running = null; });
  return running;
}

// Automatisch lesen: beim Start und beim Zurückkehren in die App (höchstens alle 15 Minuten)
let lastAuto = 0;
function auto() {
  if (!available() || Date.now() - lastAuto < 15 * 60000) return;
  lastAuto = Date.now();
  syncNow().catch((e) => console.warn('Health Connect', e));
}
setTimeout(auto, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto(); });

// Mahlzeit eingetragen/geändert → wenige Sekunden später nach Health Connect (ohne neu zu lesen)
let pushTimer = null;
store.onSave(() => {
  if (!available() || !granted) return; // Rechte noch unbekannt → erledigt der nächste Abgleich
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (running) { pushTimer = null; running.then(() => pushNutrition()).catch(() => {}); return; }
    pushNutrition().catch((e) => console.warn('Health Connect: Mahlzeiten senden', e));
  }, 4000);
});
