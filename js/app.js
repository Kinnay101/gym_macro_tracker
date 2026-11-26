// App-Steuerung: Seiten wechseln (#/today, #/food …), Klicks verteilen, Bottom-Sheets, Hinweise.
import * as store from './store.js';
import { t, setLang } from './i18n.js';
import * as todayView from './views/today.js';
import * as foodView from './views/food.js';
import * as foodAddView from './views/food-add.js';
import * as trainingView from './views/training.js';
import * as activeView from './views/active.js';
import * as progressView from './views/progress.js';
import * as bodyView from './views/body.js';
import * as profileView from './views/profile.js';
import * as recipeView from './views/recipe.js';
import * as sync from './sync.js';
import { THEMES } from './theme.js';
import { segRects, placeSegs } from './ui.js';
import { today } from './util.js';
import './health.js'; // verarbeitet Apple-Health-Daten nach jedem Sync

const ROUTES = {
  today: todayView,
  food: foodView,
  'food/add': foodAddView,
  training: trainingView,
  active: activeView,
  progress: progressView,
  body: bodyView,
  profile: profileView,
  recipe: recipeView,
};
const TAB_OF = { 'food/add': 'food', active: 'training', recipe: 'food' };

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');
const $sheetRoot = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

let current = { name: 'today', mod: todayView, params: {} };
let sheetRender = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { name: ROUTES[path] ? path : 'today', params };
}

// Seitenwechsel, die die App selbst auslöst (Knöpfe, Links) – alles andere ist „Zurück“ (Browser, Android-Taste)
let expectedHash = null;
let expectTimer;
function expect(hash) { expectedHash = hash; clearTimeout(expectTimer); expectTimer = setTimeout(() => { expectedHash = null; }, 1000); }
export function go(path) { expect('#/' + path); location.hash = '#/' + path; }
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (a) expect(a.getAttribute('href'));
}, true);

const ctx = {
  get state() { return store.get(); },
  get params() { return current.params; },
  update: store.update,
  go,
  render,
  openSheet,
  closeSheet,
  refreshSheet,
  toast,
  confirm: confirmDialog,
};

function render() {
  const state = store.get();
  setLang(state.profile.lang);
  document.documentElement.lang = state.profile.lang;
  applyTheme(state.profile.theme);
  updateTextZoom();
  document.querySelectorAll('#nav [data-t], #rotate [data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  const tab = TAB_OF[current.name] || current.name;
  $nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.app').classList.toggle('immersive', !!current.mod.immersive);
  const scroll = $view.scrollTop;
  const focus = rememberFocus();
  const segs = segRects($view);
  $view.innerHTML = current.mod.render(state, current.params, ctx);
  $view.scrollTop = scroll;
  placeSegs($view, segs);
  restoreFocus(focus);
  current.mod.mounted?.($view, ctx);
  if (sheetRender) refreshSheet();
}

const themeMeta = document.querySelector('meta[name="theme-color"]');
let themeApplied = false;
// Schriftvergrösserung des Systems als --tz (1 = normal, 1.3 = 130 %). Android vergrössert nur die Schrift, nicht die
// Längen → Elemente mit fester Grösse (Kalorienring) wachsen über --tz mit. Am iPhone kommt der Wert aus Dynamic Type.
function updateTextZoom() {
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 17;
  const tz = Math.max(1, Math.min(2, fs / 17)).toFixed(3);
  if (document.documentElement.style.getPropertyValue('--tz') !== tz) document.documentElement.style.setProperty('--tz', tz);
}
const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
function applyTheme(theme) {
  const th = THEMES.includes(theme) ? theme : THEMES[0];
  // Für den nächsten Start merken (js/boot.js liest das, bevor die Seite aufgebaut wird)
  try { if (localStorage.getItem('gmt-theme') !== th) localStorage.setItem('gmt-theme', th); } catch { /* egal */ }
  if (document.documentElement.dataset.theme === th && themeApplied) return;
  themeApplied = true;
  document.documentElement.dataset.theme = th;
  // iPhone-Statusleiste: Sand hell mit dunkler Schrift, sonst schwarz (wirkt ab dem nächsten Start der App)
  statusBarMeta?.setAttribute('content', th === 'sand' ? 'default' : 'black');
  // Farbe der Statusleiste / Browserleiste passend zum Hintergrund
  requestAnimationFrame(() => themeMeta?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()));
}

