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
import * as sync from './sync.js';

const ROUTES = {
  today: todayView,
  food: foodView,
  'food/add': foodAddView,
  training: trainingView,
  active: activeView,
  progress: progressView,
  body: bodyView,
};
const TAB_OF = { 'food/add': 'food', active: 'training' };

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

export function go(path) { location.hash = '#/' + path; }

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
};

function render() {
  const state = store.get();
  setLang(state.profile.lang);
  document.documentElement.lang = state.profile.lang;
  $nav.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  const tab = TAB_OF[current.name] || current.name;
  $nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.app').classList.toggle('immersive', !!current.mod.immersive);
  const scroll = $view.scrollTop;
  $view.innerHTML = current.mod.render(state, current.params, ctx);
  $view.scrollTop = scroll;
  current.mod.mounted?.($view, ctx);
  if (sheetRender) refreshSheet();
}

function route() {
  const { name, params } = parseHash();
  const changed = name !== current.name;
  current = { name, mod: ROUTES[name], params };
  closeSheet();
  render();
  if (changed) $view.scrollTop = 0;
}

// ---- Bottom-Sheet ----
function openSheet(renderFn) {
  sheetRender = renderFn;
  refreshSheet();
  const first = $sheetRoot.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
}
function refreshSheet() {
  if (!sheetRender) return;
  const html = sheetRender(store.get(), ctx);
  if (html == null) return closeSheet();
  $sheetRoot.innerHTML = `<div class="sheet-bg" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
}
function closeSheet() {
  sheetRender = null;
  $sheetRoot.innerHTML = '';
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
  if (name === 'sheet-bg') { if (e.target === el) closeSheet(); return; }
  if (name === 'sheet-close') { closeSheet(); return; }
  const table = kind === 'click' ? current.mod.actions : (kind === 'input' ? current.mod.inputs : current.mod.changes);
  const fn = table?.[name];
  if (fn) {
    if (kind === 'click') e.preventDefault();
    fn(el, ctx, e);
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRender) closeSheet();
});

store.onChange(render);
window.addEventListener('hashchange', route);
route();

// Konto & Sync: Anzeige im Körper-Tab aktuell halten, nach Passwort-Link neues Passwort abfragen
let recoveryShown = false;
sync.onStatus((st) => {
  if (current.name === 'body') {
    const el = document.getElementById('account');
    // Nicht neu zeichnen, während jemand im Login-Formular tippt
    if (!(el && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) render();
  }
  if (st.recovery && !recoveryShown) {
    recoveryShown = true;
    go('body');
    setTimeout(() => openSheet(bodyView.recoverySheet), 50);
  }
});
sync.init();

// Offline-Fähigkeit (nur über http(s), nicht bei file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker nicht registriert', err));
}

// Für Tests in der Konsole
window.__gmt = { store, go, sync };
