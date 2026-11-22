// Apple Health im Körper-Tab: Verbindung (Schlüssel) einrichten, Status, Anleitung für den Kurzbefehl
import { esc, num, icon, I } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import * as sync from '../sync.js';
import * as health from '../health.js';
import { sheetHead } from '../ui.js';

let status = { loaded: false, row: null, error: null };
let newToken = null; // nur direkt nach dem Erstellen sichtbar

export async function loadStatus(ctx) {
  if (!sync.getUser()) return;
  try { status = { loaded: true, row: await health.connectionStatus(), error: null }; } catch (e) { status = { loaded: true, row: null, error: e.message }; }
  ctx.render();
}

const fmtTime = (iso) => (iso ? `${shortDate(iso.slice(0, 10))}, ${new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}` : '–');

export function card(state, ctx) {
  const head = `<h3>${esc(t('settings.health'))}</h3>`;
  if (!sync.isConfigured() || !sync.getUser()) return `<section class="card tight">${head}<div class="small muted">${esc(t('hs.needAccount'))}</div></section>`;
  if (!status.loaded) { setTimeout(() => loadStatus(ctx), 0); return `<section class="card tight">${head}<div class="empty"><span class="spinner"></span></div></section>`; }
  if (status.error) return `<section class="card tight">${head}<div class="small muted">${esc(t('hs.notSetupDb'))}</div></section>`;
  const r = status.row;
  if (!r) {
    return `<section class="card tight">${head}<div class="small muted">${esc(t('hs.intro'))}</div>
      <button class="btn primary" data-act="hs-connect">${esc(t('hs.connect'))}</button></section>`;
  }
  const lastData = state.healthLastImport;
  return `<section class="card tight">${head}
    <div class="small">${esc(t('hs.connected'))}</div>
    <div class="tiny muted">${esc(t('hs.lastRun', { time: fmtTime(r.last_used) }))}<br>${esc(t('hs.lastData', { time: fmtTime(lastData) }))}${r.last_export ? `<br>${esc(t('hs.lastExport', { date: shortDate(r.last_export) }))}` : ''}</div>
    <div class="grid2"><button class="btn sm" data-act="hs-guide">${esc(t('hs.guide'))}</button><button class="btn sm" data-act="hs-connect">${esc(t('hs.newKey'))}</button></div>
    <button class="link" data-act="hs-disconnect" style="align-self:flex-start;color:var(--bad)">${esc(t('hs.disconnect'))}</button>
  </section>`;
}

// ---------- Anleitung ----------
const copyRow = (label, value, id) => `<div class="stack" style="gap:4px"><span class="tiny muted">${esc(label)}</span>
  <div class="row"><code class="grow ellipsis" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px" id="${id}">${esc(value)}</code>
  <button class="btn sm" data-act="hs-copy" data-v="${esc(value)}">${esc(t('hs.copy'))}</button></div></div>`;

function step(n, title, body) {
  return `<div class="stack" style="gap:4px;padding:10px 0;border-top:1px solid var(--line)"><b>${n}. ${esc(title)}</b><div class="small" style="line-height:1.5">${body}</div></div>`;
}
const code = (s) => `<code style="background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:1px 5px;font-size:12px">${esc(s)}</code>`;

