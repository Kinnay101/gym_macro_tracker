// Feedback-Karte im Körper-Tab: Bug melden / Idee vorschlagen, eigene Einträge ansehen.
// Admins sehen alle Einträge und setzen Status und Antwort.
import { esc, icon, I, dayKey } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { sheetHead, seg } from '../ui.js';
import * as sync from '../sync.js';
import * as fb from '../feedback.js';

let items = null;     // Einträge vom Server (null = noch nicht geladen)
let admin = false;
let loadedFor = null; // Konto, für das geladen wurde
let loading = false;
let error = null;     // i18n-Schlüssel
let kind = 'bug';
let draft = '';       // aktueller Text im Formular
let draftAtOpen = ''; // Text beim Öffnen (Vorlage bleibt gleich, sonst springt das Textfeld bei jedem Neuzeichnen)
let busy = false;

async function load(ctx) {
  const user = sync.getUser();
  if (!user || loading) return;
  loading = true; error = null;
  ctx.refreshSheet();
  try {
    if (loadedFor !== user.id) admin = await fb.isAdmin();
    items = await fb.list();
    loadedFor = user.id;
  } catch (e) {
    error = fb.errorKey(e);
  }
  loading = false;
  ctx.render();
}

export function card(state, ctx) {
  const head = `<h3>${esc(t('fb.title'))}</h3><div class="small muted">${esc(t('fb.hint'))}</div>`;
  if (!sync.isConfigured()) return '';
  const user = sync.getUser();
  if (!user) return `<section class="card tight" id="feedback">${head}<div class="small muted">${esc(t('fb.needAccount'))}</div></section>`;
  if (loadedFor !== user.id && !loading && !error) setTimeout(() => load(ctx), 0);
  const mine = items && loadedFor === user.id ? items : [];
  const fresh = admin ? mine.filter((x) => x.status === 'new').length : 0;
  return `<section class="card tight" id="feedback">${head}
    <div class="grid2"><button class="btn" data-act="fb-write" data-v="bug">${esc(t('fb.bug'))}</button>
      <button class="btn" data-act="fb-write" data-v="idea">${esc(t('fb.idea'))}</button></div>
    ${mine.length || admin ? `<button class="btn ghost sm" data-act="fb-list">${esc(t(admin ? 'fb.all' : 'fb.mine', { n: mine.length }))}${fresh ? ` <span class="tag accent">${esc(t('fb.newCount', { n: fresh }))}</span>` : ''}</button>` : ''}
    ${error ? `<div class="small" style="color:var(--bad)">${esc(t(error))}</div>` : ''}
  </section>`;
}

function writeSheet() {
  return `${sheetHead(t('fb.writeTitle'))}
    ${seg('fb-kind', fb.KINDS.map((k) => [k, t('fb.kind.' + k)]), kind)}
    <textarea class="input" id="fb-text" data-in="fb-text" maxlength="2000" style="min-height:150px;padding:10px 12px;line-height:1.45" placeholder="${esc(t(kind === 'bug' ? 'fb.bugPh' : 'fb.ideaPh'))}" autofocus>${esc(draftAtOpen)}</textarea>
    <div class="tiny muted">${esc(t('fb.privacy'))}</div>
    <button class="btn primary block" data-act="fb-send" ${busy ? 'disabled' : ''}>${esc(t('fb.send'))}</button>`;
}

function localDay(iso) { return dayKey(new Date(iso)); }

