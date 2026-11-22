// Körpermasse im Körper-Tab: Übersicht mit Veränderung, Eintragen/Bearbeiten, Verlauf mit Kurve, Übernahme aus Notizen
import { esc, num, today, daysBetween, icon, I, parseNum } from '../util.js';
import { t, shortDate } from '../i18n.js';
import { FORM_ROWS, STATUS_SUGGESTIONS, measureKeys, measureLabel, parseNotes } from '../measures.js';
import { sheetHead, lineChart } from '../ui.js';

let editDate = null; // Datum des Eintrags im Formular (null = neu)
let chartKey = null;
let importText = '';
let importResult = null;

const sorted = (state) => [...state.measures].sort((a, b) => a.date.localeCompare(b.date));
const weightOn = (state, date) => state.weights.find((w) => w.date === date)?.kg ?? null;
const SAME = 0.05; // kg – darunter gilt ein Gewicht als gleich
/** Nächstes Gewicht innerhalb ±3 Tagen (gleicher Tag zuerst) – du wiegst dich etwa 1× pro Woche */
function nearbyWeight(state, date) {
  let best = null;
  for (const w of state.weights) {
    const d = Math.abs(daysBetween(w.date, date));
    if (d <= 3 && (!best || d < best.dist)) best = { ...w, dist: d };
  }
  return best;
}
let pendingSave = null; // gespeicherte Eingaben, während nach dem Gewicht gefragt wird

/** Karte in der Körper-Ansicht */
export function card(state) {
  const list = sorted(state);
  const last = list[list.length - 1];
  const head = `<div class="card-head"><h3>${esc(t('body.measures'))}</h3><button class="link" data-act="m-new">${esc(t('body.addMeasures'))}</button></div>`;
  if (!last) {
    return `<section class="card tight">${head}<div class="small muted">${esc(t('body.noMeasures'))}</div>
      <button class="btn sm ghost" data-act="m-import">${esc(t('measure.import'))}</button></section>`;
  }
  const prevOf = (key) => [...list].reverse().find((e) => e.date < last.date && typeof e[key] === 'number')?.[key];
  const delta = (key) => {
    const p = prevOf(key);
    if (p == null) return '';
    const d = last[key] - p;
    if (Math.abs(d) < 0.05) return '<span class="tiny muted">±0</span>';
    return `<span class="tiny" style="color:var(--muted)">${d > 0 ? '+' : '−'}${num(Math.abs(d), 1)}</span>`;
  };
  const rows = measureKeys(last).map((k) => `<div class="row between small" style="padding:4px 0;border-top:1px solid var(--line)">
      <span class="muted">${esc(measureLabel(k))}</span><span><b>${num(last[k], 1)} cm</b> ${delta(k)}</span></div>`).join('');
  const near = nearbyWeight(state, last.date);
  const kg = near ? `${near.dist ? '≈ ' : ''}${num(near.kg, 1)} kg` : '';
  const meta = [last.status, kg, last.bf != null ? `${num(last.bf, 1)} % ${t('measure.bfShort')}` : ''].filter(Boolean).join(' · ');
  return `<section class="card tight">${head}
    <div class="row between"><span style="font-weight:600">${esc(shortDate(last.date))}</span><span class="small muted">${esc(meta)}</span></div>
    ${last.bf != null && prevOf('bf') != null ? `<div class="tiny muted">${esc(t('measure.bf'))}: ${num(last.bf, 1)} % (${last.bf - prevOf('bf') > 0 ? '+' : '−'}${num(Math.abs(last.bf - prevOf('bf')), 1)})</div>` : ''}
    <div>${rows}</div>
    ${list.length > 1 ? `<div class="tiny muted">${esc(t('measure.deltaHint', { date: shortDate(list[list.length - 2].date) }))}</div>` : ''}
    <div class="grid2"><button class="btn sm" data-act="m-history">${esc(t('measure.history'))}</button><button class="btn sm" data-act="m-edit" data-date="${esc(last.date)}">${esc(t('measure.edit'))}</button></div>
    <button class="btn sm ghost" data-act="m-import">${esc(t('measure.import'))}</button>
  </section>`;
}

