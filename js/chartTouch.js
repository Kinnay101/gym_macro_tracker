// Werte in Diagrammen ablesen (wie in Apple Health): kurz halten oder antippen → senkrechte Linie beim nächsten Punkt/Balken
// mit genauem Wert und Datum; Finger seitlich ziehen → Linie springt mit von Punkt zu Punkt. Senkrecht wischen scrollt
// weiterhin die Seite (touch-action: pan-y). Die Anzeige bleibt stehen, bis man ausserhalb tippt oder ein anderes
// Diagramm wählt. Daten: Attribut data-pts am <svg class="chart"> (siehe barChart/lineChart in js/ui.js).
const NS = 'http://www.w3.org/2000/svg';
let active = null; // { svg, pts }

function el(name, attrs, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

function clear() {
  if (!active) return;
  active.svg.querySelector('.scrub')?.remove();
  active.svg.querySelectorAll('.col.sel').forEach((r) => r.classList.remove('sel'));
  active = null;
}

function svgX(svg, clientX) {
  const p = svg.createSVGPoint();
  p.x = clientX; p.y = 0;
  return p.matrixTransform(svg.getScreenCTM().inverse()).x;
}

function show(svg, pts, clientX) {
  if (!pts.length) return;
  const x = svgX(svg, clientX);
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  if (active?.svg !== svg) clear();
  active = { svg, pts };
  svg.querySelector('.scrub')?.remove();
  svg.querySelectorAll('.col.sel').forEach((r) => r.classList.remove('sel'));
  svg.querySelector(`.col[data-x="${best.x.toFixed(1)}"]`)?.classList.add('sel');
  const W = svg.viewBox.baseVal.width;
  const top = Number(svg.dataset.top || 10); const bottom = Number(svg.dataset.bottom || svg.viewBox.baseVal.height - 20);
  const g = el('g', { class: 'scrub' });
  g.append(el('line', { x1: best.x, x2: best.x, y1: top - 6, y2: bottom, class: 'scrub-line' }));
  g.append(el('circle', { cx: best.x, cy: best.y, r: 4.5, class: 'scrub-dot' }));
  if (best.y2 != null) g.append(el('circle', { cx: best.x, cy: best.y2, r: 4.5, class: 'scrub-dot alt' }));
  // Beschriftung: Wert fett, darunter das Datum; Kasten seitlich neben der Linie, innerhalb des Diagramms
  const value = best.v2 != null ? `${best.v} · ${best.v2}` : best.v;
  const tv = el('text', { class: 'scrub-v' }, value);
  const tt = el('text', { class: 'scrub-t' }, best.t);
  const box = el('rect', { class: 'scrub-box', rx: 6 });
  g.append(box, tv, tt);
  svg.append(g);
  const w = Math.max(tv.getComputedTextLength(), tt.getComputedTextLength()) + 14;
  const h = 30;
  let bx = best.x + 8;
  if (bx + w > W - 2) bx = best.x - 8 - w;
  if (bx < 2) bx = 2;
  const by = top - 6;
  box.setAttribute('x', bx); box.setAttribute('y', by); box.setAttribute('width', w); box.setAttribute('height', h);
  tv.setAttribute('x', bx + 7); tv.setAttribute('y', by + 13);
  tt.setAttribute('x', bx + 7); tt.setAttribute('y', by + 25);
}

// Finger (Nutzer 28.11.: beim Scrollen wurde sofort ein Wert gewählt): erst nach kurzem Halten (HOLD ms ohne Bewegung)
// oder bei einem kurzen Tipp ohne Bewegung. Bewegt sich der Finger vorher, ist es Scrollen → nichts anzeigen.
// Nach dem Halten folgt die Anzeige dem Finger (seitlich ziehen). Maus: sofort wie bisher.
const HOLD = 300; // ms
const SLOP = 8; // px Bewegung, die noch als «ruhig» gilt
let press = null; // { svg, pts, id, x0, y0, t0, on, timer, touch }
document.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest?.('svg.chart[data-pts]');
  if (!svg) { if (active && !e.target.closest?.('svg.chart')) clear(); return; }
  let pts;
  try { pts = JSON.parse(svg.dataset.pts); } catch { return; }
  const touch = e.pointerType !== 'mouse';
  press = { svg, pts, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: Date.now(), on: !touch, touch, timer: null };
  if (!touch) { show(svg, pts, e.clientX); return; }
  const p = press;
  p.timer = setTimeout(() => {
    if (press !== p) return;
    p.on = true;
    show(p.svg, p.pts, p.x);
    navigator.vibrate?.(8); // kleines Feedback auf Android, wenn es die Anzeige gibt
  }, HOLD);
});
document.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  press.x = e.clientX;
  if (press.on) { show(press.svg, press.pts, e.clientX); return; }
  if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > SLOP) { clearTimeout(press.timer); press = null; }
});
document.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.timer);
  // kurzer Tipp ohne Bewegung zeigt den Wert auch
  if (!press.on && press.touch && Date.now() - press.t0 < HOLD) show(press.svg, press.pts, press.x0);
  press = null;
});
// Seite wird gescrollt (senkrecht gewischt) → der Browser bricht ab; eine schon gezeigte Anzeige bleibt stehen
document.addEventListener('pointercancel', (e) => {
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.timer);
  press = null;
});
// langes Drücken soll kein Menü öffnen
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('svg.chart[data-pts]')) e.preventDefault(); });
