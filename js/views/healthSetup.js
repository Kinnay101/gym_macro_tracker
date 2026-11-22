// Apple Health im Körper-Tab: Verbindung (Schlüssel) einrichten, Status, Anleitung für den Kurzbefehl
import { esc, num, icon, I } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import * as sync from '../sync.js';
import * as health from '../health.js';
import { sheetHead } from '../ui.js';
import * as shortcutGuide from './shortcutGuide.js';

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
  /**
   * Vollständige Schrittliste für eine Datenart.
   * fields: welche Werte nach dem Buchstaben kommen – 'start', 'end', 'value', 'item' (ganzes Objekt, z. B. Workout-Name)
   */
  const block = (type, prefix, opts) => {
    const fmt = opts.dateOnly ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm';
    const fieldName = { start: N.start, end: N.end, value: N.value };
    const insert = (f, i) => {
      const what = f === 'item'
        ? `${N.item} ${L('einfügen (nichts weiter auswählen – das ist der Name, z. B. «Laufen»)', 'insert (select nothing else – this is the name, e.g. "Running")')}`
        : `${N.item} ${L('einfügen, antippen →', 'insert, tap it →')} ${fieldName[f]}${f === 'start' || f === 'end' ? ` → ${N.custom} ${code(fmt)}` : ''}`;
      return (i ? `${code(';')} ${L('tippen, dann', 'type, then')} ` : '') + what;
    };
    const expected = `${prefix}${opts.example}`;
    return li([
      `${L('Unten in der Suche', 'In the search at the bottom')}: ${N.find} ${L('antippen – die Aktion landet ganz unten (unter dem letzten «End Repeat»).', 'tap it – the action lands at the very bottom (below the last "End Repeat").')}`,
      `${L('Darin', 'In it')}: ${L('Typ', 'Type')} → ${type}. ${N.start} → ${L('«is in the last»', '"is in the last"')} ${code(String(opts.days || 7))} ${code('days')}.`
        + (opts.unit ? ` ${N.unit} → ${code(opts.unit)}.` : ` ${N.unit} → ${code('None')}.`)
        + (opts.group ? ` ${N.group}.` : ` ${A('Gruppieren nach', 'Group by')} → ${code('None')}.`),
      `${N.repeat} ${L('einfügen und direkt unter diese Suche ziehen. Es muss dort «… item in» und das Ergebnis', 'add it and drag it directly below this search. It must say "… item in" and the result of')} ${L('dieser', 'this')} ${L('Suche stehen (antippen → «Clear Variable» → «Select Variable» → diese Suche antippen).', 'search (tap → "Clear Variable" → "Select Variable" → tap this search).')}`,
      `${N.text} ${L('einfügen und zwischen «Repeat with each» und «End Repeat» ziehen. Ins Textfeld', 'add it and drag it between "Repeat with each" and "End Repeat". In the text field')}: ${code(prefix)} ${L('tippen.', 'type.')}`,
      ...opts.fields.map((f, i) => `${L('Im selben Textfeld', 'In the same text field')}: ${insert(f, i)}`),
      `${N.addVar} ${L('einfügen, unter den Text ziehen (noch vor «End Repeat»), Variable', 'add it, drag it below the text (still before "End Repeat"), variable')} ${code('Data')}.`,
      `${L('Mit ▶ testen: In der Vorschau sollten Zeilen erscheinen wie', 'Test with ▶: the preview should show lines like')} ${code(expected)}${opts.note ? ` – ${opts.note}` : ''}`,
    ]);
  };
  const dupTip = `<div class="tiny muted" style="margin-top:6px">${L('Abkürzung: Den Block darüber kopieren – «Find Health Samples» und «Repeat» je lange drücken →', 'Shortcut: copy the block above – long-press "Find Health Samples" and "Repeat" →')} ${N.duplicate}${L(', dann Typ, Einstellungen und Buchstaben ändern und Punkt 3 (Repeat auf die neue Suche zeigen lassen) nicht vergessen.', ', then change type, settings and letter, and do not forget point 3 (point the repeat at the new search).')}</div>`;
  return `${sheetHead(t('hs.guideTitle'))}
    <div class="small muted">${esc(t('hs.guideIntro'))}</div>
    ${newToken ? `<div class="small" style="color:var(--warn)">${esc(t('hs.tokenOnce'))}</div>${copyRow(t('hs.token'), newToken, 'hs-token')}` : `<div class="small muted">${esc(t('hs.tokenHidden'))}</div>`}
    ${copyRow(t('hs.url'), url, 'hs-url')}
    ${copyRow(t('hs.apikey'), SUPABASE_KEY, 'hs-key')}
    ${shortcutGuide.guideHtml()}
    <div class="tiny muted">${esc(t('hs.guideOutro'))}</div>`;
}

export const actions = {
  ...shortcutGuide.actions,
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
