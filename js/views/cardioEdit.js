// Cardio eintragen (Fenster) und geplantes Cardio mit Status anzeigen.
// Benutzt von Training (Cardio diese Woche), Tagesübersicht, Plan-Karte und Heute.
import { esc, num, today, parseNum, uid, icon, I } from '../util.js';
import { t } from '../i18n.js';
import { CARDIO_TYPES } from '../plan.js';
import { seg, sheetHead, watchSourceName } from '../ui.js';
import { cardioDay, isAndroid, cardioError } from '../cardio.js';

let draft = null;   // { type, minutes, km, date, after }
let onDone = null;  // nach dem Speichern (z. B. Tagesübersicht wieder öffnen)

/** Cardio-Fenster öffnen, optional vorausgefüllt (z. B. aus „✓ Erledigt“ mit geplanter Art und Dauer). */
export function openCardio(ctx, preset = {}, after = null) {
  const date = preset.date || today();
  draft = { type: 'run', minutes: null, km: null, date, after: ctx.state.workouts.some((w) => w.date === date), ...preset };
  onDone = after;
  ctx.openSheet(sheet);
}

function sheet() {
  const d = draft;
  if (!d) return null;
  return `${sheetHead(t('cardio.add'))}
    <div class="chips">${CARDIO_TYPES.map((c) => `<button class="chip" data-act="ce-type" data-v="${c}" aria-pressed="${d.type === c}">${esc(t('cardio.' + c))}</button>`).join('')}</div>
    <div class="grid2"><label class="field">${esc(t('cardio.minutes'))}<input class="input" inputmode="numeric" id="c-min" value="${esc(d.minutes ?? '')}" autofocus></label>
    <label class="field">${esc(t('cardio.km'))}<input class="input" inputmode="decimal" id="c-km" value="${esc(d.km ?? '')}"></label></div>
    <label class="field">${esc(t('common.date'))}<input class="input" type="date" id="c-date" value="${esc(d.date)}" max="${today()}"></label>
    ${seg('ce-after', [['after', t('cardio.after')], ['own', t('cardio.own')]], d.after ? 'after' : 'own')}
    <div class="small" id="c-err" style="color:var(--bad)"></div>
    <button class="btn primary block" data-act="ce-save">${esc(t('common.save'))}</button>`;
}

function keepInputs() {
  if (!draft) return;
  const m = document.getElementById('c-min'); const k = document.getElementById('c-km'); const d = document.getElementById('c-date');
  if (m) draft.minutes = parseNum(m.value);
  if (k) draft.km = parseNum(k.value);
  if (d && d.value) draft.date = d.value;
}

// Knopf „✓ Erledigt“ (iPhone) bzw. Link „von Hand eintragen“ (Android, falls die Uhr nicht mitlief)
const doneBtn = (date, p, cls = 'btn sm', label = '✓ ' + t('cardio.done')) => `<button class="${cls}" data-act="cardio-done" data-d="${esc(date)}" data-type="${esc(p.type)}" data-min="${esc(p.minutes ?? '')}">${esc(label)}</button>`;

/**
 * Geplantes Cardio eines Tages als Liste: erfüllt → ✓ mit echten Werten; offen (heute/vergangen) →
 * iPhone „✓ Erledigt“, Android „kommt automatisch von der Uhr“ (+ „von Hand eintragen“). Kommende Tage: nur geplant.
 */
export function plannedCardioList(state, date, { onlyOpen = false, withDelete = false } = {}) {
  const { items } = cardioDay(state, date);
  const canDo = date <= today();
  return items.filter((p) => !onlyOpen || !p.done).map((p) => {
    if (p.done) {
      const s = p.done;
      return `<div class="item"><span style="width:22px;text-align:center;color:var(--accent)">${icon(I.check)}</span><div class="grow"><div style="font-weight:600">${esc(t('cardio.' + s.type))} · ${num(s.minutes)} min</div>
        <div class="meta">${esc(t('cardio.plannedWas', { min: num(p.minutes) }))} · ${esc(s.source === 'watch' ? watchSourceName() : t('cardio.manual'))}</div></div></div>`;
    }
    const android = isAndroid();
    const hint = canDo && android ? `<div class="tiny muted">${esc(t('cardio.autoFromWatch'))} · ${doneBtn(date, p, 'link tiny', t('cardio.enterManually'))}</div>` : '';
    const btn = canDo && !android ? doneBtn(date, p) : '';
    const del = withDelete && p.from === 'day' ? `<button class="icon-btn" data-act="dp-cardio-del" data-d="${esc(date)}" data-id="${esc(p.id)}" aria-label="${esc(t('common.delete'))}">${icon(I.trash)}</button>` : '';
    return `<div class="item">${icon(I.run)}<div class="grow"><div style="font-weight:600">${esc(t('cardio.' + p.type))} · ${num(p.minutes)} min</div>
      <div class="meta">${esc(t('plan.from.' + p.from))}</div>${hint}</div>${btn}${del}</div>`;
  }).join('');
}

/** Kurze Zeile für Heute-/Trainings-Karte: „✓ Velo 34 min“ bzw. „Velo 30 min“ (+ Erledigt auf dem iPhone). */
export function cardioLine(state, date) {
  const { items } = cardioDay(state, date);
  if (!items.length) return '';
  const parts = items.map((p) => (p.done
    ? `<span style="color:var(--accent)">✓ ${esc(t('cardio.' + p.done.type))} ${num(p.done.minutes)} min</span>`
    : `<span>${esc(t('cardio.' + p.type))} ${num(p.minutes)} min</span>${!isAndroid() ? ` ${doneBtn(date, p, 'link small')}` : ''}`));
  const open = items.some((p) => !p.done);
  return `<div class="small" style="color:var(--cardio);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center">${icon(I.run)} ${parts.join(' · ')}
    ${open && isAndroid() ? `<span class="tiny muted">${esc(t('cardio.autoFromWatch'))}</span>` : ''}</div>`;
}

export const actions = {
  'add-cardio'(el, ctx) { openCardio(ctx); },
  'ce-type'(el, ctx) { keepInputs(); draft.type = el.dataset.v; ctx.refreshSheet(); },
  'ce-after'(el, ctx) { keepInputs(); draft.after = el.dataset.v === 'after'; ctx.refreshSheet(); },
  'ce-save'(el, ctx) {
    keepInputs();
    const d = draft;
    if (!d.minutes) { document.getElementById('c-err').textContent = t('cardio.needMinutes'); return; }
    const bad = cardioError(d, today());
    if (bad) { document.getElementById('c-err').textContent = t(bad); return; }
    const entry = { id: uid(), date: d.date || today(), type: d.type, minutes: d.minutes, km: d.km, after: d.after };
    const after = onDone;
    draft = null; onDone = null;
    ctx.closeSheet();
    ctx.update((s) => { s.cardio.push(entry); });
    ctx.toast(t('cardio.saved'));
    if (after) after();
  },
  'del-cardio'(el, ctx) {
    const idx = ctx.state.cardio.findIndex((c) => c.id === el.dataset.id);
    if (idx < 0) return;
    const removed = ctx.state.cardio[idx];
    ctx.update((s) => { s.cardio.splice(idx, 1); });
    ctx.toast(t('cardio.deleted'), () => ctx.update((s) => { s.cardio.splice(idx, 0, removed); }));
  },
};
