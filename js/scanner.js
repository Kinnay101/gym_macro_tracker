// Barcode-Scanner mit der Kamera.
// Nutzt den eingebauten BarcodeDetector des Browsers (Android/Chrome), sonst zxing-wasm aus vendor/ (z. B. iPhone).
// Die Kamera funktioniert nur über https oder localhost.
import { t } from './i18n.js';
import { esc, icon, I } from './util.js';
import { validBarcode } from './foods.js';

let zxing = null;
async function zxingReader() {
  if (zxing) return zxing;
  const mod = await import('../vendor/zxing/reader/index.js');
  const wasmUrl = new URL('../vendor/zxing/zxing_reader.wasm', import.meta.url).href;
  await mod.prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  zxing = mod;
  return mod;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => formats.includes(f)) });
  } catch {
    return null;
  }
}

/** Barcode aus einem Bild/Canvas lesen (für Scanner und Tests). */
export async function decodeImageData(imageData) {
  const z = await zxingReader();
  const res = await z.readBarcodesFromImageData(imageData, { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 });
  return res.find((r) => r.isValid && r.text)?.text || null;
}

/**
 * Öffnet den Scanner als Vollbild. onCode(code) wird mit dem erkannten Barcode aufgerufen.
 * Unten gibt es immer ein Feld zum Eintippen (falls keine Kamera oder Barcode schlecht lesbar).
 */
export function openScanner(onCode) {
  const root = document.createElement('div');
  root.className = 'scanner';
  root.innerHTML = `
    <video playsinline muted poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video>
    <div class="scan-frame" aria-hidden="true"></div>
    <div class="scan-top"><span>${esc(t('scan.title'))}</span><button class="icon-btn" data-scan="close" aria-label="${esc(t('common.close'))}">${icon(I.x)}</button></div>
    <div class="scan-bottom">
      <div class="scan-msg small" role="status">${esc(t('scan.starting'))}</div>
      <form class="row" data-scan="form"><input class="input grow" inputmode="numeric" pattern="[0-9]*" placeholder="${esc(t('scan.manualPh'))}" aria-label="${esc(t('scan.manualPh'))}"><button class="btn primary">${esc(t('common.ok'))}</button></form>
    </div>`;
  document.body.append(root);
  const video = root.querySelector('video');
  // Android-WebView zeigt ohne Bild einen grossen grauen „Play“-Kreis (AA5) → leeres Vorschaubild, Video erst zeigen, wenn es läuft
  video.addEventListener('playing', () => video.classList.add('on'));
  const msg = root.querySelector('.scan-msg');
  let stream = null;
  let stopped = false;
  let timer = null;

  const close = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((tr) => tr.stop());
    root.remove();
    document.removeEventListener('keydown', onKey);
  };
  const done = (code) => { close(); onCode(code); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('[data-scan="close"]').onclick = close;
  root.querySelector('[data-scan="form"]').onsubmit = (e) => {
    e.preventDefault();
    const code = e.target.querySelector('input').value.replace(/\D/g, '');
    if (!validBarcode(code)) { msg.textContent = t('scan.invalid'); return; }
    done(code);
  };

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = t('scan.noCamera'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      msg.textContent = e.name === 'NotAllowedError' ? t('scan.denied') : t('scan.noCamera');
      return;
    }
    if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const native = await nativeDetector();
    if (!native) {
      msg.textContent = t('scan.loading');
      try { await zxingReader(); } catch (e) { console.warn(e); msg.textContent = t('scan.libError'); return; }
    }
    if (stopped) return;
    msg.textContent = t('scan.hint');
    const canvas = document.createElement('canvas');
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    let last = null;
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          let code = null;
          if (native) {
            const found = await native.detect(video);
            code = found[0]?.rawValue || null;
          } else {
            // Mittleren Ausschnitt auswerten (schneller, Barcode liegt meist im Rahmen)
            const vw = video.videoWidth; const vh = video.videoHeight;
            const w = Math.round(vw * 0.8); const h = Math.round(vh * 0.5);
            canvas.width = w; canvas.height = h;
            ctx2d.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, w, h);
            code = await decodeImageData(ctx2d.getImageData(0, 0, w, h));
          }
          // Zweimal gleich gelesen = sicher (verhindert Fehllesungen)
          if (code && validBarcode(code)) {
            if (code === last) { navigator.vibrate?.(60); done(code); return; }
            last = code;
          }
        }
      } catch (e) {
        console.warn('Scan-Fehler', e);
      }
      timer = setTimeout(tick, native ? 120 : 200);
    };
    tick();
  })();

  return close;
}