function guideSheet() {
  const url = `${SUPABASE_URL}/rest/v1/rpc/health_sync`;
  const loop = (type, prefix, extra) => `${esc(t('hs.findSamples'))} ${code(type)}${extra || ''}. ${esc(t('hs.repeatWith'))} ${code(prefix + ';')} + ${esc(t('hs.startDate'))} + ${code(';')} + ${esc(t('hs.repeatItem'))}.`;
  return `${sheetHead(t('hs.guideTitle'))}
    <div class="small muted">${esc(t('hs.guideIntro'))}</div>
    ${newToken ? `<div class="small" style="color:var(--warn)">${esc(t('hs.tokenOnce'))}</div>${copyRow(t('hs.token'), newToken, 'hs-token')}` : `<div class="small muted">${esc(t('hs.tokenHidden'))}</div>`}
    ${copyRow(t('hs.url'), url, 'hs-url')}
    ${copyRow(t('hs.apikey'), SUPABASE_KEY, 'hs-key')}
    <div>
      ${step(1, t('hs.s1'), esc(t('hs.s1b')))}
      ${step(2, t('hs.s2'), `${loop('Gewicht', 'W')}<br>${esc(t('hs.dateFormat'))} ${code('yyyy-MM-dd HH:mm')}. ${esc(t('hs.addToVar'))}`)}
      ${step(3, t('hs.s3'), loop('Körperfettanteil', 'F'))}
      ${step(4, t('hs.s4'), `${loop('Schritte', 'S', ` – ${esc(t('hs.groupDay'))}`)}<br>${loop('Aktivitätsenergie', 'A', ` – ${esc(t('hs.groupDay'))}`)}`)}
      ${step(5, t('hs.s5'), `${esc(t('hs.findSamples'))} ${code('Schlafanalyse')} ${esc(t('hs.last3'))}. ${esc(t('hs.repeatWith'))} ${code('P;')} + ${esc(t('hs.startDate'))} + ${code(';')} + ${esc(t('hs.endDate'))} + ${code(';')} + ${esc(t('hs.repeatItem'))}.`)}
      ${step(6, t('hs.s6'), `${esc(t('hs.findSamples'))} ${code('Workouts')} ${esc(t('hs.last7'))}. ${esc(t('hs.repeatWith'))} ${code('T;')} + ${esc(t('hs.startDate'))} + ${code(';')} + ${esc(t('hs.endDate'))} + ${code(';')} + ${esc(t('hs.repeatItem'))}.<br><span class="muted">${esc(t('hs.s6opt'))}</span>`)}
      ${step(7, t('hs.s7'), esc(t('hs.s7b')))}
      ${step(8, t('hs.s8'), `${esc(t('hs.s8b'))}<br>URL: ${code(url)}<br>${esc(t('hs.method'))}: ${code('POST')}<br>Header: ${code('apikey')} = ${esc(t('hs.apikey'))}, ${code('Content-Type')} = ${code('application/json')}<br>${esc(t('hs.body'))}: ${code('token')} = ${esc(t('hs.token'))}, ${code('payload')} = ${esc(t('hs.combined'))}, ${code('export_date')} = ${esc(t('hs.yesterdayVar'))}`)}
      ${step(9, t('hs.s9'), esc(t('hs.s9b')))}
      ${step(10, t('hs.s10'), esc(t('hs.s10b')))}
    </div>
    <div class="tiny muted">${esc(t('hs.guideOutro'))}</div>`;
}

export const actions = {
  async 'hs-connect'(el, ctx) {
    if (status.row && !confirm(t('hs.newKeyConfirm'))) return;
    try {
      newToken = await health.createToken();
      await loadStatus(ctx);
      ctx.openSheet(guideSheet);
    } catch (e) {
      ctx.toast(t('hs.error'));
    }
  },
  'hs-guide'(el, ctx) { ctx.openSheet(guideSheet); },
  async 'hs-copy'(el, ctx) {
    try { await navigator.clipboard.writeText(el.dataset.v); ctx.toast(t('hs.copied')); } catch { ctx.toast(t('hs.copyFail')); }
  },
  async 'hs-disconnect'(el, ctx) {
    if (!confirm(t('hs.disconnectConfirm'))) return;
    try { await health.disconnect(); newToken = null; await loadStatus(ctx); } catch { ctx.toast(t('hs.error')); }
  },
};

/** Nach Konto-Wechsel neu laden */
let lastUid = null;
sync.onStatus((st) => { const uid = st.user?.id || null; if (uid !== lastUid) { lastUid = uid; status = { loaded: false, row: null, error: null }; newToken = null; } });
