// Bebilderte Anleitung für den Kurzbefehl "Gym Sync": nachgezeichnete Bausteine wie in der Kurzbefehle-App.
// Bewusst keine echten Screenshots (die enthielten persönliche Gesundheitswerte, das Repo ist öffentlich).
import { esc } from '../util.js';
import { t } from '../i18n.js';

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
    weight: 'Weight', bf: 'Body Fat Percentage', steps: 'Steps', active: 'Active Energy', sleep: 'Sleep', workouts: 'Workouts', energy: 'Dietary Energy',
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
    weight: 'Gewicht', bf: 'Körperfettanteil', steps: 'Schritte', active: 'Aktivitätsenergie', sleep: 'Schlaf', workouts: 'Workouts', energy: 'Nahrungsenergie',
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
function steps(u) {
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
    { title: 'Workouts', body: findCard(u, { type: u.workouts, noUnit: true, changed: ['type'] }) + loopBlock(u, { prefix: 'T;', fields: ['start', 'end', 'item'], changed: ['text', 'repeat'] }) + withDate('yyyy-MM-dd HH:mm', true),
      notes: [L('Den Schlaf-Block kopieren.', 'Copy the sleep block.'), repointHint, L(`Das letzte Feld ist das ganze «${u.item}» (der Name, z. B. Running) – nichts auswählen.`, `The last field is the whole "${u.item}" (the name, e.g. Running) – select nothing.`)], result: 'T;2026-11-21 18:02;2026-11-21 18:47;Running' },
    { title: L('Datum von gestern', "Yesterday's date"), body:
        card(ICON.date, `${u.date} ${tok(u.current)}`)
        + card(ICON.date, `${u.adjust}: ${tok(u.subtract)} ${tok(u.oneDay)} ${u.from} ${vtok(u.date, 'date')}`)
        + card(ICON.date, `${u.format} ${vtok(u.adjusted, 'date')}`, row(`<span class="grow">Date Format</span><span class="sc-link">${u.custom}</span>`) + row(`<span class="sc-lit">yyyy-MM-dd</span>`)),
      notes: [L('Unter «Format Date»: Ergebnis antippen → <b>Rename</b> → <code>Yesterday</code>.', 'Below "Format Date": tap the result → <b>Rename</b> → <code>Yesterday</code>.')] },
    { title: L('Senden', 'Send'), body:
        card(ICON.text, `${u.combine} ${vtok('Data', 'var')} ${u.with} ${tok(u.newLines)}`)
        + card(ICON.url, `${u.getContents} ${tok('…/rest/v1/rpc/health_sync')}`,
          row(`<span class="grow">${u.method}</span>${tok('POST')}`)
          + row(`<span class="grow">${u.headers}</span>${tok('apikey')} ${tok('Content-Type')}`)
          + row(`<span class="grow">${u.body}</span>${tok('JSON')}`)
          + row(`${tok('token')} ${tok('payload')} ${tok('export_date')}`)),
      notes: [L('URL, apikey und token oben kopieren. Content-Type = <code>application/json</code>.', 'Copy URL, apikey and token from above. Content-Type = <code>application/json</code>.'),
        L(`JSON-Felder sind «Text»: token = Schlüssel, payload = ${u.combined}, export_date = Yesterday.`, `JSON fields are "Text": token = key, payload = ${u.combined}, export_date = Yesterday.`)] },
    { title: L('Kalorien nach Apple Health', 'Calories to Apple Health'), body:
        card(ICON.dict, `${u.get} ${tok(u.valueFor)} ${tok('export')} ${u.inW} ${vtok(u.contents, 'url')}`)
        + card(ICON.ifI, `${u.ifW} ${vtok(u.dict, 'dict')} ${tok(u.hasAny)}`)
        + indent(card(ICON.dict, `${u.get} ${tok(u.valueFor)} ${tok('kcal')} ${u.inW} ${vtok(u.dict, 'dict')}`)
          + card(ICON.log, `${u.log} ${tok(u.energy)} ${u.sampleWith} ${vtok(u.dict, 'dict')} ${u.atDate} ${vtok(u.adjusted, 'date')}`)
          + `<div class="sc-more">+ protein → ${esc(u.protein)} · carbs → ${esc(u.carbs)} · fat → ${esc(u.fat)} · fiber → ${esc(u.fiber)} · sugar → ${esc(u.sugar)}</div>`)
        + card(ICON.ifI, u.endIf),
      notes: [L('Für jeden Wert dieselben zwei Aktionen (Wert holen → protokollieren). Die zweite «Get Value» holt aus dem Ergebnis der ersten.', 'Same two actions for each value (get value → log). The inner "Get Value" reads from the result of the first one.')] },
    { title: L('Jeden Morgen automatisch', 'Every morning automatically'), body:
        `<div class="sc-flow">${L('Automation', 'Automation')} → + → ${L('Tageszeit', 'Time of Day')} <b>07:00</b> → ${L('Täglich', 'Daily')} → <b>${L('Sofort ausführen', 'Run Immediately')}</b> → Gym Sync</div>`,
      notes: [L('Vorher einmal mit ▶ testen und Health-Zugriff erlauben. Quick Look am Schluss löschen.', 'First test once with ▶ and allow Health access. Delete the Quick Look at the end.')] },
  ];
}

/** HTML der Anleitung (Teil des Sheets in healthSetup.js) */
export function guideHtml() {
  const u = UI[phoneLang];
  const de = t('hs.token') === 'Schlüssel';
  const list = steps(u);
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