// ---------- Formular ----------
function formSheet(state) {
  const e = (editDate && state.measures.find((x) => x.date === editDate)) || {};
  const date = editDate || today();
  const kg = weightOn(state, date);
  const v = (k) => (typeof e[k] === 'number' ? e[k] : '');
  const input = (k, ph) => `<input class="input num" inputmode="decimal" id="m-${k}" value="${esc(v(k))}" placeholder="${esc(ph)}" aria-label="${esc(measureLabel(k))}">`;
  const rows = FORM_ROWS.map(([name, keys]) => `<div class="row" style="gap:8px">
      <span class="small grow">${esc(t('measure.row.' + name))}</span>
      ${keys.length === 2 ? `<div style="width:84px">${input(keys[0], t('measure.rShort'))}</div><div style="width:84px">${input(keys[1], t('measure.lShort'))}</div>` : `<div style="width:176px">${input(keys[0], 'cm')}</div>`}
    </div>`).join('');
  return `${sheetHead(editDate ? t('measure.editTitle') : t('body.addMeasures'))}
    <div class="grid2">
      <label class="field">${esc(t('common.date'))}<input class="input" type="date" id="m-date" value="${esc(date)}" max="${today()}"></label>
      <label class="field">${esc(t('body.weight'))} (kg)<input class="input" inputmode="decimal" id="m-weight" value="${esc(kg ?? '')}"></label>
      <label class="field">${esc(t('measure.bf'))} (%)<input class="input" inputmode="decimal" id="m-bf" value="${esc(v('bf'))}"></label>
      <label class="field">${esc(t('measure.status'))}<input class="input" id="m-status" list="m-status-list" value="${esc(e.status || '')}" placeholder="${esc(t('measure.statusPh'))}"></label>
    </div>
    <datalist id="m-status-list">${STATUS_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="row tiny muted" style="gap:8px"><span class="grow">${esc(t('measure.inCm'))}</span><span style="width:84px;text-align:center">${esc(t('measure.right'))}</span><span style="width:84px;text-align:center">${esc(t('measure.left'))}</span></div>
    <div class="stack">${rows}</div>
    ${editDate ? `<div class="tiny muted">${esc(t('measure.otherKeys'))}</div>` : ''}
    <div class="small" id="m-err" style="color:var(--bad)"></div>
    <div class="row">${editDate ? `<button class="btn danger grow" data-act="m-delete">${icon(I.trash)} ${esc(t('common.delete'))}</button>` : ''}
      <button class="btn primary grow" data-act="m-save">${esc(t('common.save'))}</button></div>`;
}

// ---------- Verlauf ----------
function historySheet(state) {
  const list = sorted(state);
  const keys = [...new Set(list.flatMap((e) => measureKeys(e)))];
  const opts = [...(list.some((e) => e.bf != null) ? ['bf'] : []), ...keys];
  if (!opts.includes(chartKey)) chartKey = opts.includes('waist') ? 'waist' : opts[0];
  const label = (k) => (k === 'bf' ? t('measure.bf') : measureLabel(k));
  const pts = list.filter((e) => typeof e[chartKey] === 'number')
    .map((e, i, arr) => ({ x: daysBetween(arr[0].date, e.date), y: e[chartKey], label: shortDate(e.date) }));
  return `${sheetHead(t('measure.history'))}
    ${opts.length ? `<select class="input" data-in="m-chart">${opts.map((k) => `<option value="${esc(k)}" ${k === chartKey ? 'selected' : ''}>${esc(label(k))}</option>`).join('')}</select>
      ${lineChart(pts, { unit: '' })}` : ''}
    <div class="list">${[...list].reverse().map((e) => `<div class="item"><button class="item-btn grow" data-act="m-edit" data-date="${esc(e.date)}">
      <div style="font-weight:600">${esc(shortDate(e.date))}</div>
      <div class="meta">${esc([e.status, e.bf != null ? `${num(e.bf, 1)} %` : '', t('measure.count', { n: measureKeys(e).length })].filter(Boolean).join(' · '))}</div></button>${icon(I.chevron)}</div>`).join('')}</div>`;
}