// Grösse geändert (Drehen, Schrift) → Hintergrund ohne Animation neu setzen
window.addEventListener('resize', () => { placeSegs($view); placeSegs($sheetRoot); });

// Beim Neuzeichnen das Feld mit der Tastatur behalten (gleiches Feld an gleicher Stelle, Cursor-Position).
// Sonst verschwindet das Feld kurz und das iPhone klappt die Tastatur zu.
const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea';
let renderedView = null; // welche Seite zuletzt gezeichnet wurde (nur auf derselben Seite das Feld behalten)
let justChanged = null;  // Feld, dessen change-Ereignis gerade verarbeitet wird (Wert kommt dann aus der App)
function rememberFocus() {
  const a = document.activeElement;
  if (renderedView !== current.name || !a || !$view.contains(a) || !a.matches(FIELDS)) return null;
  const list = [...$view.querySelectorAll(FIELDS)];
  let sel = null;
  try { sel = [a.selectionStart, a.selectionEnd]; } catch { /* z. B. type=number */ }
  return { index: list.indexOf(a), id: a.id, dataIn: a.dataset.in || null, value: a.value, keepValue: a !== justChanged, sel };
}
function restoreFocus(f) {
  renderedView = current.name;
  if (!f) return;
  const list = [...$view.querySelectorAll(FIELDS)];
  const el = (f.id && document.getElementById(f.id)) || list[f.index];
  if (!el || (el.dataset.in || null) !== f.dataIn) return;
  if (f.keepValue && el.value !== f.value) el.value = f.value; // noch nicht gespeicherte Eingabe behalten
  el.focus({ preventScroll: true });
  try { if (f.sel && f.sel[0] != null) el.setSelectionRange(f.sel[0], f.sel[1]); } catch { /* egal */ }
}

function route() {
  const { name, params } = parseHash();
  const changed = name !== current.name;
  current = { name, mod: ROUTES[name], params };
  if (changed) current.mod.enter?.(params, ctx); // Seite frisch geöffnet (z. B. Suche leeren)
  activeConfirm?.(false); // offenes Bestätigungsfenster gehört zur alten Seite (Prüfbericht AA3)
  closeSheet();
  render();
  if (changed) $view.scrollTop = 0;
}

