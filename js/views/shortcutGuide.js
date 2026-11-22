// Bebilderte Anleitung für den Kurzbefehl "Gym Sync": nachgezeichnete Bausteine wie in der Kurzbefehle-App.
// Bewusst keine echten Screenshots (die enthielten persönliche Gesundheitswerte, das Repo ist öffentlich).
import { esc } from '../util.js';
import { t } from '../i18n.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Beschriftungen wie in der Kurzbefehle-App – je nach Sprache des iPhones
const UI = {
  en: {
    find: 'Find', samples: 'Health Samples', where: 'where', all: 'All', allTrue: 'of the following are true', typeIs: 'Type is', startDate: 'Start Date',
    inLast: 'is in the last', days: 'days', unit: 'Unit', groupBy: 'Group by', fill: 'Fill Missing', none: 'None', day: 'Day',
    repeat: 'Repeat with each item in', endRepeat: 'End Repeat', text: 'Text', add: 'Add', to: 'to', item: 'Repeat Item', start: 'Start Date', end: 'End Date', value: 'Value',
    date: 'Date', current: 'Current Date', adjust: 'Adjust', subtract: 'Subtract', oneDay: '1 day', from: 'from', format: 'Format', custom: 'Custom',
    combine: 'Combine', with: 'with', newLines: 'New Lines', combined: 'Combined Text', getContents: 'Get contents of', method: 'Method', headers: 'Headers', body: 'Request Body',
    get: 'Get', valueFor: 'Value for', inW: 'in', contents: 'Contents of URL', dict: 'Dictionary Value', ifW: 'If', hasAny: 'has any value', endIf: 'End If',
    log: 'Log', sampleWith: 'sample with', atDate: 'at', show: 'Show', quickLook: 'in Quick Look', formatted: 'Formatted Date', adjusted: 'Adjusted Date', yesterday: 'Yesterday',
    weight: 'Weight', bf: 'Body Fat Percentage', steps: 'Steps', active: 'Active Energy', sleep: 'Sleep', exercise: 'Exercise Minutes', distance: 'Walking + Running Distance', energy: 'Dietary Energy',
    protein: 'Protein', carbs: 'Carbohydrates', fat: 'Total Fat', fiber: 'Fiber', sugar: 'Sugar',
  },
  de: {
    find: 'Suche', samples: 'Health-Proben', where: 'wo', all: 'Alle', allTrue: 'der folgenden Bedingungen erfüllt sind', typeIs: 'Typ ist', startDate: 'Startdatum',
    inLast: 'liegt in den letzten', days: 'Tagen', unit: 'Einheit', groupBy: 'Gruppieren nach', fill: 'Fehlende auffüllen', none: 'Keine', day: 'Tag',
    repeat: 'Mit jedem Objekt wiederholen in', endRepeat: 'Wiederholung beenden', text: 'Text', add: 'Füge', to: 'hinzu zu', item: 'Wiederholungsobjekt', start: 'Startdatum', end: 'Enddatum', value: 'Wert',
    date: 'Datum', current: 'Aktuelles Datum', adjust: 'Datum anpassen', subtract: 'Subtrahiere', oneDay: '1 Tag', from: 'von', format: 'Formatiere', custom: 'Eigenes',
    combine: 'Kombiniere', with: 'mit', newLines: 'Neue Zeilen', combined: 'Kombinierter Text', getContents: 'Inhalte abrufen von', method: 'Methode', headers: 'Header', body: 'Anfragetext',
    get: 'Hole', valueFor: 'Wert für', inW: 'in', contents: 'Inhalte der URL', dict: 'Wörterbuchwert', ifW: 'Wenn', hasAny: 'einen Wert hat', endIf: 'Ende Wenn',
    log: 'Protokolliere', sampleWith: 'Probe mit', atDate: 'am', show: 'Zeige', quickLook: 'in Übersicht', formatted: 'Formatiertes Datum', adjusted: 'Angepasstes Datum', yesterday: 'Yesterday',
    weight: 'Gewicht', bf: 'Körperfettanteil', steps: 'Schritte', active: 'Aktivitätsenergie', sleep: 'Schlaf', exercise: 'Trainingsminuten', distance: 'Gehen- und Laufdistanz', energy: 'Nahrungsenergie',
    protein: 'Protein', carbs: 'Kohlenhydrate', fat: 'Fett gesamt', fiber: 'Ballaststoffe', sugar: 'Zucker',
  },
};

