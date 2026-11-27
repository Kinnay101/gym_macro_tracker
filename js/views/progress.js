// Fortschritt: 1RM-Verlauf, Bestwerte, Sätze pro Muskel; Umschalter zu Freunde & Rangliste. Der Kalender (calendar) wird von der Trainingsseite angezeigt.
import { esc, num, today, addDays, parseKey, dayKey, daysBetween, icon, I, weekStart } from '../util.js';
import { t, monthName, shortDate, weekdayHeaders, longDate, weekdayShort, dayMonth } from '../i18n.js';
import { historyFor, bestFor, setsPerMuscle, trackOf, isUniTrack, trackBase, volume } from '../workout.js';
import { allExercises } from '../exercises.js';
import { goals, sumEntries, dayEntries, kcalToKj } from '../nutrition.js';
import { MUSCLES, dayPlan, planShort } from '../plan.js';
import { header, seg, lineChart, barChart, trackLabel, energy } from '../ui.js';
import * as friendsView from './friends.js';
import { healthWorkoutsBetween } from '../health.js';
import * as daySheet from './daySheet.js';

let tab = 'me';
let exName = null;
let monthOffset = 0;
let meTab = 'strength'; // Fortschritt → Ich: 'strength' | 'body' (Prüfbericht D4)
let allPrs = false; // „Alle anzeigen“ bei den Bestwerten (Prüfbericht B7)
const PR_SHOWN = 6;

function exerciseNames(state) {
  const names = new Set();
  for (const w of state.workouts) for (const e of w.exercises) names.add(trackOf(e)); // einseitig = eigene Spur
  return [...names].sort((a, b) => trackLabel(a).localeCompare(trackLabel(b)));
}

/**
 * Auswahl der Übung nach Muskelgruppe gegliedert (Feedback Janis: nicht alle Übungen in einer Liste) – als <optgroup>,
 * am Handy erscheinen die Gruppen als Zwischentitel. Muskel aus der Übungsliste bzw. dem letzten Training.
 */
function exerciseOptions(state, names) {
  const muscleOf = new Map(allExercises(state).map((x) => [x.name.toLowerCase(), x.muscle]));
  const groups = new Map(MUSCLES.map((m) => [m, []]));
  const other = [];
  for (const n of names) {
    const m = muscleOf.get(trackBase(n).toLowerCase());
    (groups.get(m) || other).push(n);
  }
  const opt = (n) => `<option value="${esc(n)}" ${n === exName ? 'selected' : ''}>${esc(trackLabel(n))}</option>`;
  return [...groups].filter(([, xs]) => xs.length).map(([m, xs]) => `<optgroup label="${esc(t('m.' + m))}">${xs.map(opt).join('')}</optgroup>`).join('')
    + (other.length ? `<optgroup label="${esc(t('progress.otherMuscle'))}">${other.map(opt).join('')}</optgroup>` : '');
}

export function render(state, params, ctx) {
  return `${header(t('nav.progress'))}
    ${seg('tab', [['me', t('progress.me')], ['friends', t('progress.friends')]], tab)}
    ${tab === 'me' ? me(state) : friendsView.render(state, ctx)}`;
}

function me(state) {
  const tabs = seg('me-tab', [['strength', t('progress.tabStrength')], ['body', t('progress.tabBody')]], meTab);
  return tabs + (meTab === 'body' ? bodyStats(state) : strength(state));
}

