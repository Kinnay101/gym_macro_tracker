// Freunde & Rangliste (Teil des Fortschritt-Tabs, Umschalter "Freunde")
import { esc, num, icon, I } from '../util.js';
import { t, shortDate } from '../i18n.js';
import * as sync from '../sync.js';
import * as social from '../social.js';
import { seg, sheetHead } from '../ui.js';

let data = null; // { groups, members, stats }
let loading = false;
let error = null;
let groupId = null;
let cat = 'strength';
let liftName = null;
let showJoin = false;
let msg = null; // { key, error }
let busy = false;

export async function load(ctx, { quiet = false } = {}) {
  if (!sync.getUser() || loading) return;
  loading = true; error = null;
  if (!quiet) ctx.render();
  try {
    await social.publish().catch(() => {});
    data = await social.loadGroups();
    if (!data.groups.some((g) => g.id === groupId)) groupId = data.groups[0]?.id || null;
  } catch (e) {
    error = social.errorKey(e);
  }
  loading = false;
  ctx.render();
}

export function render(state, ctx) {
  if (!sync.isConfigured() || !sync.getUser()) {
    return card(`<div class="row">${icon(I.users)}<h2>${esc(t('friends.title'))}</h2></div>
      <div class="small muted">${esc(t('friends.needAccount'))}</div><a class="btn primary" href="#/body">${esc(t('friends.toAccount'))}</a>`);
  }
  const name = state.profile.displayName;
  if (!name) {
    return card(`<h2>${esc(t('friends.nameTitle'))}</h2><div class="small muted">${esc(t('friends.nameHint'))}</div>
      <input class="input" id="fr-name" maxlength="30" placeholder="${esc(t('friends.namePh'))}" autocomplete="nickname">
      ${message()}<button class="btn primary" data-act="fr-save-name" ${busy ? 'disabled' : ''}>${esc(t('common.save'))}</button>`);
  }
  if (!data && !error) { if (!loading) setTimeout(() => load(ctx), 0); return card(`<div class="empty"><span class="spinner"></span></div>`); }
  if (error && !data) return card(`<div class="small">${esc(t(error))}</div><button class="btn" data-act="fr-reload">${esc(t('food.retry'))}</button>`);

  const groups = data.groups;
  if (!groups.length || showJoin) return joinOrCreate(groups.length > 0);
  const g = groups.find((x) => x.id === groupId) || groups[0];
  const members = data.members.filter((m) => m.group_id === g.id);
  return `
    ${`<div class="chips">${groups.map((x) => `<button class="chip" data-act="fr-group" data-v="${esc(x.id)}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join('')}
      <button class="chip" data-act="fr-show-join">${icon(I.plus, 'icon tag-icon')} ${esc(t('friends.addGroup'))}</button></div>`}
    <section class="card tight">
      <div class="row between"><div class="grow" style="min-width:0"><div class="row" style="gap:6px"><h2 class="ellipsis">${esc(g.name)}</h2>
          <button class="icon-btn" data-act="fr-rename" data-v="${esc(g.id)}" aria-label="${esc(t('friends.rename'))}">${icon(I.edit)}</button></div>
        <div class="tiny muted">${esc(t('friends.members', { n: members.length }))}</div></div>
        ${loading ? '<span class="spinner"></span>' : `<button class="icon-btn" data-act="fr-reload" aria-label="${esc(t('friends.refresh'))}">${icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>')}</button>`}</div>
      <div class="row between" style="background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px">
        <div><div class="tiny muted">${esc(t('friends.inviteCode'))}</div><div style="font-family:var(--font-display);font-weight:700;letter-spacing:.06em">${esc(g.invite_code)}</div></div>
        <button class="btn sm" data-act="fr-share" data-code="${esc(g.invite_code)}" data-name="${esc(g.name)}">${esc(t('friends.invite'))}</button></div>
    </section>
    ${seg('fr-cat', social.CATEGORIES.map((c) => [c, t('friends.cat.' + c)]), cat)}
    ${board(state, members)}
    <div class="small muted" style="padding:0 4px">${esc(t('friends.youShare', { list: sharedList(state) }))} <a href="#/body">${esc(t('friends.change'))}</a></div>
    <button class="link danger" data-act="fr-leave" data-v="${esc(g.id)}" style="align-self:flex-start;color:var(--bad)">${esc(t('friends.leave'))}</button>`;
}

// Gruppe umbenennen (kleines Fenster)
let renameId = null;
function renameSheet() {
  const g = data?.groups.find((x) => x.id === renameId);
  if (!g) return null;
  return `${sheetHead(t('friends.rename'))}
    <label class="field">${esc(t('friends.groupName'))}<input class="input" id="fr-rename-in" maxlength="40" value="${esc(g.name)}" autofocus></label>
    <div class="tiny muted">${esc(t('friends.renameHint'))}</div>
    <div class="small" id="fr-rename-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="fr-rename-save">${esc(t('common.save'))}</button>`;
}

function card(inner) { return `<section class="card">${inner}</section>`; }
function message() { return msg ? `<div class="small" style="color:${msg.error ? 'var(--bad)' : 'var(--good)'}">${esc(t(msg.key))}</div>` : ''; }

function sharedList(state) {
  const sh = social.shareSettings(state);
  const on = social.CATEGORIES.filter((c) => sh[c]).map((c) => t('friends.cat.' + c));
  return on.length ? on.join(', ') : t('friends.nothing');
}

function joinOrCreate(canCancel) {
  return `<section class="card"><h2>${esc(t('friends.joinTitle'))}</h2><div class="small muted">${esc(t('friends.joinHint'))}</div>
      <input class="input" id="fr-code" placeholder="GYM-XXXXXX" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.06em">
      <button class="btn primary" data-act="fr-join" ${busy ? 'disabled' : ''}>${esc(t('friends.join'))}</button></section>
    <section class="card"><h2>${esc(t('friends.createTitle'))}</h2><div class="small muted">${esc(t('friends.createHint'))}</div>
      <input class="input" id="fr-group-name" maxlength="40" placeholder="${esc(t('friends.groupPh'))}">
      <button class="btn" data-act="fr-create" ${busy ? 'disabled' : ''}>${esc(t('friends.create'))}</button></section>
    ${message()}
    ${canCancel ? `<button class="btn ghost" data-act="fr-hide-join">${esc(t('common.back'))}</button>` : ''}`;
}

// ---------- Rangliste ----------
function board(state, members) {
  const me = sync.getUser().id;
  const rows = members.map((m) => ({ m, s: data.stats[m.user_id]?.stats || {}, me: m.user_id === me }));
  let ranked = [];
  let extra = '';
  if (cat === 'strength') {
    // Übungen, die mehrere teilen, zuerst
    const counts = {};
    rows.forEach((r) => Object.keys(r.s.strength || {}).forEach((n) => { counts[n] = (counts[n] || 0) + 1; }));
    const lifts = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0, 12);
    if (!lifts.includes(liftName)) liftName = lifts[0] || null;
    extra = lifts.length ? `<div class="chips">${lifts.map((n) => `<button class="chip" data-act="fr-lift" data-v="${esc(n)}" aria-pressed="${n === liftName}">${esc(n)}${counts[n] > 1 ? ` · ${counts[n]}` : ''}</button>`).join('')}</div>` : '';
    ranked = rows.map((r) => ({ ...r, v: liftName ? r.s.strength?.[liftName] : null }))
      .map((r) => ({ ...r, label: r.v != null ? `×${num(r.v, 2)}` : null, sub: r.v != null ? t('friends.ratioSub') : null }));
  } else if (cat === 'consistency') {
    ranked = rows.map((r) => {
      const c = r.s.consistency;
      return { ...r, v: c ? c.pct * 1000 + c.workouts28 : null, label: c ? `${c.pct} %` : null, sub: c ? t('friends.consSub', { n: c.workouts28, w: c.weekStreak }) : null };
    });
  } else if (cat === 'volume') {
    ranked = rows.map((r) => {
      const c = r.s.volume;
      return { ...r, v: c ? c.kg7 : null, label: c ? `${num(c.kg7)} kg` : null, sub: c ? t('friends.volSub', { n: c.sets7 }) : null };
    });
  } else {
    ranked = rows.map((r) => {
      const c = r.s.prs;
      return { ...r, v: c ? c.prs30 : null, label: c ? String(c.prs30) : null, sub: c?.recent?.length ? c.recent.map((p) => `${p.name} (${shortDate(p.date)})`).join(', ') : (c ? t('friends.noPrs') : null) };
    });
  }
  const withVal = ranked.filter((r) => r.v != null).sort((a, b) => b.v - a.v);
  const without = ranked.filter((r) => r.v == null);
  const max = Math.max(...withVal.map((r) => r.v), 0) || 1;
  const medal = (i) => ['🥇', '🥈', '🥉'][i] || String(i + 1);
  const list = withVal.map((r, i) => `<div class="item" style="${r.me ? 'background:rgba(198,244,50,.06);margin:0 -8px;padding:12px 8px;border-radius:12px' : ''}">
      <span style="width:28px;text-align:center;font-weight:700">${medal(i)}</span>
      <div class="grow"><div class="row between"><span class="ellipsis" style="font-weight:600">${esc(r.me ? t('friends.you') : r.m.display_name)}</span><b>${esc(r.label)}</b></div>
        <div class="bar" style="margin:6px 0 4px"><i style="width:${Math.max(4, (r.v / max) * 100).toFixed(1)}%;background:${r.me ? 'var(--accent)' : 'var(--muted-2)'}"></i></div>
        <div class="tiny muted ellipsis">${esc(r.sub || '')}</div></div></div>`).join('');
  const none = without.length ? `<div class="tiny muted" style="padding-top:8px">${esc(t('friends.noData'))}: ${without.map((r) => esc(r.me ? t('friends.you') : r.m.display_name)).join(', ')}</div>` : '';
  return `<section class="card tight">${extra}<div class="tiny muted">${esc(t('friends.explain.' + cat))}</div>
    ${list ? `<div class="list">${list}</div>` : `<div class="empty">${esc(t('friends.emptyBoard'))}</div>`}${none}</section>`;
}