function entry(x) {
  const user = sync.getUser();
  const own = x.user_id === user?.id;
  const meta = [shortDate(localDay(x.created_at)), admin ? (x.author_name || t('fb.anon')) : null, admin && x.app_version ? x.app_version : null].filter(Boolean).join(' · ');
  // Erledigt grün, Geplant blau, Abgelehnt rot, Neu grau
  const statusTag = `<span class="tag ${{ done: 'accent', planned: 'blue', rejected: 'red' }[x.status] || ''}">${esc(t('fb.status.' + x.status))}</span>`;
  const answerBox = admin
    ? `<div class="stack" style="gap:6px">
        <select class="input" id="fb-st-${esc(x.id)}" aria-label="Status">${fb.STATUSES.map((s) => `<option value="${s}" ${s === x.status ? 'selected' : ''}>${esc(t('fb.status.' + s))}</option>`).join('')}</select>
        <textarea class="input" id="fb-re-${esc(x.id)}" maxlength="1000" style="min-height:60px;padding:8px 12px;font-size:14px" placeholder="${esc(t('fb.replyPh'))}">${esc(x.reply || '')}</textarea>
        <button class="btn sm" data-act="fb-answer" data-id="${esc(x.id)}">${esc(t('common.save'))}</button></div>`
    : (x.reply ? `<div class="small" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px"><b>${esc(t('fb.reply'))}:</b> ${esc(x.reply)}</div>` : '');
  return `<div class="stack" style="gap:8px;padding:12px 0;border-top:1px solid var(--line)">
    <div class="row between"><div class="row" style="gap:6px"><span class="tag">${esc(t('fb.kind.' + x.kind))}</span>${statusTag}</div>
      ${own || admin ? `<button class="icon-btn" data-act="fb-del" data-id="${esc(x.id)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button>` : ''}</div>
    <div class="tiny muted">${esc(meta)}</div>
    <div class="small" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.body)}</div>
    ${answerBox}
  </div>`;
}

function listSheet() {
  const head = `<div class="row between"><h2>${esc(t(admin ? 'fb.listTitleAll' : 'fb.listTitleMine'))}</h2>
    <div class="row" style="gap:4px">${loading ? '<span class="spinner"></span>' : `<button class="icon-btn" data-act="fb-reload" aria-label="${esc(t('fb.refresh'))}">${icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>')}</button>`}
      <button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button></div></div>`;
  if (error) return `${head}<div class="small" style="color:var(--bad)">${esc(t(error))}</div>`;
  if (!items) return `${head}<div class="empty"><span class="spinner"></span></div>`;
  if (!items.length) return `${head}<div class="empty">${esc(t('fb.empty'))}</div>`;
  return `${head}<div class="stack" style="gap:0">${items.map(entry).join('')}</div>`;
}

export const actions = {
  'fb-write'(el, ctx) {
    kind = el.dataset.v === 'idea' ? 'idea' : 'bug';
    draftAtOpen = draft;
    ctx.openSheet(writeSheet);
  },
  'fb-kind'(el, ctx) {
    kind = el.dataset.v;
    draftAtOpen = document.getElementById('fb-text')?.value ?? draft;
    ctx.refreshSheet();
  },
  async 'fb-send'(el, ctx) {
    const text = (document.getElementById('fb-text')?.value || '').trim();
    if (text.length < 3) { ctx.toast(t('fb.tooShort')); return; }
    busy = true; draftAtOpen = text; ctx.refreshSheet();
    try {
      const row = await fb.submit(kind, text);
      items = [row, ...(items || [])];
      draft = ''; draftAtOpen = '';
      busy = false;
      ctx.closeSheet();
      ctx.render();
      ctx.toast(t('fb.sent'));
    } catch (e) {
      busy = false;
      ctx.refreshSheet();
      ctx.toast(t(fb.errorKey(e)));
    }
  },
  'fb-list'(el, ctx) {
    ctx.openSheet(listSheet);
    load(ctx);
  },
  'fb-reload'(el, ctx) { load(ctx); },
  async 'fb-answer'(el, ctx) {
    const id = el.dataset.id;
    const status = document.getElementById('fb-st-' + id)?.value;
    const reply = document.getElementById('fb-re-' + id)?.value || '';
    try {
      const row = await fb.answer(id, status, reply);
      items = items.map((x) => (x.id === id ? row : x));
      ctx.render();
      ctx.toast(t('fb.saved'));
    } catch (e) {
      ctx.toast(t(fb.errorKey(e)));
    }
  },
  async 'fb-del'(el, ctx) {
    if (!confirm(t('fb.deleteConfirm'))) return;
    const id = el.dataset.id;
    try {
      await fb.remove(id);
      items = items.filter((x) => x.id !== id);
      ctx.render();
      ctx.toast(t('fb.deleted'));
    } catch (e) {
      ctx.toast(t(fb.errorKey(e)));
    }
  },
};

export const inputs = {
  'fb-text'(el) { draft = el.value; },
};

// Nach Abmelden/Kontowechsel nichts vom alten Konto zeigen
sync.onStatus((st) => {
  if (!st.user || (loadedFor && st.user.id !== loadedFor)) { items = null; admin = false; loadedFor = null; error = null; }
});
