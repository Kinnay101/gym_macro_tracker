// Vorschau-Werkzeug – nur auf localhost (lokale Vorschau, Debug-App im Emulator), online nie geladen (siehe app.js).
// Knopf „Demo“ unten rechts: Demo-Daten laden, zwischen angemeldet/abgemeldet wechseln, eigene Daten zurückholen.
// Angemeldet heisst hier: nachgebauter Supabase-Client (nichts geht an den echten Server, kein echtes Konto).
// Eigene Daten werden vor dem ersten Laden gesichert (localStorage 'gmt-demo-backup') und mit „Eigene Daten zurück“
// wiederhergestellt. Texte nur deutsch: Entwickler-Werkzeug, kein Teil der App.
import { today, addDays, uid, weekStart } from './util.js';
import { forGrams } from './nutrition.js';
import { defaultSplits, dayPlan } from './plan.js';
import { computeStats } from './social.js';

const MODE = 'gmt-demo'; // 'in' | 'out' – Demo aktiv (angemeldet bzw. abgemeldet)
const BACKUP = 'gmt-demo-backup';
const DATA = 'gmt-data-v1';
const META = 'gmt-sync-v1';
const DEMO_USER = { id: 'demo-user', email: 'demo@beispiel.ch' };

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* egal */ } };

let deps = null;

/** Von app.js aufgerufen (nur localhost): Demo-Modus starten oder normalen Sync, dann den Knopf einblenden. */
export async function init(d) {
  deps = d;
  const mode = get(MODE);
  if (mode) await deps.sync._useClient(fakeClient(mode === 'in'));
  else await deps.sync.init();
  panel();
}

// ---------- Nachgebauter Supabase-Client ----------
function fakeClient(loggedIn) {
  const db = demoServer();
  const reloadAs = (m) => { set(MODE, m); setTimeout(() => location.reload(), 80); };
  const auth = {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getSession: async () => ({ data: { session: loggedIn ? { user: DEMO_USER } : null }, error: null }),
    getUser: async () => ({ data: { user: loggedIn ? DEMO_USER : null }, error: null }),
    // Anmelden/Registrieren mit beliebigen Angaben → Demo-Konto
    signInWithPassword: async () => { set(META, JSON.stringify({ userId: DEMO_USER.id, cursor: null, synced: {}, initialDone: true })); reloadAs('in'); return { data: { user: DEMO_USER, session: { user: DEMO_USER } }, error: null }; },
    signUp: async () => { set(META, JSON.stringify({ userId: DEMO_USER.id, cursor: null, synced: {}, initialDone: true })); reloadAs('in'); return { data: { user: DEMO_USER, session: { user: DEMO_USER } }, error: null }; },
    signOut: async () => { reloadAs('out'); return { error: null }; },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: { user: DEMO_USER }, error: null }),
  };
  return { auth, from: (table) => query(db, table), rpc: async (name, args) => rpc(db, name, args) };
}

/** Sehr einfacher Abfrage-Nachbau: merkt sich Tabelle, Art und Filter, antwortet aus den Demo-Daten. */
function query(db, table) {
  const st = { op: 'select', filters: [], payload: null, single: false };
  const q = new Proxy({}, {
    get(_, k) {
      if (k === 'then') return (res, rej) => Promise.resolve(run(db, table, st)).then(res, rej);
      if (k === 'insert' || k === 'upsert' || k === 'update') return (p) => { st.op = k; st.payload = p; return q; };
      if (k === 'delete') return () => { st.op = 'delete'; return q; };
      if (k === 'eq') return (f, v) => { st.filters.push((r) => r[f] === v); return q; };
      if (k === 'in') return (f, vs) => { st.filters.push((r) => vs.includes(r[f])); return q; };
      if (k === 'single' || k === 'maybeSingle') return () => { st.single = true; return q; };
      return () => q; // select, order, range, limit, gt …
    },
  });
  return q;
}