// ---- Bottom-Sheet ----
let sheetHtml = null;
let sheetGuard = null; // () => true, wenn das Fenster geschlossen werden darf (Nutzer tippt ✕ oder daneben)
let sheetModal = false; // true: Tippen daneben schliesst nicht (Editoren: nur ✕ oder Speichern)
function openSheet(renderFn, opts = {}) {
  sheetGuard = opts.guard || null;
  sheetModal = !!opts.modal;
  sheetRender = renderFn;
  sheetHtml = null;
  $sheetRoot.innerHTML = '';
  refreshSheet();
  const first = $sheetRoot.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
}
function refreshSheet() {
  if (!sheetRender) return;
  const html = sheetRender(store.get(), ctx);
  if (html == null) return closeSheet();
  // Unverändert → nicht neu zeichnen (sonst springt das Fenster z. B. bei jedem Sync nach oben)
  if (html === sheetHtml) return;
  const old = $sheetRoot.querySelector('.sheet');
  const scroll = old ? old.scrollTop : 0;
  const segs = segRects($sheetRoot);
  sheetHtml = html;
  $sheetRoot.innerHTML = `<div class="sheet-bg" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  // Gleiches Fenster neu gezeichnet → Scrollposition behalten
  if (old) $sheetRoot.querySelector('.sheet').scrollTop = scroll;
  placeSegs($sheetRoot, segs);
}
function closeSheet() {
  sheetGuard = null;
  sheetModal = false;
  sheetRender = null;
  sheetHtml = null;
  $sheetRoot.innerHTML = '';
}

// ---- Bestätigen (eigenes Fenster statt window.confirm: das wird in manchen Umgebungen unterdrückt
// und liefert dann still „Nein“ – z. B. passierte bei „Training verwerfen“ nichts) ----
let activeConfirm = null; // schliesst das offene Bestätigungsfenster (Antwort „Nein“)
function confirmDialog(message, okLabel = t('common.ok'), { destructive = true } = {}) {
  activeConfirm?.(false);
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'confirm-bg';
    bg.innerHTML = '<div class="confirm" role="alertdialog" aria-modal="true"><div class="confirm-text"></div>'
      + '<div class="grid2"><button type="button" class="btn" data-c="0"></button><button type="button" class="btn ' + (destructive ? 'danger-fill' : 'primary') + '" data-c="1"></button></div></div>';
    bg.querySelector('.confirm-text').textContent = message;
    bg.querySelector('[data-c="0"]').textContent = t('common.cancel');
    bg.querySelector('[data-c="1"]').textContent = okLabel;
    const done = (v) => { bg.remove(); document.removeEventListener('keydown', onKey, true); if (activeConfirm === done) activeConfirm = null; resolve(v); };
    activeConfirm = done;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    bg.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-c]');
      if (b) done(b.dataset.c === '1'); else if (e.target === bg) done(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(bg);
    bg.querySelector('[data-c="0"]').focus();
  });
}

/** Fenster schliessen, wenn die Sperre es erlaubt (Sperre darf auch ein Promise liefern, z. B. Nachfrage). */
async function closeSheetGuarded() {
  const g = sheetGuard;
  if (g && !(await g())) return;
  closeSheet();
}

// ---- Hinweis unten (mit optionalem "Rückgängig") ----
let toastTimer;
function toast(msg, undo) {
  clearTimeout(toastTimer);
  $toast.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  $toast.append(span);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = t('common.undo');
    b.onclick = () => { undo(); $toast.hidden = true; };
    $toast.append(b);
  }
  $toast.hidden = false;
  toastTimer = setTimeout(() => { $toast.hidden = true; }, undo ? 5000 : 2500);
}

// ---- Ereignisse: alle Klicks/Eingaben laufen über data-act / data-in ----
function handle(kind, e) {
  const el = e.target.closest(kind === 'click' ? '[data-act]' : '[data-in]');
  if (!el) return;
  const name = kind === 'click' ? el.dataset.act : el.dataset.in;
  if (name === 'sheet-bg') { if (e.target === el && !sheetModal) closeSheetGuarded(); return; }
  if (name === 'sheet-close') { closeSheetGuarded(); return; }
  const table = kind === 'click' ? current.mod.actions : (kind === 'input' ? current.mod.inputs : current.mod.changes);
  const fn = table?.[name];
  if (fn) {
    if (kind === 'click') e.preventDefault();
    if (kind === 'change') justChanged = el;
    try { fn(el, ctx, e); } finally { if (kind === 'change') justChanged = null; }
  }
}
document.addEventListener('click', (e) => handle('click', e));
document.addEventListener('input', (e) => handle('input', e));
document.addEventListener('change', (e) => handle('change', e));
// iPhone: Nach dem Schliessen der Tastatur bleibt die Seite manchmal verschoben → zurücksetzen
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const el = document.activeElement;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) window.scrollTo(0, 0);
  }, 100);
});
window.visualViewport?.addEventListener('resize', () => {
  if (window.visualViewport.height >= window.innerHeight - 1) window.scrollTo(0, 0);
});

// Tastatur erkennen, damit Fenster (Sheets) über der Tastatur sitzen, die Leiste unten verschwindet und das gerade
// bearbeitete Feld sichtbar bleibt. Zwei Fälle:
// - iPhone: Die Tastatur legt sich über die Seite (die Seite selbst scrollt nie) → verdeckte Höhe als --kb.
// - Android-App: Die ganze Seite wird kleiner geschoben (nichts verdeckt, --kb = 0) → erkennbar daran, dass die
//   Seite beim Tippen deutlich niedriger ist als ohne Tastatur.
const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=range]), textarea';
let fullHeight = window.innerHeight; // Höhe ohne Tastatur
function updateKeyboard() {
  const vv = window.visualViewport;
  const a = document.activeElement;
  const typing = !!a?.matches?.(TYPING);
  if (!typing || window.innerHeight > fullHeight) fullHeight = window.innerHeight;
  const h = vv ? Math.round(window.innerHeight - vv.height - vv.offsetTop) : 0;
  const shrunk = typing && fullHeight - window.innerHeight > 150; // Android: Seite wurde für die Tastatur verkleinert
  const open = h > 80 || shrunk; // kleinere Differenzen = Adressleiste o. Ä., keine Tastatur
  const root = document.documentElement;
  root.style.setProperty('--kb', h > 80 ? h + 'px' : '0px');
  root.classList.toggle('kb-open', open);
  // Feld im Fenster oder auf der Seite (z. B. Sätze im Training) über die Tastatur holen
  if (open && a && a.closest?.('.sheet, .main')) requestAnimationFrame(() => a.scrollIntoView({ block: 'nearest' }));
}
window.visualViewport?.addEventListener('resize', updateKeyboard);
window.visualViewport?.addEventListener('scroll', updateKeyboard);
window.addEventListener('resize', updateKeyboard);
document.addEventListener('focusin', () => setTimeout(updateKeyboard, 300));
document.addEventListener('focusout', () => setTimeout(updateKeyboard, 300));

// iPhone: Nach dem Drehen bleibt die Seite manchmal verschoben/vergrössert → Tipper landen neben den Knöpfen.
// Darum nach jeder Drehung Scroll-Position und Zoom zurücksetzen.
const viewportMeta = document.querySelector('meta[name="viewport"]');
const baseViewport = viewportMeta?.content || '';
function resetAfterRotate() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  // Neu zeichnen erzwingen, damit iOS die Tipp-Positionen neu berechnet
  const b = document.body;
  b.style.transform = 'translateZ(0)';
  void b.offsetHeight;
  requestAnimationFrame(() => { b.style.transform = ''; });
}
function zoomReset() {
  if (!viewportMeta) return;
  viewportMeta.content = baseViewport + ', maximum-scale=1';
  setTimeout(() => { viewportMeta.content = baseViewport; }, 400);
}
let lastPortrait = matchMedia('(orientation: portrait)').matches;
function onRotate() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  if (portrait === lastPortrait) return;
  lastPortrait = portrait;
  // Die Dreh-Animation dauert unterschiedlich lange → mehrmals zurücksetzen
  zoomReset();
  for (const ms of [100, 400, 800, 1500]) setTimeout(resetAfterRotate, ms);
}
// Verschobene Ansicht auch sonst sofort zurücksetzen (Seite selbst scrollt nie, nur .main)
window.visualViewport?.addEventListener('scroll', () => { if (window.scrollY) window.scrollTo(0, 0); });
window.addEventListener('orientationchange', onRotate);
window.addEventListener('resize', onRotate);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRender) closeSheetGuarded();
});

// Fenster nach unten wegwischen (wie am iPhone). Nur wenn das Fenster ganz oben ist; Editoren fragen über die Sperre nach.
let drag = null;
$sheetRoot.addEventListener('touchstart', (e) => {
  const sh = e.target.closest('.sheet');
  if (!sh || e.touches.length !== 1 || sh.scrollTop > 0 || e.target.closest('input, textarea, select, .fat-bar')) { drag = null; return; }
  drag = { sh, y0: e.touches[0].clientY, t0: Date.now(), dy: 0 };
}, { passive: true });
$sheetRoot.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dy = e.touches[0].clientY - drag.y0;
  if (dy <= 0 || drag.sh.scrollTop > 0) { if (drag.dy) drag.sh.style.transform = ''; drag.dy = 0; return; }
  drag.dy = dy;
  drag.sh.classList.add('dragging');
  drag.sh.style.transform = `translateY(${dy}px)`;
  e.preventDefault();
}, { passive: false });
$sheetRoot.addEventListener('touchend', async () => {
  if (!drag) return;
  const { sh, dy, t0 } = drag;
  drag = null;
  sh.classList.remove('dragging');
  if (!dy) return;
  const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
  sh.classList.add('settle');
  if (dy > 120 || fast) {
    sh.style.transform = 'translateY(100%)';
    const g = sheetGuard;
    if (g && !(await g())) { sh.style.transform = ''; return; }
    setTimeout(closeSheet, 150);
  } else {
    sh.style.transform = '';
  }
});

// „Zurück“ (Android-Taste, Browser): zuerst ein offenes Bestätigungsfenster, dann ein offenes Fenster schliessen –
// die Seite bleibt (Prüfbericht AA2/AA3/K4). Editoren fragen dabei wie beim ✕ nach ungespeicherten Änderungen.
/** Zurück in der App behandeln → true, wenn etwas geschlossen wurde (sonst normal zurück). Auch für die Android-Hülle. */
function handleBack() {
  if (activeConfirm) { activeConfirm(false); return true; }
  if (sheetRender) { closeSheetGuarded(); return true; }
  return false;
}
window.__gmtBack = handleBack; // Android-App ab 1.5 fragt zuerst hier
let skipHashchange = 0;
function onHashChange() {
  if (skipHashchange) { skipHashchange--; return; }
  const intended = expectedHash === location.hash;
  expectedHash = null;
  if (!intended && (activeConfirm || sheetRender)) {
    // Browser/ältere App ist schon zurückgegangen → wieder vor (Seite bleibt), dann nur schliessen
    skipHashchange++;
    setTimeout(() => { skipHashchange = 0; }, 800); // falls es kein „vor“ gibt (Adresse von Hand geändert)
    history.forward();
    handleBack();
    return;
  }
  route();
}

store.onChange(render);
window.addEventListener('hashchange', onHashChange);
route();
window.__gmtReady = true; // Start geklappt (js/boot.js lädt sonst einmal neu)

// Tageswechsel: Bleibt die App über Mitternacht offen (oder im Hintergrund), zeigen Heute, Ernährung, Kalender usw.
// sonst weiter den Vortag. Nicht neu zeichnen, während jemand tippt – dann beim nächsten Versuch.
let shownDay = today();
function checkDay() {
  const d = today();
  if (d === shownDay) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  shownDay = d;
  render();
}
setInterval(checkDay, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDay(); });
window.addEventListener('focus', checkDay);

// Konto & Sync: Anzeige im Profil aktuell halten, nach Passwort-Link neues Passwort abfragen
let recoveryShown = false;
sync.onStatus((st) => {
  if (current.name === 'profile') {
    const el = document.getElementById('account');
    // Nicht neu zeichnen, während jemand im Login-Formular tippt
    if (!(el && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) render();
  }
  if (st.recovery && !recoveryShown) {
    recoveryShown = true;
    go('profile');
    setTimeout(() => openSheet(bodyView.recoverySheet), 50);
  }
});
// Lokale Vorschau (localhost, auch Debug-App im Emulator): Vorschau-Werkzeug mit Demo-Daten und nachgebautem Konto
// (js/devDemo.js). Online wird es nie geladen.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  import('./devDemo.js').then((m) => m.init({ sync, store, go })).catch((e) => { console.warn('Vorschau-Werkzeug', e); sync.init(); });
} else {
  sync.init();
}

// Offline-Fähigkeit (nur über http(s), nicht bei file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker nicht registriert', err));
}

// Für Tests in der Konsole
window.__gmt = { store, go, sync };