let phoneLang = 'en';
let openStep = 1;
export function setPhoneLang(l) { phoneLang = l; }

// ---------- Bausteine ----------
const ICON = { health: '❤️', repeat: '🔁', text: '📝', variable: '𝑥', look: '👁', date: '📅', url: '🌐', dict: '📖', ifI: '⑂', log: '❤️' };
const tok = (s, cls = '') => `<span class="sc-tok ${cls}">${esc(s)}</span>`;
const vtok = (s, kind = 'repeat', cls = '') => `<span class="sc-tok ${cls}"><i class="sc-vi sc-vi-${kind}">${kind === 'var' ? 'x' : kind === 'health' ? '❤' : kind === 'text' ? '≡' : '⟳'}</i>${esc(s)}</span>`;
const lit = (s) => `<span class="sc-lit">${esc(s)}</span>`;
const chg = (html) => `<span class="sc-chg">${html}</span>`; // was geändert werden muss
const card = (icon, head, rows = '', cls = '') => `<div class="sc-card ${cls}"><div class="sc-head"><span class="sc-ic">${icon}</span><span>${head}</span></div>${rows}</div>`;
const row = (html) => `<div class="sc-row">${html}</div>`;
const indent = (html) => `<div class="sc-indent">${html}</div>`;

function findCard(u, o) {
  const c = (key, html) => (o.changed?.includes(key) ? chg(html) : html);
  return card(ICON.health, `${u.find} ${tok(u.samples)} ${u.where} ${tok(u.all)} ${u.allTrue}`,
    row(`${u.typeIs} ${c('type', tok(o.type))}`)
    + row(`${u.startDate} ${tok(u.inLast)} ${c('days', tok(String(o.days || 7)))} ${tok(u.days)}`)
    + (o.noUnit ? '' : row(`<span class="grow">${u.unit}</span>${c('unit', `<span class="sc-link">${esc(o.unit || u.none)}</span>`)}`)
    + row(`<span class="grow">${u.groupBy}</span>${c('group', `<span class="sc-link">${esc(o.group ? u.day : u.none)}</span>`)}`))
    + (o.group ? row(`<span class="grow">${u.fill}</span>${c('group', '<span class="sc-switch"></span>')}`) : ''));
}

function loopBlock(u, o) {
  const fields = o.fields.map((f) => {
    if (f === 'item') return vtok(u.item);
    return vtok(f === 'start' ? u.start : f === 'end' ? u.end : u.value);
  });
  const text = [lit(o.prefix), ...fields.flatMap((x, i) => (i ? [lit(';'), x] : [x]))].join('');
  return card(ICON.repeat, `${u.repeat} ${vtok(u.samples, 'health', o.changed?.includes('repeat') ? 'sc-chg-tok' : '')}`, '', 'sc-repeat')
    + indent(card(ICON.text, u.text, `<div class="sc-text">${o.changed?.includes('text') ? chg(text) : text}</div>`)
      + card(`<i class="sc-vi sc-vi-var">x</i>`, `${u.add} ${vtok(u.text, 'text')} ${u.to} ${tok('Data')}`))
    + card(ICON.repeat, u.endRepeat, '', 'sc-repeat');
}

