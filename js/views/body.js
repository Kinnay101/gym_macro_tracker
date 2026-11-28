// Körper: Gewicht, Masse, Ziele. Profil (eigene Seite #/profile, Personen-Symbol oben): Darstellung, Konto & Sync,
// Teilen, Health, Daten, Feedback, Version – beide Seiten teilen sich die Aktionen hier.
import { esc, num, today, daysBetween, icon, I, parseNum } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { calcGoals, goals, currentWeight, activityLevel, goalAmount, rebalanceGoals, lockedFields, GOAL_FIELDS, ADJ_MAX, extraGoalDefaults } from '../nutrition.js';
import { header, seg, lineChart, energy, energyUnit, sheetHead, healthMark } from '../ui.js';
import { kcalToKj } from '../nutrition.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import * as social from '../social.js';
import * as measuresView from './measures.js';
import * as healthSetup from './healthSetup.js';
import * as feedbackView from './feedback.js';
import * as howCalc from './howCalc.js';
import { rhythmName } from './today.js';
import * as version from '../version.js';
import * as hc from '../healthConnect.js';
import { THEMES } from '../theme.js';


export function render(state, params, ctx) {
  const p = state.profile;
  const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = weights.slice(-30);
  const pts = recent.map((w) => ({ x: daysBetween(recent[0].date, w.date), y: w.kg, label: shortDate(w.date) }));
  const kg = currentWeight(state);
  const calc = calcGoals(state);
  const g = goals(state);
  // Körperfett: neuester Wert aus Apple Health oder Körpermassen
  const bfOf = (date) => state.healthDays?.[date]?.bodyFat;
  const bfList = [
    ...Object.values(state.healthDays || {}).filter((x) => x.bodyFat != null).map((x) => ({ date: x.date, v: x.bodyFat, health: true })),
    ...(state.measures || []).filter((x) => x.bf != null).map((x) => ({ date: x.date, v: x.bf })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const bf = bfList[bfList.length - 1];

  return `${header(t('nav.body'), '', profileBtn())}
    <section class="card">
      <div class="card-head"><div><div class="tiny muted">${esc(t('body.weight'))}</div><div class="big">${kg ? num(kg, 1) + ' kg' : '–'}</div></div>
        ${bf ? `<div style="text-align:right"><div class="tiny muted">${esc(t('measure.bf'))}</div><div class="big">${num(bf.v, 1)} %</div><div class="tiny muted">${bf.health ? healthMark() + ' ' : ''}${esc(shortDate(bf.date))}</div></div>` : ''}</div>
      <div class="row"><input class="input grow" id="w-in" inputmode="decimal" placeholder="${esc(t('body.weightPh'))}" aria-label="${esc(t('body.weight'))}"><button class="btn primary" data-act="add-weight">${esc(t('common.save'))}</button></div>
      ${weights.length ? lineChart(pts, { unit: '', valFmt: (v) => `${num(v, 1)} kg` }) : ''}
      ${weights.length ? `<div class="list">${weights.slice(-4).reverse().map((w) => `<div class="item"><span class="grow small">${esc(shortDate(w.date))}</span><span style="font-weight:600">${w.source === 'health' ? healthMark() + ' ' : ''}${num(w.kg, 1)} kg${bfOf(w.date) != null ? ` <span class="tiny muted">· ${num(bfOf(w.date), 1)} %</span>` : ''}</span>
        <button class="icon-btn" data-act="del-weight" data-date="${esc(w.date)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>`).join('')}</div>` : ''}
    </section>

    ${measuresView.card(state)}


    <section class="card">
      <h3>${esc(t('body.goals'))}</h3>
      ${seg('goal', [['cut', t('goal.cut')], ['maintain', t('goal.maintain')], ['bulk', t('goal.bulk')]], p.goal)}
      ${adjField(state)}
      <div class="grid2">
        <label class="field">${esc(t('body.sex'))}<select class="input" data-in="sex"><option value="">–</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>${esc(t('sex.m'))}</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>${esc(t('sex.f'))}</option></select></label>
        <label class="field">${esc(t('body.birthYear'))}<input class="input" inputmode="numeric" data-in="birthYear" value="${p.birthYear ?? ''}" placeholder="${esc(t('common.eg', { v: 2004 }))}"></label>
        <label class="field">${esc(t('body.height'))}<input class="input" inputmode="numeric" data-in="heightCm" value="${p.heightCm ?? ''}" placeholder="${esc(t('common.eg', { v: 180 }))}"></label>
      </div>
      ${activityBox(state)}
      ${calc ? `<div class="small muted">${esc(t('body.calcInfo', { bmr: energy(state, calc.bmr), tdee: energy(state, calc.tdee) }))}</div>` : `<div class="small muted">${esc(t('body.needData'))}</div>`}
      <div class="grid2">
        ${goalBox(t('n.kcal'), energy(state, g.kcal))}${goalBox(t('n.p'), num(g.p) + ' g')}${goalBox(t('n.c'), num(g.c) + ' g')}${goalBox(t('n.f'), num(g.f) + ' g')}
      </div>
      ${p.goalOverride
        ? `<div class="row between"><span class="tag accent">${esc(t('body.manual'))}</span><button class="link" data-act="auto-goals">${esc(t('body.backToAuto'))}</button></div>`
        : ''}
      <button class="btn sm ghost" data-act="manual-goals">${esc(t('body.setManual'))}</button>
      ${extraGoalsBox(p, g)}
    </section>`;
}

/** Personen-Symbol oben rechts → Profil & Einstellungen. */
export function profileBtn() {
  return `<a class="head-btn" href="#/profile" aria-label="${esc(t('profile.title'))}">${icon(I.user)}</a>`;
}

/** Profil & Einstellungen. */
export function renderProfile(state, params, ctx) {
  const p = state.profile;
  return `<header class="head"><div class="row" style="gap:12px"><button class="icon-btn" data-act="go-back" aria-label="${esc(t('common.back'))}">${icon(I.back)}</button><h1>${esc(t('profile.title'))}</h1></div></header>

    <section class="card">
      <h3>${esc(t('settings.title'))}</h3>
      <div class="field">${esc(t('theme.title'))}${seg('theme', THEMES.map((x) => [x, t('theme.' + x)]), THEMES.includes(p.theme) ? p.theme : THEMES[0])}</div>
      <div class="field">${esc(t('settings.lang'))}${seg('lang', [['de', 'Deutsch'], ['en', 'English']], p.lang)}</div>
      <div class="field">${esc(t('settings.energy'))}${seg('energy', [['kcal', 'kcal'], ['kj', 'kJ']], p.energyUnit)}</div>
    </section>

    ${accountCard()}
    ${shareCard(state)}
    ${healthSetup.card(state, ctx)}

    <section class="card tight">
      <h3>${esc(t('settings.data'))}</h3>
      <div class="small muted">${esc(t('settings.dataHint'))}</div>
      <div class="grid2"><button class="btn" data-act="export">${esc(t('settings.export'))}</button><label class="btn">${esc(t('settings.import'))}<input type="file" accept="application/json,.json" data-in="import" hidden></label></div>
      <button class="btn danger" data-act="reset">${esc(t('settings.reset'))}</button>
    </section>

    ${howCalc.card()}
    ${feedbackView.card(state, ctx)}
    <div class="tiny muted" style="text-align:center">Gym Macro Tracker · ${esc(t('settings.version'))} ${esc(versionText(ctx))}</div>`;
}

/** Versionsnummer (Android „1.3.55“, sonst „55“) – wird einmal geladen, dann neu gezeichnet. */
function versionText(ctx) {
  const v = version.cached();
  if (v === undefined) { version.load().then(() => ctx?.render()); return '…'; }
  return v ?? '–';
}

// ---------- Konto & Sync ----------
let authEmail = '';
let authBusy = false;
let authMsg = null; // { key, error }

function accountCard() {
  if (!sync.isConfigured()) {
    return `<section class="card tight"><h3>${esc(t('settings.sync'))}</h3><div class="small muted">${esc(t('settings.syncSoon'))}</div></section>`;
  }
  const st = sync.getStatus();
  // Erfolgsmeldung vom Anmelden nach dem Abmelden nicht mehr zeigen
  if (!st.user && authMsg && ['auth.signedIn', 'auth.created'].includes(authMsg.key)) authMsg = null;
  const msg = authMsg ? `<div class="small" style="color:${authMsg.error ? 'var(--bad)' : 'var(--good)'}">${esc(t(authMsg.key))}</div>` : '';
  if (!st.user) {
    return `<section class="card" id="account"><h3>${esc(t('settings.sync'))}</h3>
      <div class="small muted">${esc(t('auth.intro'))}</div>
      <label class="field">${esc(t('auth.email'))}<input class="input" id="auth-email" type="email" autocomplete="username" data-in="auth-email" value="${esc(authEmail)}"></label>
      <label class="field">${esc(t('auth.password'))}<input class="input" id="auth-pw" type="password" autocomplete="current-password"></label>
      ${msg}
      <div class="grid2"><button class="btn primary" data-act="auth-signin" ${authBusy ? 'disabled' : ''}>${esc(t('auth.signIn'))}</button>
        <button class="btn" data-act="auth-signup" ${authBusy ? 'disabled' : ''}>${esc(t('auth.signUp'))}</button></div>
      <button class="link" data-act="auth-reset" style="align-self:flex-start">${esc(t('auth.forgot'))}</button>
    </section>`;
  }
  const line = {
    syncing: t('sync.syncing'),
    idle: st.lastSync ? t('sync.done', { time: new Date(st.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) }) : t('sync.ready'),
    offline: t('sync.offline'),
    error: t('sync.error'),
  }[st.state] || '';
  return `<section class="card" id="account"><h3>${esc(t('settings.sync'))}</h3>
    <div class="row between"><div class="grow"><div class="tiny muted">${esc(t('auth.signedInAs'))}</div><div class="ellipsis" style="font-weight:600">${esc(st.user.email || '')}</div></div>
      ${st.state === 'syncing' ? '<span class="spinner"></span>' : ''}</div>
    <label class="field">${esc(t('share.name'))}<div class="row"><input class="input grow" id="share-name" maxlength="30" value="${esc(store.get().profile.displayName || '')}" placeholder="${esc(t('friends.namePh'))}">
      <button class="btn" data-act="share-save-name">${esc(t('common.save'))}</button></div></label>
    <div class="small ${st.state === 'error' ? '' : 'muted'}" style="${st.state === 'error' ? 'color:var(--bad)' : ''}">${esc(line)}</div>
    ${msg}
    <div class="grid2"><button class="btn" data-act="sync-now" ${st.state === 'syncing' ? 'disabled' : ''}>${esc(t('sync.now'))}</button>
      <button class="btn" data-act="sign-out">${esc(t('auth.signOut'))}</button></div>
  </section>`;
}

function shareCard(state) {
  if (!sync.isConfigured()) return '';
  const sh = social.shareSettings(state);
  return `<section class="card" id="share"><h3>${esc(t('share.title'))}</h3>
    <div class="chips">${social.CATEGORIES.map((c) => `<button class="chip" data-act="share-toggle" data-v="${c}" aria-pressed="${!!sh[c]}">${esc(t('friends.cat.' + c))}</button>`).join('')}</div>
    <div class="tiny muted">${esc(t('share.hint'))}</div>
  </section>`;
}

/** Sheet zum Setzen eines neuen Passworts (nach Klick auf den Link in der E-Mail). */
export function recoverySheet() {
  return `${sheetHead(t('auth.newPwTitle'))}
    <div class="small muted">${esc(t('auth.newPwHint'))}</div>
    <label class="field">${esc(t('auth.newPw'))}<input class="input" id="new-pw" type="password" autocomplete="new-password" autofocus></label>
    <div class="small" id="new-pw-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="auth-newpw">${esc(t('common.save'))}</button>`;
}

async function authAction(ctx, fn) {
  const email = document.getElementById('auth-email')?.value.trim() || authEmail;
  const pw = document.getElementById('auth-pw')?.value || '';
  authEmail = email;
  authBusy = true; authMsg = null; ctx.render();
  try {
    authMsg = await fn(email, pw);
  } catch (e) {
    authMsg = { key: sync.errorKey(e), error: true };
  }
  authBusy = false;
  ctx.render();
}

function activityBox(state) {
  const a = activityLevel(state);
  const how = a.source === 'tracked'
    ? t('body.actTracked', { n: num(a.perWeek, 1) })
    : t('body.actRhythm', { rhythm: rhythmName(state) });
  return `<div class="stack" style="gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px">
    <div class="row between"><span class="tiny muted">${esc(t('body.activity'))}</span><b>${esc(t('act.' + a.key))} · ×${num(a.factor, 3)}</b></div>
    <div class="tiny muted">${esc(how)}</div></div>`;
}

/** Diät: Defizit, Aufbau: Überschuss in kcal pro Tag selbst einstellen. Bei „Halten“ nichts. */
function adjField(state) {
  const p = state.profile;
  if ((p.goal !== 'cut' && p.goal !== 'bulk') || p.goalOverride) return '';
  const v = goalAmount(p);
  const shown = p.energyUnit === 'kj' ? Math.round(kcalToKj(v)) : v; // Eingabe in der gewählten Einheit, gespeichert in kcal
  const hint = p.goal === 'cut'
    ? t('body.adjCutHint', { lo: energy(state, 300, false), hi: energy(state, 700), mid: energy(state, 500) })
    : t('body.adjBulkHint', { lo: energy(state, 200, false), hi: energy(state, 400) });
  return `<label class="field">${esc(t(p.goal === 'cut' ? 'body.adjCut' : 'body.adjBulk'))}
    <div class="row"><span style="font-weight:600;min-width:1ch">${p.goal === 'cut' ? '−' : '+'}</span><input class="input grow" inputmode="numeric" data-in="goalAdj" value="${shown}" aria-label="${esc(t(p.goal === 'cut' ? 'body.adjCut' : 'body.adjBulk'))}"><span class="small muted">${energyUnit(state)}</span></div>
    <span class="tiny muted">${esc(hint)}</span></label>`;
}

/** Ballaststoffe (min.), Zucker, Salz, gesättigte Fette (max.) – leer = Standard. */
function extraGoalsBox(p, g) {
  const def = extraGoalDefaults(g.kcal);
  const own = p.goalExtra || {};
  const rows = [['fiber', 'n.fiber', 'body.min'], ['sugar', 'n.sugar', 'body.max'], ['salt', 'n.salt', 'body.max'], ['sfa', 'n.sfa', 'body.max']];
  return `<div class="stack" style="gap:8px"><div class="small" style="font-weight:600">${esc(t('body.moreGoals'))}</div>
    <div class="grid2">${rows.map(([k, l, mm]) => `<label class="field">${esc(t(l))} · ${esc(t(mm))} (g)<input class="input" inputmode="decimal" data-in="goal-extra" data-k="${k}" value="${own[k] ?? ''}" placeholder="${esc(t('common.std', { v: num(def[k], k === 'salt' ? 1 : 0) }))}"></label>`).join('')}</div>
    <div class="tiny muted">${esc(t('body.moreGoalsHint'))}</div></div>`;
}

function goalBox(label, v) {
  return `<div class="stack" style="gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px"><span class="tiny muted">${esc(label)}</span><b>${esc(v)}</b></div>`;
}

// Ziel-Fenster: aktuelle Werte, Ausgangslage des gerade bearbeiteten Feldes (damit Tippen „3“ → „30“ → „3000“
// immer vom gleichen Stand aus rechnet) und Reihenfolge der Eingaben (die letzten drei bleiben stehen).
// Zu Beginn gelten die kcal als „eingegeben“ → wer nur ein Makro ändert, behält seine kcal.
let gCur = null;
let gBase = null;
let gField = null;
let gOrder = ['kcal'];
let gLocked = ['kcal'];

function splitText(o) {
  const tot = o.p * 4 + o.c * 4 + o.f * 9 || 1;
  const pc = (x) => Math.round((x / tot) * 100);
  return `${t('n.p')} ${pc(o.p * 4)} % · ${t('n.c')} ${pc(o.c * 4)} % · ${t('n.f')} ${pc(o.f * 9)} %`;
}

let gStart = null; // Werte beim Öffnen → Schliessen ohne Speichern fragt nur nach, wenn sich etwas geändert hat
let gRaised = false; // kcal wurden erhöht, weil die Makros mehr brauchen (Prüfbericht B2)

function startManual(state) {
  const g = goals(state);
  gCur = { kcal: g.kcal, p: g.p, c: g.c, f: g.f };
  gStart = JSON.stringify(gCur);
  gBase = null; gField = null; gOrder = ['kcal']; gLocked = ['kcal']; gRaised = false;
}

/** Hinweise im Ziel-Fenster: kcal still erhöht, sehr wenig Fett (unter 0.5 g pro kg bzw. 30 g ohne Gewicht). */
function goalWarnText() {
  if (!gCur) return '';
  const out = [];
  if (gRaised) out.push(t('body.kcalRaised', { v: energy(store.get(), gCur.kcal) }));
  const kg = currentWeight(store.get());
  const min = kg ? Math.round(kg * 0.5) : 30;
  if (gCur.f < min) out.push(t('body.fatLow', { min }));
  return out.join(' ');
}
function showGoalWarn() {
  const el = document.getElementById('g-warn');
  if (!el) return;
  const txt = goalWarnText();
  el.textContent = txt;
  el.hidden = !txt;
}
// Energie im Ziel-Fenster in der gewählten Einheit anzeigen/eingeben (intern immer kcal)
const isKj = () => store.get().profile.energyUnit === 'kj';
const toUnit = (kcal) => (isKj() ? Math.round(kcalToKj(kcal)) : kcal);
const fromUnit = (v) => (v != null && isKj() ? Math.round(v / 4.184) : v);

function manualSheet() {
  if (!gCur) return null;
  return `${sheetHead(t('body.setManual'))}
    <div class="small muted">${esc(t('body.manualHint'))}</div>
    <div class="grid2">${[['kcal', 'n.kcal'], ['p', 'n.p'], ['c', 'n.c'], ['f', 'n.f']].map(([k, l]) => `<label class="field"><span>${esc(t(l))}${k === 'kcal' ? ` (${energyUnit(store.get())})` : ' (g)'} <span class="tiny" id="g-tag-${k}" style="color:var(--accent)" hidden>${esc(t('body.computed'))}</span></span><input class="input" inputmode="numeric" id="g-${k}" data-in="goal-field" data-k="${k}" value="${k === 'kcal' ? toUnit(gCur.kcal) : gCur[k]}"></label>`).join('')}</div>
    <div class="tiny muted" id="g-split">${esc(splitText(gCur))}</div>
    <div class="hint small" id="g-warn" role="status"${goalWarnText() ? '' : ' hidden'}>${esc(goalWarnText())}</div>
    <button class="btn primary block" data-act="save-goals">${esc(t('common.save'))}</button>`;
}


export const actions = {
  ...measuresView.actions,
  ...healthSetup.actions,
  ...feedbackView.actions,
  ...howCalc.actions,
  'add-weight'(el, ctx) {
    const kg = parseNum(document.getElementById('w-in').value);
    if (!kg || kg < 20 || kg > 400) { ctx.toast(t('body.invalidWeight')); return; }
    const date = today();
    ctx.update((s) => { s.weights = s.weights.filter((w) => w.date !== date); s.weights.push({ date, kg }); });
    ctx.toast(t('body.weightSaved'));
  },
  'del-weight'(el, ctx) {
    const removed = ctx.state.weights.find((w) => w.date === el.dataset.date);
    ctx.update((s) => { s.weights = s.weights.filter((w) => w.date !== el.dataset.date); });
    ctx.toast(t('body.weightDeleted'), () => ctx.update((s) => { s.weights.push(removed); }));
  },
  goal(el, ctx) { ctx.update((s) => { s.profile.goal = el.dataset.v; }); },
  lang(el, ctx) { ctx.update((s) => { s.profile.lang = el.dataset.v; }); },
  energy(el, ctx) { ctx.update((s) => { s.profile.energyUnit = el.dataset.v; }); },
  'manual-goals'(el, ctx) {
    startManual(ctx.state);
    // Schliessen ohne Speichern verwirft Eingaben → wie in den Editoren nachfragen (Prüfbericht B3)
    ctx.openSheet(manualSheet, { modal: true, guard: () => !gCur || JSON.stringify(gCur) === gStart || ctx.confirm(t('common.discardChanges'), t('common.discard')) });
  },
  'go-back'(el, ctx) { if (history.length > 1) history.back(); else ctx.go('today'); },
  theme(el, ctx) { ctx.update((s) => { s.profile.theme = el.dataset.v; }); },
  'save-goals'(el, ctx) {
    const v = (k) => parseNum(document.getElementById('g-' + k).value);
    const o = { kcal: fromUnit(v('kcal')), p: v('p'), c: v('c'), f: v('f') };
    if (Object.values(o).some((x) => x == null || x < 0)) return;
    for (const k in o) o[k] = Math.round(o[k]);
    gStart = JSON.stringify(gCur); // gespeichert → Schliessen fragt nicht mehr nach
    ctx.closeSheet();
    ctx.update((s) => { s.profile.goalOverride = o; });
  },
  'auto-goals'(el, ctx) { ctx.update((s) => { s.profile.goalOverride = null; }); },
  async export(el, ctx) {
    const name = `gym-macro-tracker-${today()}.json`;
    // Android-App: die WebView kann keine Downloads speichern → Android-Dialog „Speichern unter“ über die Brücke (ab App 1.4)
    if (hc.available()) {
      try {
        const r = await hc.call('saveFile', { name, text: store.exportJSON() }, 10 * 60 * 1000);
        ctx.toast(t(r?.saved ? 'settings.exportSaved' : 'settings.exportCancelled'));
      } catch (e) {
        ctx.toast(t(/unknown method/.test(e.message) ? 'settings.exportNeedsUpdate' : 'settings.exportFail'));
      }
      return;
    }
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'auth-signin'(el, ctx) {
    authAction(ctx, async (email, pw) => {
      if (!email || !pw) return { key: 'auth.errMissing', error: true };
      await sync.signIn(email, pw);
      return { key: 'auth.signedIn' };
    });
  },
  'auth-signup'(el, ctx) {
    authAction(ctx, async (email, pw) => {
      if (!email || !pw) return { key: 'auth.errMissing', error: true };
      if (pw.length < 8) return { key: 'auth.errWeak', error: true };
      const r = await sync.signUp(email, pw);
      return { key: r.needsConfirm ? 'auth.checkMail' : 'auth.created' };
    });
  },
  'auth-reset'(el, ctx) {
    authAction(ctx, async (email) => {
      if (!email) return { key: 'auth.errEmailFirst', error: true };
      await sync.resetPassword(email);
      return { key: 'auth.resetSent' };
    });
  },
  async 'auth-newpw'(el, ctx) {
    const pw = document.getElementById('new-pw').value;
    const err = document.getElementById('new-pw-err');
    if (pw.length < 8) { err.textContent = t('auth.errWeak'); return; }
    try {
      await sync.updatePassword(pw);
      ctx.closeSheet();
      ctx.toast(t('auth.pwChanged'));
    } catch (e) {
      err.textContent = t(sync.errorKey(e));
    }
  },
  'share-toggle'(el, ctx) {
    const c = el.dataset.v;
    ctx.update((s) => { s.profile.share = { ...social.shareSettings(s), [c]: !social.shareSettings(s)[c] }; });
    social.schedulePublish(500);
  },
  async 'share-save-name'(el, ctx) {
    const v = document.getElementById('share-name').value.trim();
    if (!v) return;
    try { await social.setDisplayName(v); ctx.toast(t('share.nameSaved')); } catch (e) { ctx.toast(t(social.errorKey(e))); }
  },
  'sync-now'(el, ctx) { authMsg = null; sync.syncNow().catch(() => {}); },
  async 'sign-out'(el, ctx) {
    if (!(await ctx.confirm(t('auth.signOutConfirm'), t('auth.signOut'), { destructive: false }))) return;
    try {
      await sync.signOut();
      authMsg = null;
      ctx.toast(t('auth.signedOut'));
    } catch {
      if (await ctx.confirm(t('auth.signOutForce'), t('auth.signOut'))) { await sync.signOut({ force: true }); ctx.toast(t('auth.signedOut')); }
    }
  },
  async reset(el, ctx) {
    if (!(await ctx.confirm(t(sync.getUser() ? 'settings.resetConfirmAccount' : 'settings.resetConfirm'), t('settings.reset')))) return;
    store.resetAll();
    ctx.toast(t('settings.resetDone'));
  },
};

export const inputs = {
  ...feedbackView.inputs,
  'auth-email'(el) { authEmail = el.value; },
  // Ein Wert im Ziel-Fenster geändert → die anderen passen sich an (nur die anderen Felder werden neu gesetzt)
  'goal-field'(el) {
    if (!gCur) return;
    const k = el.dataset.k;
    const v = k === 'kcal' ? fromUnit(parseNum(el.value)) : parseNum(el.value);
    if (gField !== k) {
      // neues Feld angefangen → Stand merken, Feld ans Ende der Reihenfolge, die letzten drei bleiben stehen
      gBase = { ...gCur }; gField = k;
      gOrder = [...gOrder.filter((x) => x !== k), k];
      gLocked = lockedFields(gOrder);
    }
    if (v == null) return;
    const { values, computed } = rebalanceGoals(gBase, gLocked, k, v);
    gCur = values;
    gRaised = computed.includes('kcal') && (gLocked.includes('kcal') || k === 'kcal');
    for (const f of GOAL_FIELDS) {
      const tag = document.getElementById('g-tag-' + f);
      if (tag) tag.hidden = !computed.includes(f);
      if (f === k) continue;
      const inp = document.getElementById('g-' + f);
      if (inp) inp.value = f === 'kcal' ? toUnit(gCur.kcal) : gCur[f];
    }
    const split = document.getElementById('g-split');
    if (split) split.textContent = splitText(gCur);
    showGoalWarn();
  },
};

export const changes = {
  ...measuresView.changes,
  'goal-extra'(el, ctx) {
    const k = el.dataset.k;
    const raw = el.value.trim();
    const v = raw === '' ? null : parseNum(raw);
    if (raw !== '' && (v == null || v < 0 || v > 1000)) { ctx.toast(t('body.extraInvalid')); ctx.render(); return; }
    ctx.update((s) => {
      const e = { ...(s.profile.goalExtra || {}) };
      if (v == null) delete e[k]; else e[k] = Math.round(v * 10) / 10;
      s.profile.goalExtra = e;
    });
  },
  goalAdj(el, ctx) {
    const raw = parseNum(el.value);
    const v = raw != null && ctx.state.profile.energyUnit === 'kj' ? raw / 4.184 : raw; // kJ-Eingabe → kcal speichern
    const goal = ctx.state.profile.goal;
    // mindestens 1 kcal: 0 wäre „Halten“ (Prüfbericht B4)
    if (v == null || v < 1 || v > ADJ_MAX) { ctx.toast(t('body.adjInvalid', { min: energy(ctx.state, 1, false), max: energy(ctx.state, ADJ_MAX) })); ctx.render(); return; }
    ctx.update((s) => { s.profile.goalAdj = { ...(s.profile.goalAdj || {}), [goal]: Math.round(v) }; });
  },
  sex(el, ctx) { ctx.update((s) => { s.profile.sex = el.value || null; }); },
  birthYear(el, ctx) { const v = parseNum(el.value); ctx.update((s) => { s.profile.birthYear = v && v > 1900 && v < 2030 ? Math.round(v) : null; }); },
  heightCm(el, ctx) { const v = parseNum(el.value); ctx.update((s) => { s.profile.heightCm = v && v > 100 && v < 250 ? v : null; }); },
  async import(el, ctx) {
    const file = el.files?.[0];
    el.value = ''; // dieselbe Datei später nochmals wählbar
    if (!file) return;
    // Import ersetzt alle Daten → vorher nachfragen (Prüfbericht AA7)
    if (!(await ctx.confirm(t(sync.getUser() ? 'settings.importConfirmAccount' : 'settings.importConfirm', { name: file.name }), t('settings.import')))) return;
    try {
      store.importJSON(await file.text());
      ctx.toast(t('settings.importDone'));
    } catch {
      ctx.toast(t('settings.importFail'));
    }
  },
};