function run(db, table, st) {
  const rows = db[table] || (db[table] = []);
  const ok = (data) => ({ data: st.single ? (Array.isArray(data) ? data[0] ?? null : data) : data, error: null, count: Array.isArray(data) ? data.length : 0 });
  if (st.op === 'select') return ok(rows.filter((r) => st.filters.every((f) => f(r))));
  if (st.op === 'delete') { db[table] = rows.filter((r) => !st.filters.every((f) => f(r))); return ok([]); }
  const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ ...p }));
  if (table === 'docs') return ok([]); // Sync-Dokumente nicht aufbewahren
  if (st.op === 'update') { const hit = rows.filter((r) => st.filters.every((f) => f(r))); hit.forEach((r) => Object.assign(r, st.payload, { updated_at: new Date().toISOString() })); return ok(hit); }
  for (const p of list) {
    if (table === 'feedback' && st.op === 'insert') Object.assign(p, { id: uid(), status: 'new', reply: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const key = table === 'shared_stats' ? 'user_id' : 'id';
    const i = rows.findIndex((r) => r[key] === p[key]);
    if (i >= 0 && st.op === 'upsert') rows[i] = { ...rows[i], ...p }; else rows.push(p);
  }
  return ok(list);
}

function rpc(db, name, args) {
  if (name === 'is_app_admin') return { data: false, error: null };
  if (name === 'create_group' || name === 'join_group') {
    const g = { id: uid(), name: args.group_name || 'Neue Gruppe', invite_code: Math.random().toString(36).slice(2, 8).toUpperCase(), created_at: new Date().toISOString() };
    db.groups.push(g);
    db.group_members.push({ group_id: g.id, user_id: DEMO_USER.id, display_name: args.member_name || 'Demo', joined_at: g.created_at });
    return { data: g, error: null };
  }
  if (name === 'leave_group') { db.group_members = db.group_members.filter((m) => !(m.group_id === args.gid && m.user_id === DEMO_USER.id)); return { data: null, error: null }; }
  if (name === 'rename_group') { const g = db.groups.find((x) => x.id === args.gid); if (g) g.name = args.group_name; return { data: g, error: null }; }
  if (name === 'create_health_token') return { data: 'demo-token-nur-vorschau', error: null };
  return { data: null, error: null };
}

/** „Server“-Inhalt für angemeldet: Gruppe mit drei Freunden (Werte aus abgewandelten Demo-Daten), Feedback, Rezepte. */
function demoServer() {
  const state = JSON.parse(get(DATA) || '{}');
  const now = new Date().toISOString();
  const friends = [
    { id: 'f-janis', name: 'Janis', kg: 1.08, keep: 0.95, weight: 0 },
    { id: 'f-lea', name: 'Lea', kg: 0.62, keep: 0.8, weight: -18 },
    { id: 'f-marco', name: 'Marco', kg: 0.9, keep: 0.6, weight: 6 },
  ];
  const stats = friends.map((f) => {
    const s = structuredClone(state);
    s.workouts = (s.workouts || []).filter((w, i) => (i * 37) % 100 < f.keep * 100);
    for (const w of s.workouts) for (const ex of w.exercises) for (const x of ex.sets) x.kg = Math.round((x.kg * f.kg) / 2.5) * 2.5;
    s.weights = (s.weights || []).map((w) => ({ ...w, kg: w.kg + f.weight }));
    s.profile = { ...(s.profile || {}), share: { strength: true, consistency: true, volume: true, prs: true } };
    return { user_id: f.id, display_name: f.name, stats: s.workouts ? computeStats(s) : {}, updated_at: now };
  });
  return {
    groups: [{ id: 'g-demo', name: 'Gym Crew', invite_code: 'DEMO42', created_at: now }],
    group_members: [{ group_id: 'g-demo', user_id: DEMO_USER.id, display_name: state.profile?.displayName || 'Demo', joined_at: now },
      ...friends.map((f) => ({ group_id: 'g-demo', user_id: f.id, display_name: f.name, joined_at: now }))],
    shared_stats: stats,
    feedback: [
      { id: 'fb1', user_id: DEMO_USER.id, author_name: 'Demo', kind: 'idea', body: 'Mahlzeit von gestern kopieren wäre praktisch.', app_version: '100', status: 'planned', reply: 'Gute Idee, kommt auf die Liste.', created_at: now, updated_at: now },
      { id: 'fb2', user_id: DEMO_USER.id, author_name: 'Demo', kind: 'bug', body: 'Der Umschalter springt beim Wechseln.', app_version: '96', status: 'done', reply: 'Behoben in Version 98.', created_at: now, updated_at: now },
    ],
    public_recipes: [
      { id: 'pr-1', user_id: 'f-lea', author_name: 'Lea', name: 'Protein-Pancakes', updated_at: now,
        data: { servings: 2, cookedWeight: null, instructions: 'Alles mixen, in der Pfanne ausbacken.', items: [], per100: { kcal: 180, p: 16, c: 18, f: 4, fiber: 2, sugar: 6, salt: 0.3, sfa: 1.2 }, perPortion: { kcal: 360, p: 32, c: 36, f: 8, fiber: 4, sugar: 12, salt: 0.6, sfa: 2.4 }, portionGrams: 200, totalWeight: 400 } },
      { id: 'pr-2', user_id: 'f-janis', author_name: 'Janis', name: 'Chili con Carne', updated_at: now,
        data: { servings: 4, cookedWeight: 1600, instructions: 'Hackfleisch anbraten, Rest dazu, 30 Min. köcheln.', items: [], per100: { kcal: 120, p: 10, c: 9, f: 4.5, fiber: 3, sugar: 3, salt: 0.6, sfa: 1.8 }, perPortion: { kcal: 480, p: 40, c: 36, f: 18, fiber: 12, sugar: 12, salt: 2.4, sfa: 7.2 }, portionGrams: 400, totalWeight: 1600 } },
    ],
    health_tokens: [],
    docs: [],
  };
}

// ---------- Demo-Daten ----------
/** Kleiner Zufallsgenerator mit festem Startwert → jedes Mal dieselben Demo-Daten. */
function rng(seed = 7) {
  let x = seed;
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}

async function buildDemo(current) {
  const r = rng(42);
  const T = today();
  const D = (n) => addDays(T, n);
  const blv = await fetch('data/blv.json').then((res) => res.json());
  const food = (name) => {
    const row = blv.rows.find((x) => x[1] === name) || blv.rows.find((x) => x[1].startsWith(name));
    return row ? { id: 'blv-' + row[0], name: row[1], per100: { kcal: row[5], p: row[6] ?? 0, c: row[7] ?? 0, f: row[8] ?? 0, fiber: row[9] ?? 0, sugar: row[10] ?? 0, salt: row[11] ?? 0, sfa: row[12] ?? null } } : null;
  };
  const F = {
    hafer: food('Haferflocken'), milch: food('Vollmilch, UHT'), banane: food('Banane, roh'), apfel: food('Apfel, roh'), quark: food('Quark, nature, mager'),
    poulet: food('Poulet, Brust, ohne Haut, roh'), reis: food('Reis poliert, gekocht in Salzwasser (unjodiert)'), broc: food('Broccoli, gedämpft (ohne Zugabe von Salz)'),
    lachs: food('Lachs, Zucht, roh'), brot: food('Brot (Durchschnitt)'), ei: food('Ei, Huhn, ganz, roh'), kartoffel: food('Kartoffel, geschält, gekocht'),
    teigwaren: food('Teigwaren, gekocht'), rind: food('Rind, Hackfleisch'), kaese: food('Emmentaler'), joghurt: food('Joghurt, nature'), nuesse: food('Baumnuss'),
  };
  for (const k of Object.keys(F)) if (!F[k]) delete F[k];
  const own = [
    { id: 'own-bar', name: 'Proteinriegel Schoko', brand: 'Demo', barcode: null, portion: 55, per100: { kcal: 360, p: 36, c: 30, f: 11, fiber: 8, sugar: 3, salt: 0.5, sfa: 5 } },
    { id: 'own-whey', name: 'Whey Vanille', brand: 'Demo', barcode: null, portion: 30, per100: { kcal: 380, p: 78, c: 7, f: 5, fiber: 0, sugar: 5, salt: 0.4, sfa: 3 } },
  ];
  const entry = (meal, f, g) => f && { id: uid(), meal, foodId: f.id, name: f.name, grams: g, per100: f.per100, n: forGrams(f.per100, g) };
  const vary = (g) => Math.round((g * (0.85 + r() * 0.3)) / 5) * 5;
  const breakfast = [() => [entry('breakfast', F.hafer, vary(80)), entry('breakfast', F.milch, vary(250)), entry('breakfast', F.banane, vary(120))],
    () => [entry('breakfast', F.brot, vary(90)), entry('breakfast', F.ei, vary(120)), entry('breakfast', F.kaese, vary(30))],
    () => [entry('breakfast', F.quark, vary(250)), entry('breakfast', F.apfel, vary(150)), entry('breakfast', F.nuesse, vary(20))]];
  const lunch = [() => [entry('lunch', F.poulet, vary(180)), entry('lunch', F.reis, vary(250)), entry('lunch', F.broc, vary(150))],
    () => [entry('lunch', F.rind, vary(150)), entry('lunch', F.teigwaren, vary(280))],
    () => [entry('lunch', F.lachs, vary(150)), entry('lunch', F.kartoffel, vary(300)), entry('lunch', F.broc, vary(120))]];
  const dinner = [() => [entry('dinner', F.lachs, vary(140)), entry('dinner', F.reis, vary(200))],
    () => [entry('dinner', F.poulet, vary(160)), entry('dinner', F.kartoffel, vary(250))],
    () => [entry('dinner', F.brot, vary(120)), entry('dinner', F.kaese, vary(60)), entry('dinner', F.apfel, vary(150))]];
  const snacks = () => [entry('snacks', { id: own[0].id, name: own[0].name, per100: own[0].per100 }, 55), r() < 0.6 && entry('snacks', { id: own[1].id, name: own[1].name, per100: own[1].per100 }, 30), r() < 0.5 && entry('snacks', F.joghurt, vary(180))];
  const pick = (list) => list[Math.floor(r() * list.length)]();

  const diary = {};
  for (let n = -45; n <= 0; n++) {
    if (n < -1 && r() < 0.1) continue; // ein paar Tage nicht eingetragen
    const day = [...pick(breakfast), ...pick(lunch)];
    if (n < 0) day.push(...pick(dinner), ...snacks());
    diary[D(n)] = day.filter(Boolean);
  }

  // Training: 12 Wochen „Volle Woche“, Gewichte steigen langsam, ein paar verpasste Tage, Krank-Tage, Ruhetag mit Verschiebung
  const plans = current.plans;
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  const BASE = { chest: 28, back: 50, shoulders: 9, triceps: 22, biceps: 12, forearms: 14, legs: 70, core: 18 };
  const training = { splits: defaultSplits(), activeSplit: 'full', anchor: { date: D(-84), index: 0 }, shifts: [D(-23)], weeklyCardio: [{ id: uid(), weekday: 5, type: 'run', minutes: 30 }], restarts: [] };
  const sickDays = { [D(-40)]: 'shift', [D(-39)]: 'shift' };
  const st = { ...current, training, sickDays, dayChoice: {}, workouts: [], plannedCardio: {} };
  const round25 = (x) => Math.max(2.5, Math.round(x / 2.5) * 2.5);
  for (let n = -84; n <= -1; n++) {
    const d = D(n);
    const p = dayPlan(st, d);
    if (p.kind !== 'train' || p.sick || p.shifted) continue;
    if (r() < 0.08) continue; // verpasst
    const plan = byId[p.planId];
    if (!plan) continue;
    const prog = 1 + ((n + 84) / 84) * 0.18;
    const id = 'demo-w-' + d;
    if (n === -9) { st.workouts.push({ id, planId: plan.id, date: d, startedAt: null, finishedAt: null, note: '', exercises: [], quick: true }); continue; }
    if (n === -16) { st.workouts.push({ id, planId: plan.id, date: d, startedAt: null, finishedAt: null, minutes: 62, note: '', exercises: [], source: 'watch' }); continue; }
    const exercises = plan.ex.filter((e) => !e.optional || r() < 0.4).map((e, i) => {
      const base = (BASE[e.muscle] || 20) * (1 + (i % 3) * 0.12) * prog;
      const uni = /single|einarmig|one.arm|unilateral/i.test(e.name) || !!e.uni;
      const kg = round25(uni ? base * 0.5 : base);
      const sets = [];
      if (i === 0) sets.push({ kg: round25(kg * 0.5), reps: 12, warmup: true, done: true });
      for (let k = 0; k < 3; k++) {
        const reps = Math.max(5, Math.round(11 - k - r() * 2));
        sets.push(uni ? { kg, reps, repsR: Math.max(5, reps - (r() < 0.4 ? 1 : 0)), warmup: false, done: true } : { kg: k === 2 && r() < 0.3 ? kg - 2.5 : kg, reps, warmup: false, done: true });
      }
      return { name: e.name, muscle: e.muscle, variant: false, ...(uni ? { uni: true } : {}), sets };
    });
    const start = `${d}T${String(16 + Math.floor(r() * 3)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00`;
    const startedAt = new Date(start).toISOString();
    const finishedAt = new Date(new Date(start).getTime() + (55 + Math.floor(r() * 30)) * 60000).toISOString();
    st.workouts.push({ id, planId: plan.id, date: d, startedAt, finishedAt, note: n === -2 ? 'Gute Energie heute, Schulter etwas steif.' : '', exercises });
  }

  // Cardio: Laufen am Samstag (Cardio-Plan), ab und zu Velo nach dem Training
  const cardio = [];
  for (let n = -84; n <= -1; n++) {
    const d = D(n);
    if (new Date(d).getDay() === 6 && r() < 0.8) cardio.push({ id: uid(), date: d, type: 'run', minutes: 28 + Math.floor(r() * 10), km: Math.round((4.5 + r() * 1.5) * 10) / 10, after: false });
    const w = st.workouts.find((x) => x.date === d && x.exercises.length);
    if (w && r() < 0.2) cardio.push({ id: uid(), workoutId: w.id, date: d, type: 'bike', minutes: 15, km: null, after: true });
  }
  const plannedCardio = { [D(2)]: [{ id: uid(), type: 'swim', minutes: 30 }], [D(-1)]: [{ id: uid(), type: 'bike', minutes: 20 }] };

  // Gewicht (Diät: langsam runter, mit Schwankungen), Masse alle 2 Wochen
  const weights = [];
  for (let n = -90; n <= 0; n++) {
    if (r() < 0.35) continue;
    weights.push({ date: D(n), kg: Math.round((81.4 - n * 0.035 + (r() - 0.5) * 0.9) * 10) / 10, ...(n > -20 && r() < 0.5 ? { source: 'health' } : {}) });
  }
  const measures = [];
  for (let n = -84; n <= 0; n += 14) {
    const k = (n + 84) / 84;
    measures.push({ date: D(n), ...(n === -84 ? { status: 'Start of Cut' } : {}), waist: Math.round((86 - k * 3) * 10) / 10, chest: Math.round((104 - k * 0.8) * 10) / 10, shoulders: 121, hips: 98,
      bicepsL: 37, bicepsR: 37.5, bicepsLFlex: 39.5, bicepsRFlex: 40, thighL: 60, thighR: 60.5, calfL: 38, calfR: 38, bf: Math.round((17.5 - k * 2.5) * 10) / 10 });
  }

  // Apple Health / Health Connect: Schritte, aktive kcal, Trainingsminuten, Schlaf (letzte 30 Tage)
  const healthDays = {}; const healthSleep = {}; const healthWorkouts = {};
  for (let n = -30; n <= 0; n++) {
    const d = D(n);
    const trained = st.workouts.some((w) => w.date === d);
    healthDays[d] = { date: d, steps: Math.round(5500 + r() * 7000), activeKcal: Math.round(320 + r() * 380 + (trained ? 200 : 0)), exerciseMin: trained ? 60 + Math.floor(r() * 25) : Math.floor(r() * 20), distanceKm: Math.round((4 + r() * 5) * 10) / 10 };
    if (n > -15) {
      const minutes = Math.round(390 + r() * 100);
      const bedH = 23 + Math.floor(r() * 2) - 1; const bedM = Math.floor(r() * 60);
      healthSleep[d] = { date: d, minutes, deep: Math.round(minutes * (0.13 + r() * 0.07)), rem: Math.round(minutes * (0.18 + r() * 0.06)), core: Math.round(minutes * 0.55), awake: Math.round(10 + r() * 25),
        bed: `${addDays(d, -1)}T${String(bedH).padStart(2, '0')}:${String(bedM).padStart(2, '0')}`, wake: `${d}T0${6 + Math.floor(r() * 2)}:${String(Math.floor(r() * 60)).padStart(2, '0')}` };
    }
  }
  const watch = st.workouts.find((w) => w.source === 'watch');
  if (watch) healthWorkouts[watch.date + 'T07:10'] = { id: watch.date + 'T07:10', date: watch.date, start: watch.date + 'T07:10', minutes: 62, name: 'Krafttraining', kind: 'strength', kcal: 380, km: null, avgHr: 118, source: 'hc', linked: watch.id };
  for (const c of cardio.filter((x) => x.type === 'run').slice(-3)) {
    const id = c.date + 'T09:00';
    healthWorkouts[id] = { id, date: c.date, start: id, minutes: c.minutes + 1, name: 'Laufen', kind: 'run', kcal: Math.round(c.minutes * 11), km: c.km, avgHr: 152, source: 'hc' };
  }

  const recipes = [
    { id: 'r-oats', name: 'Overnight Oats', servings: 2, instructions: 'Am Vorabend mischen, über Nacht in den Kühlschrank.', updatedAt: new Date().toISOString(), public: true,
      items: [[F.hafer, 120], [F.quark, 250], [F.milch, 150], [F.banane, 120]].filter(([f]) => f).map(([f, g]) => ({ id: uid(), foodId: f.id, name: f.name, grams: g, per100: f.per100 })) },
    { id: 'r-bowl', name: 'Poulet-Reis-Bowl', servings: 3, cookedWeight: 1200, instructions: 'Reis kochen, Poulet anbraten, Broccoli dämpfen.', updatedAt: new Date().toISOString(),
      items: [[F.poulet, 450], [F.reis, 600], [F.broc, 400]].filter(([f]) => f).map(([f, g]) => ({ id: uid(), foodId: f.id, name: f.name, grams: g, per100: f.per100 })) },
  ];

  const last = weights[weights.length - 1];
  return {
    ...current,
    profile: { ...current.profile, sex: 'm', birthYear: 1999, heightCm: 181, goal: 'cut', goalAdj: { cut: 400 }, goalOverride: null, goalExtra: {}, displayName: 'Demo', share: { strength: true, consistency: true, volume: true, prs: true } },
    foods: own, recipes, diary, weights, measures, workouts: st.workouts, cardio, training, sickDays, dayChoice: {}, plannedCardio, active: null, editing: null,
    healthDays, healthSleep, healthWorkouts, healthInbox: {}, healthLastImport: new Date().toISOString(),
    healthWeightNew: last?.source === 'health' ? { date: last.date, kg: last.kg, replaced: null, at: new Date().toISOString() } : undefined,
    offCache: current.offCache || {},
  };
}

// ---------- Knopf + Menü ----------
function backupOwn() {
  if (get(BACKUP)) return; // schon gesichert (Demo läuft)
  set(BACKUP, JSON.stringify({ data: get(DATA), meta: get(META), theme: get('gmt-theme') }));
}

async function loadDemo(mode) {
  backupOwn();
  const current = deps.store.get();
  const demo = await buildDemo(structuredClone(current));
  set(DATA, JSON.stringify(demo));
  set(META, JSON.stringify({ userId: DEMO_USER.id, cursor: null, synced: {}, initialDone: true }));
  set(MODE, mode);
  location.reload();
}

function switchMode(mode) {
  if (mode === 'in') set(META, JSON.stringify({ userId: DEMO_USER.id, cursor: null, synced: {}, initialDone: true }));
  set(MODE, mode);
  location.reload();
}

function restoreOwn() {
  const b = JSON.parse(get(BACKUP) || 'null');
  if (b) { set(DATA, b.data); set(META, b.meta); set('gmt-theme', b.theme); }
  set(BACKUP, null);
  set(MODE, null);
  location.reload();
}

function panel() {
  const mode = get(MODE);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = mode ? `Demo · ${mode === 'in' ? 'angemeldet' : 'abgemeldet'}` : 'Demo';
  Object.assign(btn.style, { position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 84px)', right: '10px', zIndex: 9999, font: '600 11px system-ui', padding: '3px 10px',
    borderRadius: '999px', border: '1px dashed var(--accent)', background: mode ? 'var(--accent)' : 'var(--card)', color: mode ? 'var(--on-accent)' : 'var(--accent)', opacity: '.9', cursor: 'pointer' });
  btn.setAttribute('aria-label', 'Vorschau-Werkzeug: Demo-Daten');
  document.body.append(btn);

  const menu = document.createElement('div');
  Object.assign(menu.style, { position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 112px)', right: '10px', zIndex: 9999, width: 'min(300px, calc(100% - 20px))',
    background: 'var(--card)', border: '1px solid var(--line-2)', borderRadius: '14px', padding: '12px', display: 'none', flexDirection: 'column', gap: '8px', boxShadow: '0 10px 30px rgba(0,0,0,.4)' });
  const item = (label, fn, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sm block' + (primary ? ' primary' : '');
    b.textContent = label; b.onclick = () => { b.disabled = true; b.textContent = '…'; fn(); };
    menu.append(b);
  };
  const note = document.createElement('div');
  note.className = 'tiny muted';
  note.textContent = mode
    ? 'Demo-Daten aktiv. Nichts geht an den echten Server. Deine eigenen Daten sind gesichert.'
    : 'Nur in der lokalen Vorschau. Lädt Beispieldaten; deine Daten werden vorher gesichert.';
  menu.append(note);
  if (!mode) {
    item('Demo-Daten laden (angemeldet)', () => loadDemo('in'), true);
    item('Demo-Daten laden (abgemeldet)', () => loadDemo('out'));
  } else {
    item(mode === 'in' ? 'Abgemeldet ansehen' : 'Angemeldet ansehen', () => switchMode(mode === 'in' ? 'out' : 'in'), true);
    item('Demo-Daten neu laden', () => loadDemo(mode));
    item('Eigene Daten zurück', restoreOwn);
  }
  document.body.append(menu);
  btn.onclick = () => { menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'; };
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== btn) menu.style.display = 'none'; }, true);
}

// Für Tests in der Konsole
export const _test = { buildDemo, fakeClient, weekStart };