// ---- Wochen-Auswertungen ----
const WEEKS = 8;
/** Montage der letzten `n` Wochen, älteste zuerst, die laufende Woche zuletzt. */
function lastWeeks(n = WEEKS) {
  const cur = weekStart(today());
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)));
}
const signed = (v, dec = 0) => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v), dec);
const kFmt = (v) => (v >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)}k` : num(v));

/** Kraft: Volumen pro Woche (+ Anzahl Trainings). */
function volumeCards(state) {
  const weeks = lastWeeks();
  const cur = weeks[weeks.length - 1];
  const per = weeks.map((ws) => {
    const ws7 = addDays(ws, 6);
    const list = state.workouts.filter((w) => w.date >= ws && w.date <= ws7);
    return { ws, n: list.length, vol: list.reduce((a, w) => a + volume(w), 0) };
  });
  if (!per.some((x) => x.n)) return '';
  const done4 = per.slice(-5, -1); // die letzten vier abgeschlossenen Wochen
  const avg = done4.reduce((a, x) => a + x.n, 0) / done4.length;
  const chart = barChart(per.map((x) => ({ v: x.vol, label: dayMonth(x.ws), top: x.n ? String(x.n) : '', dim: x.ws === cur })), { fmt: kFmt });
  return `<section class="card tight"><h3>${esc(t('progress.volumeWeek'))}</h3><div class="small muted">${esc(t('progress.perWeek', { n: num(avg, 1) }))}</div>
      ${chart}<div class="tiny muted">${esc(t('progress.volumeHint'))}</div></section>`;
}

/** Körper & Ernährung: Gewichtstrend (Wochenschnitt), Kalorien pro Woche gegenüber dem Ziel, Tage nach Plan. */
function bodyStats(state) {
  const key = today();
  // Gewicht: Schnitt pro Woche (12 Wochen), nur Wochen mit Messung
  const wk = lastWeeks(12).map((ws) => {
    const ws7 = addDays(ws, 6);
    const list = state.weights.filter((w) => w.date >= ws && w.date <= ws7);
    return { ws, avg: list.length ? list.reduce((a, w) => a + w.kg, 0) / list.length : null };
  }).filter((x) => x.avg != null);
  let weight;
  if (wk.length >= 2) {
    const pts = wk.map((x) => ({ x: daysBetween(wk[0].ws, x.ws), y: Math.round(x.avg * 10) / 10, label: dayMonth(x.ws) }));
    const last = wk[wk.length - 1]; const prev = wk[wk.length - 2];
    const sum = last.ws === weekStart(key)
      ? t('progress.weightDelta', { kg: num(last.avg, 1), d: signed(Math.round((last.avg - prev.avg) * 10) / 10, 1) }) : '';
    weight = `${sum ? `<div class="small">${esc(sum)}</div>` : ''}${lineChart(pts)}<div class="tiny muted">${esc(t('progress.weightTrendHint'))}</div>`;
  } else weight = `<div class="small muted">${esc(t('progress.needWeights'))}</div>`;

  // Kalorien: Ø pro Tag (nur Tage mit Einträgen), heute zählt nicht (der Tag läuft noch)
  const g = goals(state);
  const kj = state.profile.energyUnit === 'kj';
  const unit = (v) => (kj ? Math.round(kcalToKj(v)) : Math.round(v));
  const dayKcal = (d) => { const e = dayEntries(state, d); return e.length ? sumEntries(e).kcal : null; };
  const weeks = lastWeeks();
  const kw = weeks.map((ws) => {
    const vals = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d < key).map(dayKcal).filter((v) => v != null);
    return { ws, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  let kcal;
  if (kw.some((x) => x.avg != null)) {
    const last28 = Array.from({ length: 28 }, (_, i) => addDays(key, -28 + i)).map(dayKcal).filter((v) => v != null);
    const avg = last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null;
    const sum = avg != null ? t('progress.kcalAvg', { v: energy(state, Math.round(avg)), d: `${signed(unit(avg - g.kcal))} ${kj ? 'kJ' : 'kcal'}` }) : '';
    kcal = `${sum ? `<div class="small">${esc(sum)}</div>` : ''}
      ${barChart(kw.map((x) => ({ v: x.avg != null ? unit(x.avg) : null, label: dayMonth(x.ws), dim: x.ws === weeks[weeks.length - 1] })), { goal: unit(g.kcal), fmt: kFmt })}
      <div class="tiny muted">${esc(t('progress.kcalHint', { goal: energy(state, g.kcal) }))}</div>`;
  } else kcal = `<div class="small muted">${esc(t('progress.needDiary'))}</div>`;

  // Tage nach Plan (letzte 28 Tage ohne heute, erst ab Planbeginn)
  const start = state.training?.anchor?.date || key;
  const c = { trained: 0, missed: 0, rest: 0, sick: 0 };
  const doneDays = new Set(state.workouts.map((w) => w.date));
  for (let i = 28; i >= 1; i--) {
    const d = addDays(key, -i);
    if (d < start) continue;
    if (doneDays.has(d)) { c.trained++; continue; }
    const p = dayPlan(state, d);
    if (p.sick) c.sick++;
    else if (p.kind === 'train') c.missed++;
    else c.rest++;
  }
  const tile = (n, l) => `<div><b>${num(n)}</b><span>${esc(t(l))}</span></div>`;
  const days = `<div class="stat-grid">${tile(c.trained, 'progress.daysTrained')}${tile(c.missed, 'progress.daysMissed')}${tile(c.rest, 'progress.daysRest')}${tile(c.sick, 'progress.daysSick')}</div>
    <div class="tiny muted">${esc(t('progress.daysHint'))}</div>`;

  return `<section class="card tight"><h3>${esc(t('progress.weightTrend'))}</h3>${weight}</section>
    <section class="card tight"><h3>${esc(t('progress.kcalWeek'))}</h3>${kcal}</section>
    ${activityCard(state)}
    <section class="card tight"><h3>${esc(t('progress.daysTitle'))}</h3>${days}</section>`;
}

// ---- Aktivität & Schlaf aus Apple Health / Health Connect (Feedback Janis: Schritt-Verlauf der letzten Tage) ----
let actMetric = 'steps'; // 'steps' | 'sleep' | 'exercise' | 'active'
const ACT_DAYS = 14;
function activityCard(state) {
  const key = today();
  const days = Array.from({ length: ACT_DAYS }, (_, i) => addDays(key, i - ACT_DAYS + 1));
  const hd = state.healthDays || {};
  const sl = state.healthSleep || {};
  const kj = state.profile.energyUnit === 'kj';
  const val = (d) => {
    if (actMetric === 'sleep') return sl[d]?.minutes != null ? sl[d].minutes / 60 : null;
    const v = hd[d]?.[{ steps: 'steps', exercise: 'exerciseMin', active: 'activeKcal' }[actMetric]];
    return v == null ? null : (actMetric === 'active' && kj ? kcalToKj(v) : v);
  };
  const has = days.some((d) => val(d) != null) || Object.keys(hd).length || Object.keys(sl).length;
  if (!has) return `<section class="card tight"><h3>${esc(t('health.title'))}</h3><div class="small muted">${esc(t('progress.needHealth'))}</div></section>`;
  const unit = { steps: '', sleep: ' h', exercise: ' min', active: kj ? ' kJ' : ' kcal' }[actMetric];
  const hm = (v) => { const m = Math.round(v * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`; };
  const fmtV = (v) => (actMetric === 'sleep' ? hm(v) : `${num(Math.round(v))}${unit}`);
  // Schnitt der letzten 7 Tage (heute zählt beim Schlaf mit – die Nacht ist vorbei –, sonst nicht: der Tag läuft noch)
  const avgOf = (list) => { const v = list.map(val).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const endIdx = actMetric === 'sleep' ? ACT_DAYS : ACT_DAYS - 1;
  const last7 = days.slice(endIdx - 7, endIdx); const prev7 = days.slice(endIdx - 14 < 0 ? 0 : endIdx - 14, endIdx - 7);
  const a = avgOf(last7); const b = avgOf(prev7);
  const sum = a != null ? `${t(actMetric === 'sleep' ? 'progress.actAvgSleep' : 'progress.actAvg', { v: fmtV(a) })}${b != null ? ` · ${t('progress.actPrev', { v: fmtV(b) })}` : ''}` : '';
  const chart = barChart(days.map((d) => ({ v: val(d), label: String(parseKey(d).getDate()), dim: d === key && actMetric !== 'sleep' })),
    { fmt: actMetric === 'sleep' ? (v) => `${num(v)}h` : kFmt });
  const tabs = seg('act-metric', [['steps', t('health.steps')], ['sleep', t('health.sleep')], ['exercise', t('health.exercise')], ['active', kj ? 'kJ' : 'kcal']], actMetric);
  return `<section class="card tight"><h3>${esc(t('health.title'))}</h3>${tabs}
    ${sum ? `<div class="small">${esc(sum)}</div>` : ''}
    ${chart || `<div class="small muted">${esc(t('progress.actNone'))}</div>`}
    <div class="tiny muted">${esc(t(actMetric === 'sleep' ? 'progress.actHintSleep' : 'progress.actHint'))}</div></section>`;
}

