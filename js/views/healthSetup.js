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

// Namen in der Kurzbefehle-App: immer Deutsch / Englisch (das iPhone kann anders eingestellt sein als die App)
const A = (de, en) => `<b>${esc(de)}</b> <span class="muted">/ ${esc(en)}</span>`;
const N = {
  find: A('Health-Proben suchen', 'Find Health Samples'), repeat: A('Mit jedem wiederholen', 'Repeat with Each'), text: A('Text', 'Text'),
  addVar: A('Zu Variable hinzufügen', 'Add to Variable'), item: A('Wiederholungsobjekt', 'Repeat Item'), start: A('Startdatum', 'Start Date'),
  end: A('Enddatum', 'End Date'), value: A('Wert', 'Value'), custom: A('Datumsformat → Eigenes', 'Date Format → Custom'), unit: A('Einheit', 'Unit'),
  group: A('Gruppieren nach → Tag', 'Group by → Day'), combine: A('Text kombinieren', 'Combine Text'), newLines: A('Neue Zeilen', 'New Lines'),
  date: A('Datum', 'Date'), adjust: A('Datum anpassen', 'Adjust Date'), format: A('Datum formatieren', 'Format Date'),
  url: A('Inhalte von URL abrufen', 'Get Contents of URL'), dict: A('Wörterbuchwert abrufen', 'Get Dictionary Value'), ifA: A('Wenn', 'If'),
  hasValue: A('hat einen Wert', 'has any value'), log: A('Health-Probe protokollieren', 'Log Health Sample'), stats: A('Statistik berechnen', 'Calculate Statistics'),
  duplicate: A('Duplizieren', 'Duplicate'),
};
const TYPE = {
  weight: A('Gewicht', 'Weight'), bf: A('Körperfettanteil', 'Body Fat Percentage'), steps: A('Schritte', 'Steps'), active: A('Aktivitätsenergie', 'Active Energy'),
  sleep: A('Schlaf', 'Sleep'), workouts: A('Workouts', 'Workouts'),
};