// ---------- Aktionen ----------
async function run(ctx, fn) {
  busy = true; msg = null; ctx.render();
  try { await fn(); } catch (e) { msg = { key: social.errorKey(e), error: true }; }
  busy = false; ctx.render();
}

export const actions = {
  'fr-save-name'(el, ctx) {
    const v = document.getElementById('fr-name').value.trim();
    if (!v) return;
    run(ctx, async () => { await social.setDisplayName(v); });
  },
  'fr-reload'(el, ctx) { load(ctx); },
  'fr-rename'(el, ctx) { renameId = el.dataset.v; ctx.openSheet(renameSheet); },
  async 'fr-rename-save'(el, ctx) {
    const name = document.getElementById('fr-rename-in').value.trim();
    const err = document.getElementById('fr-rename-err');
    if (!name) { err.textContent = t('friends.errGroupName'); return; }
    el.disabled = true;
    try {
      const g = await social.renameGroup(renameId, name);
      data.groups = data.groups.map((x) => (x.id === g.id ? { ...x, name: g.name } : x));
      ctx.closeSheet();
      ctx.render();
      ctx.toast(t('friends.renamed'));
    } catch (e) {
      el.disabled = false;
      err.textContent = t(social.errorKey(e));
    }
  },
  'fr-group'(el, ctx) { groupId = el.dataset.v; ctx.render(); },
  'fr-cat'(el, ctx) { cat = el.dataset.v; ctx.render(); },
  'fr-lift'(el, ctx) { liftName = el.dataset.v; ctx.render(); },
  'fr-show-join'(el, ctx) { showJoin = true; msg = null; ctx.render(); },
  'fr-hide-join'(el, ctx) { showJoin = false; msg = null; ctx.render(); },
  'fr-join'(el, ctx) {
    const code = document.getElementById('fr-code').value.trim().toUpperCase();
    if (!/^GYM-[A-Z0-9]{6}$/.test(code)) { msg = { key: 'friends.errCode', error: true }; ctx.render(); return; }
    run(ctx, async () => {
      const g = await social.joinGroup(code);
      groupId = g.id; showJoin = false;
      data = await social.loadGroups();
      ctx.toast(t('friends.joined', { name: g.name }));
    });
  },
  'fr-create'(el, ctx) {
    const name = document.getElementById('fr-group-name').value.trim();
    if (!name) { msg = { key: 'friends.errGroupName', error: true }; ctx.render(); return; }
    run(ctx, async () => {
      const g = await social.createGroup(name);
      groupId = g.id; showJoin = false;
      data = await social.loadGroups();
      ctx.toast(t('friends.created'));
    });
  },
  async 'fr-share'(el, ctx) {
    const text = t('friends.shareText', { name: el.dataset.name, code: el.dataset.code, url: location.origin + location.pathname });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      ctx.toast(t('friends.copied'));
    } catch { /* abgebrochen */ }
  },
  async 'fr-leave'(el, ctx) {
    if (!(await ctx.confirm(t('friends.leaveConfirm'), t('friends.leave')))) return;
    run(ctx, async () => {
      await social.leaveGroup(el.dataset.v);
      data = await social.loadGroups();
      groupId = data.groups[0]?.id || null;
    });
  },
};

/** Nach Abmelden/Anmelden neu laden. */
export function reset() { data = null; error = null; groupId = null; msg = null; showJoin = false; }

// Bei Konto-Wechsel nichts vom alten Konto anzeigen
let lastUid = null;
sync.onStatus((st) => {
  const uid = st.user?.id || null;
  if (uid !== lastUid) { lastUid = uid; reset(); }
});