function strength(state) {
  const names = exerciseNames(state);
  // Standard: die Übung mit den meisten Trainings (dann gibt es am ehesten eine Kurve)
  if (!names.includes(exName)) {
    // bei Gleichstand die zuletzt trainierte
    const info = Object.fromEntries(names.map((n) => { const h = historyFor(state, n); return [n, { n: h.length, last: h[h.length - 1]?.date || '' }]; }));
    exName = [...names].sort((a, b) => info[b].n - info[a].n || info[b].last.localeCompare(info[a].last))[0] || null;
  }
  const hist = exName ? historyFor(state, exName) : [];
  const uni = isUniTrack(exName);
  const pt = (h, y) => ({ x: daysBetween(hist[0].date, h.date), y, label: shortDate(h.date) });
  // Einseitig: eine Linie pro Seite (links = Akzentfarbe, rechts = zweite Farbe)
  const pts = hist.map((h) => pt(h, uni ? h.l : h.e1rm));
  const pts2 = uni ? hist.map((h) => pt(h, h.r)) : null;
  const chart = names.length
    ? `<select class="input" data-in="ex" aria-label="${esc(t('progress.exercise'))}">${exerciseOptions(state, names)}</select>
       ${lineChart(pts, { unit: '', points2: pts2 })}
       ${uni && hist.length >= 2 ? `<div class="chart-legend tiny muted"><span><i class="lgline"></i>${esc(t('progress.left'))}</span><span><i class="lgline alt"></i>${esc(t('progress.right'))}</span></div>${sideHint(hist)}` : ''}
       <div class="tiny muted">${esc(t(uni ? 'progress.uniHint' : 'progress.e1rmHint'))}</div>`
    : `<div class="empty">${esc(t('progress.noData'))}</div>`;

  // Neueste zuerst; standardmässig nur die letzten sechs, „Alle anzeigen“ klappt den Rest auf
  const allPr = names.map((n) => ({ n, b: bestFor(state, n) })).filter((x) => x.b)
    .sort((a, b) => b.b.date.localeCompare(a.b.date));
  const prs = allPrs ? allPr : allPr.slice(0, PR_SHOWN);
  const more = allPr.length > PR_SHOWN
    ? `<button class="link small" data-act="prs-all" style="margin-top:6px">${esc(allPrs ? t('progress.prsLess') : t('progress.prsAll', { n: allPr.length }))}</button>` : '';

  const key = today();
  const spm = setsPerMuscle(state, addDays(key, -6), key);
  const maxSets = Math.max(10, ...Object.values(spm));

  // Reihenfolge nach Vorschlag Janis (Feedback 27.11.): Sätze pro Muskel, Volumen, 1RM, Bestwerte
  return `
    <section class="card tight"><div class="card-head"><h3>${esc(t('progress.setsPerMuscle'))}</h3><span class="tiny muted">${esc(t('progress.last7'))}</span></div>
      ${MUSCLES.map((m) => `<div class="bar-row"><div class="top"><span>${esc(t('m.' + m))}</span><span class="muted">${num(spm[m] || 0)}</span></div><div class="bar"><i style="width:${((spm[m] || 0) / maxSets) * 100}%;background:var(--accent)"></i></div></div>`).join('')}
    </section>
    ${volumeCards(state)}
    <section class="card"><h3>${esc(t('progress.e1rm'))}</h3>${chart}</section>
    <section class="card tight"><h3>${esc(t(allPrs || allPr.length <= PR_SHOWN ? 'progress.prs' : 'progress.prsRecent'))}</h3>
      ${prs.length ? `<div class="list">${prs.map(({ n, b }) => `<div class="item"><div class="grow"><div class="ellipsis" style="font-weight:600">${esc(trackLabel(n))}</div>
        <div class="meta">${num(b.kg, 2)} kg × ${b.repsR != null ? `${num(b.reps)} L · ${num(b.repsR)} R` : num(b.reps)} · ${esc(shortDate(b.date))}</div></div><span style="font-weight:700">${num(b.e1rm, 1)} kg</span></div>`).join('')}</div>`
        : `<div class="small muted">${esc(t('progress.noData'))}</div>`}${more}
    </section>`;
  // Kalender steht unter Training (calendar() wird dort benutzt)
}