// ---------- Übernahme aus Notizen ----------
function importSheet(state) {
  const r = importResult;
  const preview = r ? (r.entries.length
    ? `<div class="list">${r.entries.map((e) => `<div class="item"><div class="grow"><div style="font-weight:600">${esc(shortDate(e.date))}${state.measures.some((m) => m.date === e.date) ? ` <span class="tag">${esc(t('measure.merge'))}</span>` : ''}</div>
        <div class="meta">${esc([e.status, e.weight ? `${num(e.weight, 1)} kg` : '', e.bf != null ? `${num(e.bf, 1)} %` : '', t('measure.count', { n: measureKeys(e).length })].filter(Boolean).join(' · '))}</div>
        ${(() => { const w = state.weights.find((x) => x.date === e.date); return e.weight && w && Math.abs(w.kg - e.weight) >= SAME ? `<div class="tiny" style="color:var(--warn)">${esc(t('measure.wImportKeep', { old: num(w.kg, 1), kg: num(e.weight, 1) }))}</div>` : ''; })()}
        <div class="tiny muted">${esc(measureKeys(e).map((k) => `${measureLabel(k)} ${num(e[k], 1)}`).join(' · '))}</div></div></div>`).join('')}</div>
      ${r.unknown.length ? `<div class="small" style="color:var(--warn)">${esc(t('measure.unknown'))}: ${esc(r.unknown.join(' | '))}</div>` : ''}
      <button class="btn primary block" data-act="m-import-save">${esc(t('measure.importSave', { n: r.entries.length }))}</button>`
    : `<div class="small" style="color:var(--bad)">${esc(t('measure.importNone'))}</div>`) : '';
  return `${sheetHead(t('measure.import'))}
    <div class="small muted">${esc(t('measure.importHint'))}</div>
    <textarea class="input" id="m-import-text" style="min-height:180px;padding:10px 12px;font-size:14px" placeholder="06.07.2025&#10;Status: End of Cut&#10;Weight: 64.2kg&#10;Bodyfat: 9.5%&#10;Bizep right 31cm&#10;…">${esc(importText)}</textarea>
    <button class="btn block" data-act="m-import-check">${esc(t('measure.importCheck'))}</button>
    ${preview}`;
}

// ---------- Gewicht abgleichen ----------
function weightConflictSheet(state) {
  const p = pendingSave;
  if (!p?.conflict) return null;
  const c = p.conflict;
  const same = c.date === p.date;
  const avg = Math.round(((p.kg + c.kg) / 2) * 10) / 10;
  return `${sheetHead(t('measure.wTitle'))}
    <div class="small">${esc(t(same ? 'measure.wSameDay' : 'measure.wNearby', { old: num(c.kg, 1), oldDate: shortDate(c.date), kg: num(p.kg, 1), date: shortDate(p.date) }))}</div>
    <button class="btn primary block" data-act="m-weight-choice" data-v="new">${esc(t(same ? 'measure.wUseNew' : 'measure.wAddNew', { kg: num(p.kg, 1), date: shortDate(p.date) }))}</button>
    <button class="btn block" data-act="m-weight-choice" data-v="keep">${esc(t('measure.wKeep', { old: num(c.kg, 1), oldDate: shortDate(c.date) }))}</button>
    ${same ? `<button class="btn block" data-act="m-weight-choice" data-v="avg">${esc(t('measure.wAvg', { avg: num(avg, 1) }))}</button>` : ''}
    <div class="tiny muted">${esc(t('measure.wHint'))}</div>`;
}

/** Masse speichern; kg = Gewicht, das für das Datum eingetragen werden soll (null = Gewichtsverlauf nicht ändern) */
function finishSave(ctx, kg) {
  const { date, entry, extra, editDate: ed } = pendingSave;
  pendingSave = null;
  ctx.closeSheet();
  ctx.update((s) => {
    s.measures = s.measures.filter((x) => x.date !== date && x.date !== ed);
    if (Object.keys(entry).length > 1 || Object.keys(extra).length) s.measures.push({ ...extra, ...entry });
    if (kg) { s.weights = s.weights.filter((w) => w.date !== date); s.weights.push({ date, kg }); }
  });
  ctx.toast(t('measure.saved'));
}

