// Service Worker: macht die App offline-fähig.
// "Netzwerk zuerst": Änderungen kommen sofort an, ohne Internet greift der Zwischenspeicher.
// Bei Änderungen am App-Code APP_CACHE hochzählen.
const APP_CACHE = 'gym-v55';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/store.js', 'js/i18n.js', 'js/util.js', 'js/ui.js', 'js/plan.js', 'js/nutrition.js', 'js/workout.js',
  'js/views/today.js',
  'js/views/daySheet.js', 'js/views/planEdit.js', 'js/views/food.js', 'js/views/food-add.js', 'js/views/training.js', 'js/views/active.js',
  'js/views/progress.js', 'js/views/body.js', 'js/foods.js', 'js/scanner.js', 'js/docs.js', 'js/sync.js', 'js/social.js', 'js/views/friends.js', 'js/measures.js', 'js/views/measures.js', 'js/recipes.js', 'js/views/recipe.js', 'js/publicRecipes.js', 'js/health.js', 'js/views/healthSetup.js', 'js/views/shortcutGuide.js', 'js/feedback.js', 'js/views/feedback.js', 'js/views/recipeBrowser.js', 'js/healthConnect.js', 'js/views/healthConnectSetup.js', 'js/config.js', 'js/version.js', 'data/blv.json',
  'vendor/zxing/reader/index.js', 'vendor/zxing/share.js', 'vendor/zxing/zxing_reader.wasm',
  'vendor/supabase/supabase.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Die App fragt nach der Versionsnummer (Anzeige unter Körper, Feedback)
self.addEventListener('message', (e) => {
  if (e.data === 'version') e.source?.postMessage({ type: 'version', version: APP_CACHE });
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(APP_CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