const MONTHS_AHEAD = 3;

/**
 * Kalender: vergangene Tage wie erfasst (Training = grün gefüllt, Cardio = Punkt), ab heute der Plan
 * (Kürzel des Trainings, Ruhetage blass, geplantes Cardio = Ring). Verpasste Trainings seit Planbeginn sind durchgestrichen.
 * Jeder Tag lässt sich antippen → Tagesübersicht mit Plan (ändern, verschieben, Cardio).
 */
/** Hinweis, wenn eine Seite in den letzten Trainings immer schwächer ist (> 5 % im 1RM ≈ 2 Wdh, mindestens 2 Trainings). */
function sideHint(hist) {
  const last = hist.slice(-3);
  if (last.length < 2) return '';
  const diffs = last.map((h) => (h.l - h.r) / Math.max(h.l, h.r)); // > 0: rechts schwächer
  const allSame = diffs.every((d) => d > 0.05) || diffs.every((d) => d < -0.05);
  if (!allSame) return '';
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return `<div class="small" style="color:var(--warn)">${esc(t('progress.sideHint', { side: t(avg > 0 ? 'progress.sideRight' : 'progress.sideLeft'), pct: Math.round(Math.abs(avg) * 100), n: last.length }))}</div>`;
}

// Gemeinsame Daten für Kalender-Kacheln (Monat unter Training, Woche auf Heute)
function calEnv(state) {
  const nowKey = today();
  return {
    nowKey,
    plans: Object.fromEntries(state.plans.map((p) => [p.id, p])),
    strength: new Map(state.workouts.map((w) => [w.date, w])),
    cardio: new Set([...state.cardio.map((c) => c.date), ...healthWorkoutsBetween(state, '0000', '9999').filter((w) => w.kind !== 'strength').map((w) => w.date)]),
    planStart: state.training?.anchor?.date || nowKey,
  };
}

