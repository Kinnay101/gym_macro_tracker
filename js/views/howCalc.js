// „So rechnet die App“ (Profil): alle Berechnungen zum Nachlesen – Tagesbedarf, Makros, Aktivität, Gewicht pro Seite,
// 1RM/Bestwerte, Volumen, Plan-Tage, Rangliste, Health-Daten, Lebensmittel. Texte in i18n (calc.*), dazu die eigenen
// aktuellen Werte, wo es sie gibt. Wichtig: Texte an den Code anpassen, wenn sich eine Berechnung ändert
// (js/nutrition.js, js/workout.js, js/exercises.js, js/social.js, js/plan.js, js/health.js, js/cardio.js).
import { esc, num, icon, I } from '../util.js';
import { t } from '../i18n.js';
import { calcGoals, activityLevel, goalAmount, goals } from '../nutrition.js';
import { plannedPerWeek } from '../plan.js';
import { sheetHead } from '../ui.js';

const SECTIONS = ['kcal', 'macros', 'activity', 'load', 'e1rm', 'volume', 'days', 'friends', 'health', 'food'];

const paras = (text) => String(text).split('\n').map((p) => `<p class="small" style="margin:0 0 8px">${esc(p)}</p>`).join('');

/** Eigene Werte als kleine Box (nur wo sinnvoll). */
function mine(state, id) {
  const rows = [];
  let note = '';
  if (id === 'kcal') {
    const g = calcGoals(state);
    if (!g) return `<div class="hint small">${esc(t('calc.needProfile'))}</div>`;
    const pr = state.profile;
    const adj = goalAmount(pr);
    // Rechnung Schritt für Schritt: Grundumsatz × Faktor = Erhaltungsbedarf, ± Ziel, auf 10 kcal gerundet
    rows.push([t('calc.v.bmr'), `${num(g.bmr)} kcal`], [t('calc.v.factor'), `× ${num(g.act.factor, 3)}`], [`= ${t('calc.v.tdee')}`, `${num(g.tdee)} kcal`]);
    rows.push([t(pr.goal === 'cut' ? 'calc.v.cut' : pr.goal === 'bulk' ? 'calc.v.bulk' : 'calc.v.maintain'), adj ? `${pr.goal === 'cut' ? '−' : '+'}${num(adj)} kcal` : '±0 kcal']);
    rows.push([`= ${t('calc.v.goal')}`, `${num(g.kcal)} kcal`]);
    if (pr.goalOverride) note = t('calc.v.overrideNote', { kcal: num(pr.goalOverride.kcal) });
  } else if (id === 'macros') {
    const g = goals(state);
    if (g.isDefault) return `<div class="hint small">${esc(t('calc.needProfile'))}</div>`;
    rows.push([t('n.p'), `${num(g.p)} g`], [t('n.f'), `${num(g.f)} g`], [t('n.c'), `${num(g.c)} g`],
      [t('n.fiber'), `${num(g.fiber)} g`], [`${t('n.sugar')} (${t('calc.v.max')})`, `${num(g.sugar)} g`], [`${t('n.salt')} (${t('calc.v.max')})`, `${num(g.salt, 1)} g`],
      [`${t('n.sfa')} (${t('calc.v.max')})`, `${num(g.sfa)} g`]);
    if (state.profile.goalOverride) note = t('calc.v.macroOverride');
  } else if (id === 'activity') {
    const a = activityLevel(state);
    rows.push([t('calc.v.perWeek'), num(a.perWeek, 1)], [t('calc.v.factor'), `× ${num(a.factor, 3)}`], [t('calc.v.source'), t(a.source === 'rhythm' ? 'calc.v.fromPlan' : 'calc.v.fromLog')]);
  } else if (id === 'friends') {
    rows.push([t('calc.v.weekTarget'), num(plannedPerWeek(state).strength || 1, 1)]);
  }
  if (!rows.length) return '';
  return `<div class="calc-mine"><div class="tiny muted" style="margin-bottom:4px">${esc(t('calc.yours'))}</div>${rows.map(([l, v]) => `<div class="row between small"><span class="muted">${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}
    ${note ? `<div class="tiny muted" style="margin-top:4px">${esc(note)}</div>` : ''}</div>`;
}

// Akkordeon: immer nur ein Abschnitt offen; Öffnen/Schliessen animiert (CSS grid-template-rows 0fr ↔ 1fr)
let openId = null;

function sheet(state) {
  return `${sheetHead(t('calc.title'))}
    <div class="small muted">${esc(t('calc.intro'))}</div>
    <div class="calc-list">${SECTIONS.map((id) => `<section class="calc-sec ${id === openId ? 'open' : ''}" data-id="${id}">
      <button type="button" class="calc-head" data-act="calc-sec" data-id="${id}" aria-expanded="${id === openId}">${esc(t(`calc.${id}.title`))}<span class="calc-ico" aria-hidden="true">${icon(I.down)}</span></button>
      <div class="calc-wrap"><div class="calc-inner"><div class="calc-body">${paras(t(`calc.${id}.body`))}${mine(state, id)}</div></div></div></section>`).join('')}</div>`;
}

/** Abschnitt öffnen (andere schliessen) bzw. schliessen – direkt im DOM, damit die Animation läuft. */
function toggle(id) {
  openId = openId === id ? null : id;
  for (const sec of document.querySelectorAll('#sheet-root .calc-sec')) {
    const on = sec.dataset.id === openId;
    sec.classList.toggle('open', on);
    sec.querySelector('.calc-head')?.setAttribute('aria-expanded', String(on));
  }
  // Geöffneten Abschnitt nach der Animation ganz zeigen
  const sec = openId && document.querySelector(`#sheet-root .calc-sec[data-id="${openId}"]`);
  if (sec) setTimeout(() => sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
}

/** Karte im Profil */
export function card() {
  return `<section class="card tight"><button type="button" class="card-head item-btn" data-act="calc-open" style="width:100%;text-align:left">
      <h3>${esc(t('calc.title'))}</h3>${icon(I.chevron)}</button></section>`;
}

export const actions = {
  'calc-open'(el, ctx) { openId = null; ctx.openSheet(sheet); },
  'calc-sec'(el) { toggle(el.dataset.id); },
};