function guideSheet() {
  const url = `${SUPABASE_URL}/rest/v1/rpc/health_sync`;
  const de = t('hs.token') === 'Schlüssel';
  const L = (dText, eText) => (de ? dText : eText);
  const li = (items) => `<ol style="margin:4px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px">${items.map((x) => `<li>${x}</li>`).join('')}</ol>`;
  const textLine = (prefix, parts) => `${code(prefix)} ${parts.join(` ${code(';')} `)}`;
  const block = (type, prefix, opts = {}) => li([
    `${N.find}: ${L('Typ', 'Type')} ${type}, ${N.start} ${L('liegt in den letzten', 'is in the last')} ${code(String(opts.days || 7))} ${L('Tagen', 'days')}${opts.unit ? `, ${N.unit} ${code(opts.unit)}` : ''}${opts.group ? `, ${N.group}` : ''}.`,
    `${N.repeat} ${L('darunter einfügen.', 'below it.')}`,
    `${L('In die Wiederholung', 'Inside the repeat')}: ${N.text} → ${textLine(prefix, opts.parts)}`,
    `${L('Darunter, noch in der Wiederholung', 'Below, still inside the repeat')}: ${N.addVar} → ${code('Data')}`,
  ]);
  const dateHint = (fmt) => `${L('Beim Einfügen von', 'When inserting')} ${N.item}: ${L('antippen', 'tap it')} → ${N.start} ${L('bzw.', 'or')} ${N.end} → ${N.custom} ${code(fmt)}`;
  return `${sheetHead(t('hs.guideTitle'))}
    <div class="small muted">${esc(t('hs.guideIntro'))}</div>
    ${newToken ? `<div class="small" style="color:var(--warn)">${esc(t('hs.tokenOnce'))}</div>${copyRow(t('hs.token'), newToken, 'hs-token')}` : `<div class="small muted">${esc(t('hs.tokenHidden'))}</div>`}
    ${copyRow(t('hs.url'), url, 'hs-url')}
    ${copyRow(t('hs.apikey'), SUPABASE_KEY, 'hs-key')}
    <div>
      ${step(1, t('hs.s1'), L('Kurzbefehle → + → Name «Gym Sync». Die Schritte 2–6 sind immer gleich aufgebaut: Proben suchen → für jede eine Textzeile bauen → an die Variable «Data» anhängen. Tipp: Einen fertigen Block lange drücken → ', 'Shortcuts → + → name "Gym Sync". Steps 2–6 always work the same way: find samples → build a text line for each → add it to the variable "Data". Tip: long-press a finished block → ') + `${N.duplicate}${L(', dann nur Typ und Buchstaben ändern.', ', then only change the type and the letter.')}`)}
      ${step(2, t('hs.s2'), block(TYPE.weight, 'W;', { unit: 'kg', parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.value}`] }) + `<div class="tiny muted" style="margin-top:6px">${dateHint('yyyy-MM-dd HH:mm')}</div>`)}
      ${step(3, t('hs.s3'), block(TYPE.bf, 'F;', { parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.value}`] }))}
      ${step(4, t('hs.s4'), block(TYPE.steps, 'S;', { group: true, parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.value}`] }) + block(TYPE.active, 'A;', { group: true, unit: 'kcal', parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.value}`] }) + `<div class="tiny muted" style="margin-top:6px">${dateHint('yyyy-MM-dd')}</div>`)}
      ${step(5, t('hs.s5'), block(TYPE.sleep, 'P;', { days: 3, parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.end}`, `${N.item} → ${N.value}`] }) + `<div class="tiny muted" style="margin-top:6px">${dateHint('yyyy-MM-dd HH:mm')}</div>`)}
      ${step(6, t('hs.s6'), block(TYPE.workouts, 'T;', { parts: [`${N.item} → ${N.start}`, `${N.item} → ${N.end}`, N.item] }) + `<div class="tiny muted" style="margin-top:6px">${L('Optional für kcal, km und Puls: in derselben Wiederholung je ', 'Optional for kcal, km and heart rate: inside the same repeat, one ')}${N.find} (${TYPE.active}, ${A('Distanz (Gehen + Laufen)', 'Walking + Running Distance')}, ${A('Herzfrequenz', 'Heart Rate')}) ${L('mit Startdatum nach Workout-Start und vor Workout-Ende, dann', 'with start date after workout start and before workout end, then')} ${N.stats} ${L('(Summe bzw. Durchschnitt) und hinten an den Text', '(sum or average) and append to the text')} ${code(';kcal;km;Puls')}</div>`)}
      ${step(7, t('hs.s7'), li([`${N.date} (${L('aktuelles Datum', 'current date')})`, `${N.adjust}: ${L('1 Tag abziehen', 'subtract 1 day')}`, `${N.format}: ${L('Eigenes', 'Custom')} ${code('yyyy-MM-dd')} → ${L('Ergebnis umbenennen in', 'rename the result to')} ${code('Yesterday')}`]))}
      ${step(8, t('hs.s8'), li([`${N.combine}: ${code('Data')} ${L('mit', 'with')} ${N.newLines}`,
        `${N.url}: URL ${code(url)}`,
        `${L('Methode', 'Method')} ${code('POST')}, Headers: ${code('apikey')} = ${esc(t('hs.apikey'))}, ${code('Content-Type')} = ${code('application/json')}`,
        `${L('Anfragetext', 'Request Body')} ${code('JSON')}: ${code('token')} (Text) = ${esc(t('hs.token'))}, ${code('payload')} (Text) = ${L('kombinierter Text', 'Combined Text')}, ${code('export_date')} (Text) = ${code('Yesterday')}`]))}
      ${step(9, t('hs.s9'), li([`${N.dict}: ${code('export')} ${L('aus den URL-Inhalten', 'from the URL contents')}`,
        `${N.ifA} ${L('Wörterbuchwert', 'Dictionary Value')} ${N.hasValue}:`,
        `${L('je Wert', 'for each value')} ${N.dict} (${code('kcal')}, ${code('protein')}, ${code('carbs')}, ${code('fat')}, ${code('fiber')}, ${code('sugar')}) → ${N.log}: ${A('Nahrungsenergie', 'Dietary Energy')}, ${A('Protein', 'Protein')}, ${A('Kohlenhydrate', 'Carbohydrates')}, ${A('Fett gesamt', 'Total Fat')}, ${A('Ballaststoffe', 'Fiber')}, ${A('Zucker', 'Sugar')} – ${L('Datum: gestern', 'date: yesterday')}`]))}
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
