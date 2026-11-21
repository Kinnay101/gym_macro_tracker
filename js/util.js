// Kleine Hilfsfunktionen: Text absichern, IDs, Datum, Zahlenformat

/** Macht Text sicher für HTML (verhindert, dass Eingaben als Code laufen). */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Datum: Tage werden als "JJJJ-MM-TT" in lokaler Zeit gespeichert ----
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function today() { return dayKey(); }
/** Montag der Woche, in der der Tag liegt. */
export function weekStart(k) {
  const d = parseKey(k);
  const wd = (d.getDay() + 6) % 7; // Mo = 0
  return addDays(k, -wd);
}
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

// ---- Zahlen im Schweizer Format: 2’750 ----
const fmtCache = {};
export function num(n, dec = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  const key = dec;
  fmtCache[key] ??= new Intl.NumberFormat('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: dec });
  return fmtCache[key].format(n);
}
export function round(n, dec = 0) {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}
/** Liest Zahlen tolerant: "52,5" und "52.5" funktionieren beide. */
export function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/[’' ]/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/** Geschätztes 1RM nach Epley: kg × (1 + Wdh / 30). */
export function e1rm(kg, reps) {
  if (!kg || !reps) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

/** SVG-Symbol aus einem Pfad-String (gleicher Stil wie die Navigation). */
export function icon(paths, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}
export const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  barcode: '<path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12"/>',
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v4M6 12l3-4h5l2 4 3 1"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2.5 2 3 4 .5-3 0-5 0-7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.6 3.5 2.5 3.5 5.5"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};
