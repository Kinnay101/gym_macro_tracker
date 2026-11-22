// Körper & Profil: Gewicht, Maße, Ziele, Einstellungen, Daten-Export
import { esc, num, today, daysBetween, icon, I, parseNum } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { calcGoals, goals, currentWeight, activityLevel } from '../nutrition.js';
import { header, seg, lineChart, energy, sheetHead } from '../ui.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import * as social from '../social.js';
import * as measuresView from './measures.js';
import * as healthSetup from './healthSetup.js';


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

  return `${header(t('nav.body'))}
    <section class="card">
      <div class="card-head"><div><div class="tiny muted">${esc(t('body.weight'))}</div><div class="big">${kg ? num(kg, 1) + ' kg' : '–'}</div></div>
        ${bf ? `<div style="text-align:right"><div class="tiny muted">${esc(t('measure.bf'))}</div><div class="big">${num(bf.v, 1)} %</div><div class="tiny muted">${bf.health ? '⌚ ' : ''}${esc(shortDate(bf.date))}</div></div>` : ''}</div>
      <div class="row"><input class="input grow" id="w-in" inputmode="decimal" placeholder="${esc(t('body.weightPh'))}" aria-label="${esc(t('body.weight'))}"><button class="btn primary" data-act="add-weight">${esc(t('common.save'))}</button></div>
      ${weights.length ? lineChart(pts, { unit: '' }) : ''}
      ${weights.length ? `<div class="list">${weights.slice(-4).reverse().map((w) => `<div class="item"><span class="grow small">${esc(shortDate(w.date))}</span><span style="font-weight:600">${w.source === 'health' ? '<span class="tiny muted" title="Apple Health">⌚</span> ' : ''}${num(w.kg, 1)} kg${bfOf(w.date) != null ? ` <span class="tiny muted">· ${num(bfOf(w.date), 1)} %</span>` : ''}</span>
        <button class="icon-btn" data-act="del-weight" data-date="${esc(w.date)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button></div>`).join('')}</div>` : ''}
    </section>

    ${measuresView.card(state)}


    <section class="card">
      <h3>${esc(t('body.goals'))}</h3>
      ${seg('goal', [['cut', t('goal.cut')], ['maintain', t('goal.maintain')], ['bulk', t('goal.bulk')]], p.goal)}
      <div class="grid2">
        <label class="field">${esc(t('body.sex'))}<select class="input" data-in="sex"><option value="">–</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>${esc(t('sex.m'))}</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>${esc(t('sex.f'))}</option></select></label>
        <label class="field">${esc(t('body.birthYear'))}<input class="input" inputmode="numeric" data-in="birthYear" value="${p.birthYear ?? ''}" placeholder="2004"></label>
        <label class="field">${esc(t('body.height'))}<input class="input" inputmode="numeric" data-in="heightCm" value="${p.heightCm ?? ''}" placeholder="180"></label>
      </div>
      ${activityBox(state)}
      ${calc ? `<div class="small muted">${esc(t('body.calcInfo', { bmr: num(calc.bmr), tdee: num(calc.tdee) }))}</div>` : `<div class="small muted">${esc(t('body.needData'))}</div>`}
      <div class="grid2">
        ${goalBox(t('n.kcal'), energy(state, g.kcal))}${goalBox(t('n.p'), num(g.p) + ' g')}${goalBox(t('n.c'), num(g.c) + ' g')}${goalBox(t('n.f'), num(g.f) + ' g')}
      </div>
      ${p.goalOverride
        ? `<div class="row between"><span class="tag accent">${esc(t('body.manual'))}</span><button class="link" data-act="auto-goals">${esc(t('body.backToAuto'))}</button></div>`
        : ''}
      <button class="btn sm ghost" data-act="manual-goals">${esc(t('body.setManual'))}</button>
    </section>

    <section class="card">
      <h3>${esc(t('settings.title'))}</h3>
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
    <div class="tiny muted" style="text-align:center">Gym Macro Tracker · ${esc(t('settings.version'))} 0.1</div>`;
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
    : t('body.actRhythm', { rhythm: state.profile.rhythmNames?.[state.profile.rhythm] || t('rhythm.' + state.profile.rhythm) });
  return `<div class="stack" style="gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px">
    <div class="row between"><span class="tiny muted">${esc(t('body.activity'))}</span><b>${esc(t('act.' + a.key))} · ×${num(a.factor, 3)}</b></div>
    <div class="tiny muted">${esc(how)}</div></div>`;
}

function goalBox(label, v) {
  return `<div class="stack" style="gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px"><span class="tiny muted">${esc(label)}</span><b>${esc(v)}</b></div>`;
}

function manualSheet(state) {
  const g = goals(state);
  return `${sheetHead(t('body.setManual'))}
    <div class="small muted">${esc(t('body.manualHint'))}</div>
    <div class="grid2">${[['kcal', 'n.kcal'], ['p', 'n.p'], ['c', 'n.c'], ['f', 'n.f']].map(([k, l]) => `<label class="field">${esc(t(l))}${k === 'kcal' ? ' (kcal)' : ' (g)'}<input class="input" inputmode="numeric" id="g-${k}" value="${g[k]}"></label>`).join('')}</div>
    <button class="btn primary block" data-act="save-goals">${esc(t('common.save'))}</button>`;
}


export const actions = {
  ...measuresView.actions,
  ...healthSetup.actions,
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
  'manual-goals'(el, ctx) { ctx.openSheet(manualSheet); },
  'save-goals'(el, ctx) {
    const v = (k) => parseNum(document.getElementById('g-' + k).value);
    const o = { kcal: v('kcal'), p: v('p'), c: v('c'), f: v('f') };
    if (Object.values(o).some((x) => x == null)) return;
    ctx.closeSheet();
    ctx.update((s) => { s.profile.goalOverride = o; });
  },
  'auto-goals'(el, ctx) { ctx.update((s) => { s.profile.goalOverride = null; }); },
  export() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-macro-tracker-${today()}.json`;
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
    if (!confirm(t('auth.signOutConfirm'))) return;
    try {
      await sync.signOut();
      authMsg = null;
      ctx.toast(t('auth.signedOut'));
    } catch {
      if (confirm(t('auth.signOutForce'))) { await sync.signOut({ force: true }); ctx.toast(t('auth.signedOut')); }
    }
  },
  reset(el, ctx) {
    if (!confirm(t(sync.getUser() ? 'settings.resetConfirmAccount' : 'settings.resetConfirm'))) return;
    store.resetAll();
    ctx.toast(t('settings.resetDone'));
  },
};

export const inputs = {
  'auth-email'(el) { authEmail = el.value; },
};

export const changes = {
  ...measuresView.changes,
  sex(el, ctx) { ctx.update((s) => { s.profile.sex = el.value || null; }); },
  birthYear(el, ctx) { const v = parseNum(el.value); ctx.update((s) => { s.profile.birthYear = v && v > 1900 && v < 2030 ? Math.round(v) : null; }); },
  heightCm(el, ctx) { const v = parseNum(el.value); ctx.update((s) => { s.profile.heightCm = v && v > 100 && v < 250 ? v : null; }); },
  async import(el, ctx) {
    const file = el.files?.[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      ctx.toast(t('settings.importDone'));
    } catch {
      ctx.toast(t('settings.importFail'));
    }
  },
};