// ---------- Aktionen ----------
export const actions = {
  'm-new'(el, ctx) { editDate = null; ctx.openSheet(formSheet); },
  'm-edit'(el, ctx) { editDate = el.dataset.date; ctx.openSheet(formSheet); },
  'm-history'(el, ctx) { ctx.openSheet(historySheet); },
  'm-save'(el, ctx) {
    const date = document.getElementById('m-date').value || today();
    const entry = { date };
    for (const [, keys] of FORM_ROWS) for (const k of keys) { const v = parseNum(document.getElementById('m-' + k).value); if (v) entry[k] = v; }
    const bf = parseNum(document.getElementById('m-bf').value);
    if (bf != null) entry.bf = bf;
    const status = document.getElementById('m-status').value.trim();
    if (status) entry.status = status;
    const kg = parseNum(document.getElementById('m-weight').value);
    if (Object.keys(entry).length < 2 && !kg) { document.getElementById('m-err').textContent = t('measure.empty'); return; }
    const old = editDate ? ctx.state.measures.find((x) => x.date === editDate) : null;
    // Werte, die das Formular nicht zeigt (z. B. aus Notizen übernommen), beim Bearbeiten behalten
    const extra = old ? Object.fromEntries(measureKeys(old).filter((k) => !FORM_ROWS.some(([, ks]) => ks.includes(k))).map((k) => [k, old[k]])) : {};
    pendingSave = { date, entry, extra, editDate, kg };
    // Gewicht mit dem abgleichen, was schon in der App steht
    const near = kg ? nearbyWeight(ctx.state, date) : null;
    if (kg && near && Math.abs(near.kg - kg) >= SAME) {
      pendingSave.conflict = near;
      ctx.openSheet(weightConflictSheet);
      return;
    }
    // kein Gewicht in der Nähe → eintragen; gleiches Gewicht am selben Tag → nichts tun;
    // gleiches Gewicht an einem Nachbartag → nicht doppelt eintragen
    finishSave(ctx, kg && !near ? kg : null);
  },
  'm-weight-choice'(el, ctx) {
    const p = pendingSave;
    if (!p) return;
    const v = el.dataset.v;
    const kg = v === 'new' ? p.kg : v === 'avg' ? Math.round(((p.kg + p.conflict.kg) / 2) * 10) / 10 : null;
    finishSave(ctx, kg);
  },
  'm-delete'(el, ctx) {
    const removed = ctx.state.measures.find((x) => x.date === editDate);
    if (!removed) return;
    ctx.closeSheet();
    ctx.update((s) => { s.measures = s.measures.filter((x) => x.date !== editDate); });
    ctx.toast(t('measure.deleted'), () => ctx.update((s) => { s.measures.push(removed); }));
  },
  'm-import'(el, ctx) { importResult = null; ctx.openSheet(importSheet); },
  'm-import-check'(el, ctx) {
    importText = document.getElementById('m-import-text').value;
    importResult = parseNotes(importText);
    ctx.refreshSheet();
  },
  'm-import-save'(el, ctx) {
    const entries = importResult?.entries || [];
    ctx.closeSheet();
    ctx.update((s) => {
      for (const { weight, ...e } of entries) {
        const i = s.measures.findIndex((x) => x.date === e.date);
        if (i >= 0) s.measures[i] = { ...s.measures[i], ...e }; else s.measures.push(e);
        if (weight && !s.weights.some((w) => w.date === e.date)) s.weights.push({ date: e.date, kg: weight }); // vorhandenes Gewicht nie überschreiben
      }
    });
    ctx.toast(t('measure.imported', { n: entries.length }));
    importText = ''; importResult = null;
  },
};

export const changes = {
  'm-chart'(el, ctx) { chartKey = el.value; ctx.refreshSheet(); },
};
