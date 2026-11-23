// Health Connect (Android) im Körper-Tab: Zugriff erlauben, Status, Abgleich, Nährwerte senden ja/nein.
// Nur sichtbar in der Android-App (Brücke vorhanden) oder als Hinweis im Android-Browser.
import { esc, dayKey } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { seg } from '../ui.js';
import * as hc from '../healthConnect.js';

let st = { loaded: false, data: null, error: null };
let busy = false;

/** Soll diese Karte statt der iPhone-Anleitung erscheinen? */
export const applies = () => hc.available() || hc.isAndroidBrowser();

async function loadStatus(ctx) {
  try { st = { loaded: true, data: await hc.call('status'), error: null }; } catch (e) { st = { loaded: true, data: null, error: e.message }; }
  ctx.render();
}

// Datum und Uhrzeit in Ortszeit (iso.slice(0, 10) wäre UTC → kurz nach Mitternacht der falsche Tag)
const fmtTime = (iso) => (iso ? `${shortDate(dayKey(new Date(iso)))}, ${new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}` : '–');

export function card(state, ctx) {
  const head = `<h3>${esc(t('hc.title'))}</h3>`;
  if (!hc.available()) return `<section class="card tight">${head}<div class="small muted">${esc(t('hc.needApp'))}</div></section>`;
  if (!st.loaded) { setTimeout(() => loadStatus(ctx), 0); return `<section class="card tight">${head}<div class="empty"><span class="spinner"></span></div></section>`; }
  const d = st.data;
  if (st.error || !d) return `<section class="card tight">${head}<div class="small" style="color:var(--bad)">${esc(t('hc.error'))}</div><button class="btn sm" data-act="hc-reload">${esc(t('food.retry'))}</button></section>`;
  if (!d.available) {
    return `<section class="card tight">${head}<div class="small muted">${esc(t(d.needsUpdate ? 'hc.needsUpdate' : 'hc.notInstalled'))}</div>
      <button class="btn primary" data-act="hc-open">${esc(t('hc.install'))}</button></section>`;
  }
  if (!d.granted?.length) {
    return `<section class="card tight">${head}<div class="small muted">${esc(t('hc.intro'))}</div>
      <button class="btn primary" data-act="hc-perm" ${busy ? 'disabled' : ''}>${esc(t('hc.allow'))}</button></section>`;
  }
  const canWrite = d.granted.includes('write_nutrition');
  return `<section class="card tight">${head}
    <div class="small">${esc(t('hs.connected'))}</div>
    <div class="tiny muted">${esc(t('hs.lastData', { time: fmtTime(state.healthConnect?.lastRead) }))}</div>
    <div class="field">${esc(t('hc.nutrition'))}${seg('hc-nutrition', [['on', t('hc.on')], ['off', t('hc.off')]], hc.sendsNutrition(state) ? 'on' : 'off')}</div>
    <div class="tiny muted">${esc(t(canWrite ? 'hc.nutritionHint' : 'hc.nutritionNoRight'))}</div>
    <div class="grid2"><button class="btn sm" data-act="hc-sync" ${busy ? 'disabled' : ''}>${esc(t('sync.now'))}</button><button class="btn sm" data-act="hc-open">${esc(t('hc.rights'))}</button></div>
  </section>`;
}

export const actions = {
  'hc-reload'(el, ctx) { st = { loaded: false, data: null, error: null }; ctx.render(); },
  async 'hc-perm'(el, ctx) {
    busy = true; ctx.render();
    try { await hc.call('requestPermissions', {}, 5 * 60000); } catch (e) { ctx.toast(t('hc.error')); }
    busy = false;
    await loadStatus(ctx);
    hc.syncNow().then(() => ctx.render()).catch(() => {});
  },
  async 'hc-open'(el, ctx) {
    try { await hc.call('openSettings'); } catch { ctx.toast(t('hc.error')); }
    st = { loaded: false, data: null, error: null }; // nach der Rückkehr neu prüfen
  },
  async 'hc-sync'(el, ctx) {
    busy = true; ctx.render();
    try {
      const r = await hc.syncNow();
      ctx.toast(r?.written ? t('hc.syncedWritten', { n: r.written }) : t('hc.synced'));
    } catch { ctx.toast(t('hc.error')); }
    busy = false; ctx.render();
  },
  'hc-nutrition'(el, ctx) { ctx.update((s) => { s.profile.hcNutrition = el.dataset.v === 'on'; }); },
};
