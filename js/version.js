// Versionsnummer der App.
// Web-Stand = Nummer aus dem Namen des Service-Worker-Zwischenspeichers (APP_CACHE "gym-v55" → 55, in sw.js hochzählen).
// Android: Die App-Hülle hängt "GymMacroApp/1.3" an den User-Agent → angezeigt wird "1.3.55".
// iPhone/Browser: nur "55" (dort gibt es keine Hülle).

let cachedWeb; // undefined = noch nicht gefragt, null = unbekannt

/** Version der Android-Hülle (ab 1.3), sonst null. */
export function shellVersion() {
  const m = navigator.userAgent.match(/GymMacroApp\/(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

const num = (name) => { const m = /^gym-v(\d+)$/.exec(name || ''); return m ? Number(m[1]) : null; };

/** Web-Stand als Zahl: zuerst den aktiven Service Worker fragen, sonst den neuesten Zwischenspeicher. */
export async function webVersion() {
  if (cachedWeb !== undefined) return cachedWeb;
  let v = null;
  try {
    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      v = await new Promise((resolve) => {
        const done = (x) => { navigator.serviceWorker.removeEventListener('message', onMsg); clearTimeout(timer); resolve(x); };
        const onMsg = (e) => { if (e.data?.type === 'version') done(num(e.data.version)); };
        const timer = setTimeout(() => done(null), 1500);
        navigator.serviceWorker.addEventListener('message', onMsg);
        sw.postMessage('version');
      });
    }
    if (v == null) v = Math.max(...(await caches.keys()).map(num).filter((x) => x != null)) || null;
  } catch { v = null; }
  if (!Number.isFinite(v)) v = null;
  cachedWeb = v;
  return v;
}

/** Ganze Versionsnummer: Android "1.3.55", sonst "55". Ältere Android-App ohne Kennung: "55 · Android". */
export async function appVersion() {
  const web = await webVersion();
  const shell = shellVersion();
  if (shell) return web != null ? `${shell}.${web}` : shell;
  if (web == null) return null;
  return window.GymHC ? `${web} · Android` : String(web);
}

/** Für die Anzeige ohne Warten: bekannter Wert oder undefined (dann load() aufrufen). */
let cachedFull;
export function cached() { return cachedFull; }
export async function load() { cachedFull = (await appVersion()) ?? null; return cachedFull; }