/** Eine Kalender-Kachel: Tag, Kürzel (P1 …), Zustand (erledigt, geplant, verpasst, Ruhetag, krank, heute), Cardio-Punkt. */
function calCell(state, k, env) {
  const { nowKey, plans, strength, cardio, planStart } = env;
  const w = strength.get(k);
  const p = state.training ? dayPlan(state, k) : null;
  let cls = 'c';
  let label = '';
  let planned = false;
  if (w) { cls += ' k'; label = planShort(plans[w.planId]); }
  else if (p?.sick) { cls += ' sick'; label = '🤒'; }
  else if (p && (k >= nowKey || k >= planStart)) {
    if (p.shifted) { cls += ' rest'; label = '↷'; }
    else if (p.kind === 'train') { cls += k < nowKey ? ' miss' : ' plan'; label = planShort(plans[p.planId]); planned = k >= nowKey; }
    else cls += ' rest';
  }
  if (k === nowKey) cls += ' today';
  const dot = cardio.has(k) ? '<i class="dot"></i>' : p && k >= nowKey && p.cardio.length ? '<i class="dot plan"></i>' : '';
  const html = `<button type="button" class="${cls}" data-act="day-open" data-d="${k}" aria-label="${esc(longDate(k))}${label && label !== '🤒' ? ' · ' + esc(label) : ''}"><span>${parseKey(k).getDate()}</span>${label ? `<small>${esc(label)}</small>` : ''}${dot}</button>`;
  return { html, trained: !!w, planned };
}

