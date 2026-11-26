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
