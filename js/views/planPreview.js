// Vorschau eines Trainings: alle Übungen mit Ziel und „Zuletzt“, ohne das Training zu starten
// (z. B. auf dem Weg ins Gym kurz schauen, was heute dran ist). Antippen des Trainings unter Heute bzw. Training.
import { esc, num } from '../util.js';
import { t, targetText, shortDate } from '../i18n.js';
import { lastSetsFor, setText } from '../workout.js';
import { exCfg } from '../exercises.js';
import { sheetHead } from '../ui.js';

let planId = null;

function sheet(state) {
  const p = state.plans.find((x) => x.id === planId);
  if (!p) return null;
  const last = (name, uni) => {
    const l = lastSetsFor(state, name, uni);
    if (!l) return `<span class="muted">${esc(t('preview.never'))}</span>`;
    const work = l.sets.filter((s) => !s.warmup).map((s) => setText(s, { unit: '', x: '×' })).join(' · ');
    return `${esc(t('preview.last', { date: shortDate(l.date) }))} ${esc(work || '–')}`;
  };
  const rows = p.ex.map((e, i) => {
    const cfg = exCfg(state, e.name);
    return `<div class="item" style="align-items:flex-start"><span class="tiny muted" style="width:20px;padding-top:2px">${i + 1}.</span>
      <div class="grow" style="min-width:0"><div style="font-weight:600">${esc(e.name)} ${e.optional ? `<span class="tag">${esc(t('training.optional'))}</span>` : ''}${e.uni ? ` <span class="tag accent">${esc(t('active.uniShort'))}</span>` : ''}${cfg.x2 ? ` <span class="tag">${esc(t('ex.x2Tag'))}</span>` : ''}</div>
        <div class="meta">${esc(t('m.' + e.muscle))}${e.target ? ` · ${esc(targetText(e.target))}` : ''}</div>
        <div class="tiny" style="margin-top:2px">${last(e.name, !!e.uni)}</div>
        ${e.variant?.name ? `<div class="tiny muted">${esc(t('preview.variant', { name: e.variant.name }))}</div>` : ''}</div></div>`;
  }).join('');
  return `${sheetHead(p.name)}
    <div class="small muted">${esc(t('training.exCount', { n: p.ex.length }))}${state.active ? '' : ` · ${esc(t('preview.hint'))}`}</div>
    <div class="list">${rows}</div>
    ${state.active ? '' : `<button class="btn primary block" data-act="start" data-plan="${esc(p.id)}">${esc(t('training.start'))}</button>`}`;
}

export function open(ctx, id) { planId = id; ctx.openSheet(sheet); }

export const actions = {
  'plan-preview'(el, ctx) { open(ctx, el.dataset.plan); },
};
