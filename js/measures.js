// Körpermasse: Bezeichnungen, Reihenfolge, und Übernahme aus Text-Notizen.
//
// Schlüssel = Körperteil + Seite + Spannung, z. B. 'bicepsRFlex' = Bizeps rechts angespannt,
// 'waist' = Bauch/Taille, 'calfL' = Wade links. Ein Eintrag pro Datum:
// { date, status?, bf? (Körperfett %), bicepsR?, bicepsL?, … } – Werte in cm.
import { t } from './i18n.js';
import { dayKey, parseNum } from './util.js';

export const PARTS = ['shoulders', 'chest', 'waist', 'hips', 'neck', 'biceps', 'forearm', 'thigh', 'calf'];

/** Zeilen im Formular: [Zeilenname, [Schlüssel…]] – Paare = links | rechts */
export const FORM_ROWS = [
  ['shoulders', ['shoulders']],
  ['chest', ['chest']],
  ['waist', ['waist']],
  ['hips', ['hips']],
  ['biceps', ['bicepsL', 'bicepsR']],
  ['bicepsFlex', ['bicepsLFlex', 'bicepsRFlex']],
  ['forearmFlex', ['forearmLFlex', 'forearmRFlex']],
  ['thigh', ['thighL', 'thighR']],
  ['calf', ['calfL', 'calfR']],
];

export const STATUS_SUGGESTIONS = ['Start of Cut', 'End of Cut', 'Start of Bulk', 'End of Bulk', 'Maintain'];

const KEY_RE = /^([a-z]+?)(R|L)?(Flex)?$/;

/** Alle Mass-Schlüssel eines Eintrags (ohne date/status/bf), in sinnvoller Reihenfolge. */
export function measureKeys(entry) {
  const order = FORM_ROWS.flatMap(([, keys]) => keys);
  const keys = Object.keys(entry).filter((k) => KEY_RE.test(k) && PARTS.includes(k.match(KEY_RE)[1]) && typeof entry[k] === 'number');
  return keys.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

/** Lesbare Bezeichnung, z. B. "Bizeps rechts angespannt". */
export function measureLabel(key) {
  const [, part, side, flex] = key.match(KEY_RE) || [null, key];
  return [t('measure.' + part), side ? t(side === 'R' ? 'measure.right' : 'measure.left') : '', flex ? t('measure.flexed') : ''].filter(Boolean).join(' ');
}

// ---------- Übernahme aus Notizen ----------
// Versteht z. B.:
//   06.07.2025
//   Status: End of Cut
//   Weight: 64.2kg
//   Bodyfat: 9.5%
//   Bizep right flexed 35cm
// Mehrere Einträge hintereinander (jeweils mit Datum) gehen auch. Deutsch und Englisch.
const PART_WORDS = [
  [/schulter|shoulder/, 'shoulders'],
  [/unterarm|forearm|fore arm/, 'forearm'],
  [/bizep|bicep|oberarm|upper arm|\barm\b/, 'biceps'],
  [/brust|chest/, 'chest'],
  [/taille|bauch|waist|belly|abdomen/, 'waist'],
  [/h(ü|ue|u)fte|hip|po\b|glute/, 'hips'],
  [/hals|neck/, 'neck'],
  [/oberschenkel|thigh|thight|leg\b/, 'thigh'],
  [/wade|waden|calf|calves/, 'calf'],
];

function partOf(label) {
  for (const [re, part] of PART_WORDS) if (re.test(label)) return part;
  return null;
}

export function parseNotes(text) {
  const entries = [];
  let cur = null;
  const unknown = [];
  const start = (date) => { cur = { date }; entries.push(cur); };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const d = line.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/);
    if (d) {
      const y = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
      start(dayKey(new Date(y, Number(d[2]) - 1, Number(d[1]))));
      continue;
    }
    const iso = line.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) { start(`${iso[1]}-${iso[2]}-${iso[3]}`); continue; }
    if (!cur) start(dayKey());
    const low = line.toLowerCase();
    const status = line.match(/^(status|phase)\s*:?\s*(.+)$/i);
    if (status) { cur.status = status[2].trim(); continue; }
    const weight = low.match(/^(weight|gewicht)\s*:?\s*([\d.,]+)\s*(kg)?/);
    if (weight) { cur.weight = parseNum(weight[2]); continue; }
    const bf = low.match(/^(body\s*fat|bodyfat|kfa|körperfett|koerperfett|fat)\s*:?\s*([\d.,]+)\s*%?/);
    if (bf) { cur.bf = parseNum(bf[2]); continue; }
    const m = low.match(/^(.*?)[:\s]+([\d]+[.,]?\d*)\s*(cm)?\s*$/);
    const part = m && partOf(m[1]);
    if (!part) { unknown.push(line); continue; }
    const side = /\b(right|rechts|re|r)\b/.test(m[1]) ? 'R' : /\b(left|links|li|l)\b/.test(m[1]) ? 'L' : '';
    const flex = /flex|angespannt|gespannt|pump/.test(m[1]) ? 'Flex' : '';
    cur[part + side + flex] = parseNum(m[2]);
  }
  return { entries: entries.filter((e) => Object.keys(e).length > 1), unknown };
}
