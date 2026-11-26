// Läuft vor dem Aufbau der Seite (normales Skript im <head>, kein Modul): gewählte Farbwelt sofort setzen,
// damit nichts in der Standardfarbe aufblitzt, und die iPhone-Statusleiste passend wählen.
// iPhone (Home-Bildschirm-App): „black“ = schwarze Leiste mit weisser Schrift (Kreide, Limette),
// „default“ = helle Leiste mit dunkler Schrift (Sand). iOS liest das beim Start der App.
(function () {
  var BG = { kreide: '#121110', sand: '#F4F1EA', lime: '#0E0F11' };
  var theme = null;
  try {
    theme = localStorage.getItem('gmt-theme');
    if (!theme) theme = JSON.parse(localStorage.getItem('gmt-data-v1') || '{}').profile.theme || null;
  } catch (e) { /* kein Speicher oder noch keine Daten */ }
  if (!BG[theme]) theme = 'kreide';
  document.documentElement.setAttribute('data-theme', theme);
  var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', theme === 'sand' ? 'default' : 'black');
  var color = document.querySelector('meta[name="theme-color"]');
  if (color) color.setAttribute('content', BG[theme]);
})();

// Start abgebrochen? (direkt nach einem Update kann der Browser alte und neue Dateien mischen → ein Modul fehlt,
// die App startet nicht, nur die Leiste unten bleibt.) Dann einmal Zwischenspeicher leeren und neu laden –
// höchstens einmal pro Minute, sonst Hinweis mit Knopf. app.js setzt window.__gmtReady nach dem ersten Zeichnen.
(function () {
  var KEY = 'gmt-recover-at';
  var done = false;
  function recent() { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60000; } catch (e) { return false; } }
  function showHint(offline) {
    var v = document.getElementById('view');
    if (!v) return;
    var de = (navigator.language || 'de').slice(0, 2) !== 'en';
    var text = offline
      ? (de ? 'Ohne Internet konnte die App nicht ganz laden. Bitte mit Internet nochmals versuchen.' : 'Without internet the app could not load completely. Please try again when online.')
      : (de ? 'Die App wurde gerade aktualisiert und konnte nicht ganz laden.' : 'The app was just updated and could not load completely.');
    v.innerHTML = '<div class="boot-msg">' + text
      + '<button class="btn primary" id="boot-reload">' + (de ? 'Neu laden' : 'Reload') + '</button></div>';
    document.getElementById('boot-reload').onclick = function () { recover(true); };
  }
  function recover(force) {
    if ((done && !force) || window.__gmtReady) return; // Knopf „Neu laden“ geht immer
    done = true;
    if (!force && recent()) { showHint(); return; }
    // Zwischenspeicher nur leeren, wenn der Server erreichbar ist – sonst wäre die App offline danach ganz weg.
    // HEAD geht am Service Worker vorbei (der beantwortet nur GET) → echte Netzwerk-Antwort.
    var probe = navigator.onLine === false ? Promise.reject() : fetch('index.html', { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('offline'); });
    probe.then(function () {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { /* egal */ }
      var clear = window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve();
      return clear.catch(function () {}).then(function () { location.reload(); });
    }, function () { done = false; showHint(true); });
  }
  // Modul fehlt / passt nicht (z. B. „does not provide an export named …“, „Importing binding name … is not found“)
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    var scriptFailed = t && t.tagName === 'SCRIPT';
    var msg = String((e && e.message) || '');
    if (scriptFailed || /export named|binding name|module script|dynamically imported/i.test(msg)) setTimeout(function () { recover(false); }, 0);
  }, true);
  // Sicherheitsnetz: nach 12 s noch nicht gestartet (nur wenn sichtbar)
  setTimeout(function () { if (!window.__gmtReady && document.visibilityState === 'visible') recover(false); }, 12000);
})();