/** Das Fenster, das beim Antippen von «Start Date» im Text erscheint */
function datePanel(u, fmt, ends) {
  const example = fmt.includes('HH') ? '2026-09-15 09:41' : '2026-09-15';
  const check = '<span style="color:#64a8ff">✓</span>';
  return `<div class="sc-panel">
    <div class="sc-panel-title">⟳ ${esc(u.item)}</div>
    <div class="sc-card" style="padding:0 12px">
      ${row(`<span class="grow">${esc(u.value)}</span>`).replace('sc-row', 'sc-row sc-row-first')}
      ${row(`<span class="grow">${esc(u.start)}</span>${check}`)}
      ${ends ? row(`<span class="grow">${esc(u.end)}</span><span class="tiny" style="color:#8e8e93">${ends}</span>`) : ''}
    </div>
    <div class="sc-card" style="padding:0 12px">
      ${row(`<span class="grow">Date Format</span><span class="sc-pill">${esc(u.custom)} ⌃</span>`).replace('sc-row', 'sc-row sc-row-first')}
      ${row(`<span class="sc-fmt">${esc(fmt)}</span>`)}
    </div>
    <div class="sc-example">Example: ${esc(example)}</div>
  </div>`;
}

const resultLine = (s) => `<div class="sc-result">${esc(s)}</div>`;