/** Diese Woche als Kalender-Zeile (Heute): gleiche Kacheln wie der Monatskalender. */
export function weekRow(state, startKey) {
  const env = calEnv(state);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(startKey, i));
  return `<div class="cal week-cal">${keys.map((k) => `<span class="h${k === env.nowKey ? ' now' : ''}">${esc(weekdayShort(k))}</span>`).join('')}${keys.map((k) => calCell(state, k, env).html).join('')}</div>`;
}

export function calendar(state) {
  const nowKey = today();
  const now = parseKey(nowKey);
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const env = calEnv(state);
  let count = 0;
  let planned = 0;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= daysIn; d++) {
    const k = dayKey(new Date(first.getFullYear(), first.getMonth(), d));
    const c = calCell(state, k, env);
    if (c.trained) count++;
    if (c.planned) planned++;
    cells.push(c.html);
  }
  // Immer 6 Wochenzeilen → der Kalender ist jeden Monat gleich hoch, die Pfeile springen beim Blättern nicht
  while (cells.length < 42) cells.push('<span class="c pad" aria-hidden="true"></span>');
  const sub = [count || monthOffset <= 0 ? t('progress.trainings', { n: count }) : '', planned ? t('progress.planned', { n: planned }) : ''].filter(Boolean).join(' · ');
  return `<section class="card tight">
    <div class="card-head"><button class="icon-btn" data-act="month" data-v="-1" aria-label="${esc(t('common.prev'))}">${icon(I.back)}</button>
      <div style="text-align:center"><h3>${esc(monthName(first))}</h3><div class="tiny muted" style="height:1.4em;line-height:1.4em;white-space:nowrap">${esc(sub)}${monthOffset !== 0 ? `${sub ? ' · ' : ''}<button type="button" class="link tiny" data-act="month-today">${esc(t('common.toToday'))}</button>` : ''}</div></div>
      <button class="icon-btn" data-act="month" data-v="1" ${monthOffset >= MONTHS_AHEAD ? 'disabled style="opacity:.35"' : ''} aria-label="${esc(t('common.next'))}">${icon(I.chevron)}</button></div>
    <div class="cal">${weekdayHeaders().map((h) => `<span class="h">${esc(h)}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-legend tiny muted">
      <span><i class="lg k"></i>${esc(t('progress.strength'))}</span><span><i class="lg plan"></i>${esc(t('progress.legendPlan'))}</span>
      <span><i class="lg miss"></i>${esc(t('progress.legendMissed'))}</span><span><i class="lgdot"></i>${esc(t('progress.cardio'))}</span><span><i class="lgdot plan"></i>${esc(t('progress.legendCardioPlan'))}</span><span><i class="lg sick"></i>${esc(t('progress.legendSick'))}</span>
    </div>
  </section>`;
}

/** Blättern im Kalender – auch von der Trainingsseite benutzt. */
export const calendarActions = {
  month(el, ctx) { monthOffset = Math.min(MONTHS_AHEAD, monthOffset + Number(el.dataset.v)); ctx.render(); },
  'month-today'(el, ctx) { monthOffset = 0; ctx.render(); },
};

export const actions = {
  ...friendsView.actions,
  ...daySheet.actions,
  'prs-all'(el, ctx) { allPrs = !allPrs; ctx.render(); },
  'me-tab'(el, ctx) { meTab = el.dataset.v; ctx.render(); },
  'act-metric'(el, ctx) { actMetric = el.dataset.v; ctx.render(); },
  tab(el, ctx) {
    tab = el.dataset.v;
    if (tab === 'friends') friendsView.load(ctx, { quiet: true });
    ctx.render();
  },
  ...calendarActions,
};
export const inputs = { ...daySheet.inputs };
export const changes = {
  ...daySheet.changes,
  ex(el, ctx) { exName = el.value; ctx.render(); },
};
