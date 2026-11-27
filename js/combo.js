// Eigene Auswahlliste für Textfelder (z. B. Ziel einer Übung): Feld antippen → darunter klappt die Liste der
// vorhandenen Werte auf, Tippen filtert, Antippen übernimmt. Neue Werte einfach eintippen.
//
// Warum nicht <input list>/<datalist>: das sieht auf jedem Gerät anders aus (iPhone: Vorschläge über der Tastatur,
// Android-App/WebView: klappt evtl. gar nicht auf). Die Werte stehen trotzdem in einem <datalist> (unsichtbar),
// das Feld zeigt mit data-combo="<id>" darauf.
//
//   <input class="input" data-in="…" data-combo="ex-targets"> … <datalist id="ex-targets">…</datalist>
//
// Gewählt wird über ein normales input-Ereignis → die bestehenden data-in-Handler bekommen den Wert wie beim Tippen.
import { esc } from './util.js';
import { t } from './i18n.js';

let box = null; // offene Liste
let cur = null; // Feld, zu dem sie gehört
let selecting = false;

function values(input) {
  const dl = document.getElementById(input.dataset.combo);
  return dl ? [...dl.options].map((o) => o.value).filter(Boolean) : [];
}

function close() {
  box?.remove();
  box = null;
  cur = null;
}

// showAll: beim Antippen alle Werte zeigen (auch wenn schon etwas drinsteht), gefiltert wird erst beim Tippen
function draw(input, showAll = false) {
  const typed = input.value.trim().toLowerCase();
  const q = showAll ? '' : typed;
  const all = values(input);
  const hits = all.filter((v) => !q || v.toLowerCase().includes(q)).slice(0, 40);
  const isNew = typed && !showAll && !all.some((v) => v.toLowerCase() === typed);
  if (!hits.length && !isNew) { close(); return; }
  const parent = input.parentElement;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  if (!box || box.parentElement !== parent) {
    box?.remove();
    box = document.createElement('div');
    box.className = 'combo-list';
    box.setAttribute('role', 'listbox');
    parent.append(box);
  }
  box.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
  box.style.left = `${input.offsetLeft}px`;
  box.style.width = `${input.offsetWidth}px`;
  box.innerHTML = hits.map((v) => `<button type="button" class="combo-opt" role="option" data-v="${esc(v)}" aria-selected="${v.toLowerCase() === typed}">${esc(v)}</button>`).join('')
    + (isNew ? `<div class="combo-new">${esc(t('combo.new', { v: input.value.trim() }))}</div>` : '');
  cur = input;
  // Aktuellen Wert in der Liste zeigen, Liste ganz sichtbar machen (z. B. unten im Fenster)
  const sel = box.querySelector('[aria-selected="true"]');
  if (sel) box.scrollTop = Math.max(0, sel.offsetTop - 44);
  requestAnimationFrame(() => box?.scrollIntoView({ block: 'nearest' }));
}

function pick(opt) {
  const input = cur;
  if (!input) return;
  input.value = opt.dataset.v;
  close();
  selecting = true;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  selecting = false;
}

document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el.matches?.('input[data-combo]')) draw(el, true);
  else if (box && !box.contains(el)) close();
});
document.addEventListener('input', (e) => {
  if (!selecting && e.target.matches?.('input[data-combo]')) draw(e.target);
});
// Auswahl erst beim Klick (= Loslassen ohne Wischen): so lässt sich die Liste mit dem Finger scrollen, und der Tipp
// landet nicht auf dem, was unter der Liste liegt (früher: Auswahl beim Berühren → Liste weg → Klick traf „Speichern“).
document.addEventListener('pointerdown', (e) => {
  if (box && !box.contains(e.target) && e.target !== cur) close();
}, true);
// Maus: Feld behält den Fokus, wenn man in die Liste klickt
document.addEventListener('mousedown', (e) => { if (box?.contains(e.target)) e.preventDefault(); }, true);
document.addEventListener('click', (e) => {
  const opt = e.target.closest?.('.combo-opt');
  if (!opt || !box?.contains(opt)) return;
  e.preventDefault();
  e.stopPropagation();
  pick(opt);
}, true);
document.addEventListener('focusout', (e) => {
  if (e.target !== cur) return;
  setTimeout(() => { if (cur && document.activeElement !== cur) close(); }, 200);
});
// Escape schliesst zuerst die Liste (nicht das ganze Fenster), Enter übernimmt das Getippte
document.addEventListener('keydown', (e) => {
  if (!box || e.target !== cur) return;
  if (e.key === 'Escape') { e.stopPropagation(); close(); }
  if (e.key === 'Enter') close();
}, true);