// ---------- Schritte ----------
function steps(u, token) {
  const de = t('hs.token') === 'Schlüssel';
  const L = (a, b) => (de ? a : b);
  const dupHint = L('Block darüber kopieren: die Suche und den Repeat je lange drücken → «Duplicate». Dann nur das <b>Markierte</b> ändern.',
    'Copy the block above: long-press the search and the repeat → "Duplicate". Then change only what is <b>highlighted</b>.');
  const repointHint = L('Die kopierte Wiederholung verbindet sich normalerweise selbst mit der neuen Suche darüber. Kontrolle: blaues «Health Samples» antippen → «Reveal Action» muss zur neuen Suche springen. Falls nicht: «Clear Variable» → «Select Variable» → neue Suche antippen.',
    'The copied repeat normally connects itself to the new search above. Check: tap the blue "Health Samples" → "Reveal Action" must jump to the new search. If not: "Clear Variable" → "Select Variable" → tap the new search.');
  const dateHint = (fmt, both) => L(`Im Text «${u.start}»${both ? ` und «${u.end}»` : ''} antippen und so einstellen (Format genau so eintippen, mit Bindestrichen${fmt.includes('HH') ? ', Leerzeichen und Doppelpunkt' : ''}):`,
    `In the text tap "${u.start}"${both ? ` and "${u.end}"` : ''} and set it like this (type the format exactly, with dashes${fmt.includes('HH') ? ', space and colon' : ''}):`);
  const withDate = (fmt, both) => `<div class="small">${dateHint(fmt, both)}</div>${datePanel(u, fmt, both ? L('genauso', 'same') : '')}`;
  const valueHint = L(`Zweites «${u.item}» antippen → <b>${u.value}</b>`, `Tap the second "${u.item}" → <b>${u.value}</b>`);
  return [
    { title: L('Gewicht', 'Weight'), body: findCard(u, { type: u.weight, unit: 'kg' }) + loopBlock(u, { prefix: 'W;', fields: ['start', 'value'] }) + withDate('yyyy-MM-dd HH:mm'),
      notes: [L('Aktionen über die Suche unten einfügen und in diese Reihenfolge ziehen.', 'Add actions via the search at the bottom and drag them into this order.'), valueHint], result: 'W;2026-11-17 23:26;72' },
    { title: L('Körperfett', 'Body fat'), body: findCard(u, { type: u.bf, changed: ['type', 'unit'] }) + loopBlock(u, { prefix: 'F;', fields: ['start', 'value'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd HH:mm'),
      notes: [dupHint, repointHint], result: 'F;2026-11-17 23:26;12.2' },
    { title: L('Schritte', 'Steps'), body: findCard(u, { type: u.steps, group: true, changed: ['type', 'group'] }) + loopBlock(u, { prefix: 'S;', fields: ['start', 'value'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd'),
      notes: [dupHint, repointHint, L('Hier ohne Uhrzeit. «Fill Missing» aus lassen.', 'Here without time. Leave "Fill Missing" off.')], result: 'S;2026-11-16;15129' },
    { title: L('Aktive Energie', 'Active energy'), body: findCard(u, { type: u.active, unit: 'kcal', group: true, changed: ['type', 'unit'] }) + loopBlock(u, { prefix: 'A;', fields: ['start', 'value'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd'),
      notes: [L('Den Schritte-Block kopieren.', 'Copy the steps block.'), repointHint], result: 'A;2026-11-16;612' },
    { title: L('Schlaf', 'Sleep'), body: findCard(u, { type: u.sleep, days: 3, noUnit: true, changed: ['type', 'days'] }) + loopBlock(u, { prefix: 'P;', fields: ['start', 'end', 'value'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd HH:mm', true),
      notes: [L('Den Gewicht-Block kopieren (mit Uhrzeit).', 'Copy the weight block (with time).'), repointHint, L(`Im Text nach «${u.start}» ein «;» und ein weiteres «${u.item}» → «${u.end}» einfügen. Schlaf hat keine «Unit» und kein «Group by» – das ist richtig.`, `In the text, after "${u.start}" add ";" and another "${u.item}" → "${u.end}". Sleep has no "Unit" and no "Group by" – that is correct.`)], result: 'P;2026-11-21 23:10;2026-11-22 01:30;Core' },
    { title: L('Trainingsminuten', 'Exercise minutes'), body: findCard(u, { type: u.exercise, unit: 'min', group: true, changed: ['type', 'unit'] }) + loopBlock(u, { prefix: 'E;', fields: ['start', 'value'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd'),
      notes: [L('Den Schritte-Block kopieren.', 'Copy the steps block.'), repointHint, L('Statt einzelner Workouts (die kann Kurzbefehle nicht lesen): die Minuten des grünen Rings pro Tag – zählt auch Gym-Training.', 'Instead of single workouts (Shortcuts cannot read them): the minutes of the green ring per day – gym training counts too.')], result: 'E;2026-11-16;52' },
    { title: L('Datum von gestern', "Yesterday's date"), body:
        card(ICON.date, `${u.date} ${tok(u.current)}`)
        + card(ICON.date, `${u.adjust}: ${chg(tok(u.subtract))} ${chg(tok(u.oneDay))} ${u.from} ${vtok(u.date, 'date')}`)
        + card(ICON.date, `${u.format} ${vtok(u.adjusted, 'date')}`, row(`<span class="grow">Date Format</span>${chg(`<span class="sc-link">${u.custom}</span>`)}`) + row(chg('<span class="sc-fmt" style="outline:0">yyyy-MM-dd</span>'))),
      notes: [
        L('<b>Wozu:</b> Ergibt das Datum von gestern als Text (z. B. 2026-11-21). Damit weiss die App, von welchem Tag sie die Kalorien zurückgeben soll.', '<b>Why:</b> produces yesterday’s date as text (e.g. 2026-11-21) so the app knows which day’s calories to send back.'),
        L('Unter dem letzten Block (über dem Quick Look) nacheinander einfügen: <b>Date</b>, <b>Adjust Date</b>, <b>Format Date</b>.', 'Below the last block (above Quick Look) add one after another: <b>Date</b>, <b>Adjust Date</b>, <b>Format Date</b>.'),
        L('Bei «Adjust Date»: «Add» antippen → <b>Subtract</b>, dann <b>1</b> und <b>days</b>.', 'In "Adjust Date": tap "Add" → <b>Subtract</b>, then <b>1</b> and <b>days</b>.'),
        L('Bei «Format Date»: Date Format → <b>Custom</b> → <code>yyyy-MM-dd</code>. Das Ergebnis heisst automatisch «Formatted Date».', 'In "Format Date": Date Format → <b>Custom</b> → <code>yyyy-MM-dd</code>. The result is automatically called "Formatted Date".'),
      ] },
    { title: L('Senden', 'Send'), body: (() => {
        const url = SUPABASE_URL + '/rest/v1/rpc/health_sync';
        const copyBtn = (v) => `<button type="button" class="btn sm" data-act="hs-copy" data-v="${esc(v)}">${L('Kopieren', 'Copy')}</button>`;
        // Formular wie auf dem iPhone: links Key, rechts Text
        const kv = (k, v, minus = true) => `<div class="sc-kv">${minus ? '<span class="sc-minus">−</span>' : ''}<span class="sc-k">${k}</span><span class="sc-v">${v}</span></div>`;
        const addRow = (label) => `<div class="sc-kv sc-add"><span class="sc-plus">+</span><span>${esc(label)}</span></div>`;
        const form = card(ICON.url, `${u.getContents} <span class="sc-tok" style="white-space:normal;word-break:break-all">${esc(url)}</span>`,
          row(`<span class="grow">${u.method}</span><span class="sc-link">POST</span>`)
          + row(`<span class="grow">${u.headers}</span><span>⌄</span>`)
          + `<div class="sc-kvs">${kv('apikey', esc(SUPABASE_KEY))}${kv('Content-Type', 'application/json')}${addRow('Add new header')}</div>`
          + row(`<span class="grow">${u.body}</span><span class="sc-link">JSON</span>`)
          + `<div class="sc-kvs">${kv('token', L('dein Schlüssel', 'your key'))}${kv('payload', vtok(u.combined, 'text'))}${kv('export_date', vtok(u.formatted, 'date'))}${addRow('Add new field')}</div>`);
        // Was wohin – mit Kopieren-Knöpfen
        const fill = (n, what, value, extra = '') => `<div class="sc-fill"><span class="sc-num">${n}</span><div class="grow"><div class="small">${what}</div>${value ? `<code class="sc-val">${esc(value)}</code>` : ''}${extra}</div>${value && !extra ? copyBtn(value) : ''}</div>`;
        const steps8 = [
          fill('A', L('<b>Combine Text</b>: «Text» antippen → Variable <b>Data</b> (oranges x). Separator: <b>New Lines</b>.', '<b>Combine Text</b>: tap "Text" → variable <b>Data</b> (orange x). Separator: <b>New Lines</b>.')),
          fill('B', L('<b>Get Contents of URL</b> einfügen, ins URL-Feld diese Adresse einfügen (ganz, ohne Punkte):', 'Add <b>Get Contents of URL</b>, paste this address into the URL field (complete, no dots):'), url),
          fill('C', L('Auf den Pfeil ⌄ tippen. <b>Method</b> → <b>POST</b>.', 'Tap the arrow ⌄. <b>Method</b> → <b>POST</b>.')),
          fill('D', L('<b>Headers</b>, erste Zeile: Key <code>apikey</code>, Text:', '<b>Headers</b>, first row: Key <code>apikey</code>, Text:'), SUPABASE_KEY),
          fill('E', L('<b>Add new header</b>: Key <code>Content-Type</code>, Text:', '<b>Add new header</b>: Key <code>Content-Type</code>, Text:'), 'application/json'),
          fill('F', L('<b>Request Body</b> → <b>JSON</b>. <b>Add new field</b> → <b>Text</b>: Key <code>token</code>, Text = dein Schlüssel:', '<b>Request Body</b> → <b>JSON</b>. <b>Add new field</b> → <b>Text</b>: Key <code>token</code>, Text = your key:'),
            token || '', token ? '' : `<div class="tiny" style="color:var(--warn)">${L('Schlüssel nicht mehr sichtbar? Fenster schliessen → «Neuer Schlüssel». Dann steht er hier zum Kopieren.', 'Key no longer visible? Close this window → "New key". Then it appears here to copy.')}</div>`),
          fill('G', L('<b>Add new field</b> → <b>Text</b>: Key <code>payload</code>, beim Text über der Tastatur die Variable <b>Combined Text</b> antippen.', '<b>Add new field</b> → <b>Text</b>: Key <code>payload</code>, for the text tap the variable <b>Combined Text</b> above the keyboard.')),
          fill('H', L('<b>Add new field</b> → <b>Text</b>: Key <code>export_date</code>, Text = Variable <b>Formatted Date</b>.', '<b>Add new field</b> → <b>Text</b>: Key <code>export_date</code>, text = variable <b>Formatted Date</b>.')),
        ].join('');
        return `${card(ICON.text, `${u.combine} ${vtok('Data', 'var')} ${u.with} ${tok(u.newLines)}`)}${form}<div class="small" style="margin-top:4px"><b>${L('So füllst du es aus', 'How to fill it in')}</b></div>${steps8}`;
      })(),
      notes: [
        L('<b>Wozu:</b> Schickt alle Zeilen mit deinem Schlüssel an dein Konto. Als Antwort kommen die Kalorien und Makros von gestern zurück.', '<b>Why:</b> sends all lines with your key to your account. The answer contains yesterday’s calories and macros.'),
        L('<b>Test:</b> Beim Quick Look «Data» antippen → Clear Variable → <b>Contents of URL</b> wählen, dann ▶. Es sollte <code>{"ok":true,"lines":…}</code> erscheinen.', '<b>Test:</b> in Quick Look tap "Data" → Clear Variable → choose <b>Contents of URL</b>, then ▶. It should show <code>{"ok":true,"lines":…}</code>.'),
      ] },
    { title: L('Kalorien nach Apple Health', 'Calories to Apple Health'), body: (() => {
        const fill = (n, what) => `<div class="sc-fill"><span class="sc-num">${n}</span><div class="grow small">${what}</div></div>`;
        const pair = (key, type, unit) => card(ICON.dict, `${u.get} ${tok(u.valueFor)} ${chg(tok(key))} ${u.inW} ${vtok(u.dict, 'dict')}`)
          + card(ICON.log, `${u.log} ${chg(tok(type))} ${u.sampleWith} ${vtok(u.dict, 'dict')} ${chg(tok(unit))} ${u.atDate} ${vtok(u.adjusted, 'date')}`);
        const visual = card(ICON.dict, `${u.get} ${tok(u.valueFor)} ${chg(tok('export'))} ${u.inW} ${vtok(u.contents, 'url')}`)
          + card(ICON.ifI, `${u.ifW} ${vtok(u.dict, 'dict')} ${chg(tok(u.hasAny))}`)
          + indent(pair('kcal', u.energy, 'kcal') + `<div class="sc-more">${L('… und gleich für', '… and the same for')}: protein → ${esc(u.protein)} (g) · carbs → ${esc(u.carbs)} (g) · fat → ${esc(u.fat)} (g) · fiber → ${esc(u.fiber)} (g) · sugar → ${esc(u.sugar)} (g)</div>`)
          + card(ICON.ifI, `<span class="muted">Otherwise</span>`, '', 'sc-repeat')
          + card(ICON.ifI, u.endIf, '', 'sc-repeat');
        const list = [
          fill('A', L('<b>Get Dictionary Value</b> hinzufügen, auf <b>Key</b> tippen → <code>export</code>.', 'Add <b>Get Dictionary Value</b>, tap <b>Key</b> → <code>export</code>.')),
          fill('B', L('<b>If</b> hinzufügen. Eingabe antippen → in der Liste <b>Dictionary Value</b> wählen. «has any value» steht meist schon drin.', 'Add <b>If</b>. Tap the input → choose <b>Dictionary Value</b> in the list. "has any value" is usually already set.')),
          fill('C', L('Zwischen «If» und «Otherwise»: <b>Get Dictionary Value</b> hinzufügen, Key → <code>kcal</code>. Bei «in» → <b>Dictionary Value</b> wählen.', 'Between "If" and "Otherwise": add <b>Get Dictionary Value</b>, Key → <code>kcal</code>. For "in" choose <b>Dictionary Value</b>.')),
          fill('D', L('Darunter <b>Log Health Sample</b>: <b>Dietary Energy</b>, Einheit <b>kcal</b>, Datum → <b>Adjusted Date</b>.', 'Below it <b>Log Health Sample</b>: <b>Dietary Energy</b>, unit <b>kcal</b>, date → <b>Adjusted Date</b>.')),
          fill('E', L('C und D duplizieren (je lange drücken → Duplicate) für <code>protein</code> → Protein, <code>carbs</code> → Carbohydrates, <code>fat</code> → Total Fat, <code>fiber</code> → Fiber, <code>sugar</code> → Sugar (Einheit <b>g</b>).', 'Duplicate C and D (long-press → Duplicate) for <code>protein</code> → Protein, <code>carbs</code> → Carbohydrates, <code>fat</code> → Total Fat, <code>fiber</code> → Fiber, <code>sugar</code> → Sugar (unit <b>g</b>).')),
          fill('F', L('<b>Nach jeder Kopie prüfen</b> (blaues Feld antippen → <b>Reveal Action</b>):<br>• «Get Value for …» → <b>in</b> muss ganz nach oben zu <b>«Get Value for export»</b> springen.<br>• «Log Health Sample» → <b>Value</b> muss zur «Get Value for …» <b>direkt darüber</b> springen.',
            '<b>Check after every copy</b> (tap the blue field → <b>Reveal Action</b>):<br>• "Get Value for …" → <b>in</b> must jump all the way up to <b>"Get Value for export"</b>.<br>• "Log Health Sample" → <b>Value</b> must jump to the "Get Value for …" <b>directly above</b>.')),
          fill('G', L('Springt es falsch: Feld antippen → <b>Clear Variable</b> → aufs leere Feld → <b>Select Variable</b> → die richtige Aktion antippen (bei «in»: nach oben scrollen zu «Get Value for export»). Die Variablen-Liste zeigt nur das letzte «Dictionary Value» – darum über «Select Variable».',
            'If it jumps wrong: tap the field → <b>Clear Variable</b> → tap the empty field → <b>Select Variable</b> → tap the right action (for "in": scroll up to "Get Value for export"). The variable list only shows the latest "Dictionary Value" – that is why you use "Select Variable".')),
          fill('H', L('Zwischen «Otherwise» und «End If» bleibt alles leer. Quick Look ganz nach unten unter «End If» schieben.', 'Leave everything between "Otherwise" and "End If" empty. Move Quick Look to the very bottom below "End If".')),
        ].join('');
        return `${visual}<div class="small" style="margin-top:4px"><b>${L('So baust du es', 'How to build it')}</b></div>${list}`;
      })(),
      notes: [
        L('<b>Wozu:</b> Die Antwort vom Senden enthält «export» mit den Summen von gestern. Diese Aktionen tragen sie in Apple Health ein – wie Lifesum. Ist gestern nichts eingetragen, bleibt «export» leer und es passiert nichts.', '<b>Why:</b> the answer from sending contains "export" with yesterday’s totals. These actions log them to Apple Health – like Lifesum. If nothing was logged yesterday, "export" is empty and nothing happens.'),
        L('<b>Test:</b> Jeder Tag wird nur einmal zurückgegeben. Beim ersten ▶ landen die Werte in Health (Health → Ernährung → Nahrungsenergie, Datum gestern); beim zweiten ▶ kommt nichts mehr – das ist richtig.', '<b>Test:</b> each day is returned only once. The first ▶ puts the values into Health (Health → Nutrition → Dietary Energy, yesterday); a second ▶ returns nothing – that is correct.'),
      ] },
    { title: L('Jeden Morgen automatisch', 'Every morning automatically'), body: (() => {
        const fill = (n, what) => `<div class="sc-fill"><span class="sc-num">${n}</span><div class="grow small">${what}</div></div>`;
        const tabs = `<div class="sc-tabs"><span>Shortcuts</span><span class="sc-tab-on">Automation</span><span>Gallery</span></div>`;
        return `<div class="sc-flow">${L('Ganz unten in der Kurzbefehle-App:', 'At the very bottom of the Shortcuts app:')}${tabs}</div>`
          + [
            fill('A', L('Vorher einmal den Kurzbefehl mit <b>▶</b> laufen lassen und den Health-Zugriff erlauben.', 'First run the shortcut once with <b>▶</b> and allow Health access.')),
            fill('B', L('Im Kurzbefehl oben links <b>←</b> antippen – du bist in der Liste aller Kurzbefehle.', 'In the shortcut tap <b>←</b> top left – you are in the list of all shortcuts.')),
            fill('C', L('Unten den Reiter <b>Automation</b> antippen, dann oben rechts <b>+</b> (oder «New Automation»).', 'Tap the <b>Automation</b> tab at the bottom, then <b>+</b> top right (or "New Automation").')),
            fill('D', L('<b>Time of Day</b> wählen → Uhrzeit z. B. <b>07:00</b>, <b>Daily</b>.', 'Choose <b>Time of Day</b> → time e.g. <b>07:00</b>, <b>Daily</b>.')),
            fill('E', L('Unten <b>Run Immediately</b> wählen (sonst fragt das iPhone jeden Morgen).', 'At the bottom choose <b>Run Immediately</b> (otherwise the iPhone asks every morning).')),
            fill('F', L('<b>Next</b> → <b>Gym Sync</b> antippen → fertig. Quick Look im Kurzbefehl kannst du jetzt löschen.', '<b>Next</b> → tap <b>Gym Sync</b> → done. You can now delete the Quick Look in the shortcut.')),
          ].join('');
      })(),
      notes: [L('Danach läuft alles von selbst: jeden Morgen kommen die Daten in die App, und die Kalorien von gestern landen in Apple Health.', 'After that everything runs by itself: every morning the data arrives in the app and yesterday’s calories land in Apple Health.')] },
  ];
}

/** HTML der Anleitung (Teil des Sheets in healthSetup.js) */
export function guideHtml(token = null) {
  const u = UI[phoneLang];
  const de = t('hs.token') === 'Schlüssel';
  const list = steps(u, token);
  return `<div class="row between"><span class="small muted">${de ? 'Sprache deines iPhones' : 'Your iPhone language'}</span>
      <div class="seg" style="min-width:160px">${[['en', 'English'], ['de', 'Deutsch']].map(([k, l]) => `<button type="button" data-act="sc-lang" data-v="${k}" aria-pressed="${phoneLang === k}">${l}</button>`).join('')}</div></div>
    <div class="tiny muted">${de ? 'Farbig umrandet = das musst du einstellen/ändern. Jeder Schritt lässt sich aufklappen.' : 'Outlined in colour = what you need to set/change. Tap a step to open it.'}</div>
    ${list.map((s, i) => {
      const n = i + 1;
      const open = n === openStep;
      return `<div class="sc-step ${open ? 'open' : ''}">
        <button type="button" class="sc-step-head" data-act="sc-step" data-v="${n}" aria-expanded="${open}"><span class="sc-num">${n}</span><span class="grow">${esc(s.title)}</span><span class="muted">${open ? '−' : '+'}</span></button>
        ${open ? `<div class="sc-step-body">${s.body}
          <ul class="sc-notes">${s.notes.map((x) => `<li>${x}</li>`).join('')}</ul>
          ${s.result ? `<div class="tiny muted">${de ? 'Test mit ▶ – im Quick Look erscheint z. B.:' : 'Test with ▶ – Quick Look shows e.g.:'}</div>${resultLine(s.result)}` : ''}
          ${n < list.length ? `<button type="button" class="btn sm block" data-act="sc-step" data-v="${n + 1}">${de ? 'Weiter' : 'Next'} → ${esc(list[n].title)}</button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('')}`;
}

export const actions = {
  'sc-lang'(el, ctx) { phoneLang = el.dataset.v; ctx.refreshSheet(); },
  'sc-step'(el, ctx) {
    const n = Number(el.dataset.v);
    openStep = openStep === n ? 0 : n;
    ctx.refreshSheet();
    setTimeout(() => document.querySelector('.sc-step.open')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  },
};
