// Gespeichertes Training bearbeiten: öffnet den Trainings-Bildschirm (views/active.js im Modus „edit“) mit den
// gespeicherten Sätzen – wie beim Live-Training, nur ohne Timer. Für vergessene Sätze, Trainings „ohne Details“
// und Krafttrainings von der Uhr. Bestwerte und Volumen rechnen danach automatisch mit.
import { esc, num } from '../util.js';
import { t } from '../i18n.js';
import { startEdit, setText, workingSets } from '../workout.js';

/** Bearbeiten starten; danach geht es zurück auf die aktuelle Seite. */
export function openEdit(ctx, id) {
  const back = (location.hash.replace(/^#\/?/, '') || 'training');
  let ok = false;
  ctx.update((s) => { ok = startEdit(s, id, back); }, { silent: true });
  if (!ok) return;
  ctx.closeSheet();
  ctx.go('active?edit=1');
}

/** Kurzbeschreibung eines Trainings ohne Sätze: „6 Übungen · ohne Details“ bzw. „… · ⌚ von der Uhr · 55 min“. */
export function bareLabel(w, plan) {
  const n = (plan?.ex || []).filter((e) => !e.optional).length;
  const what = w.source === 'watch' ? `⌚ ${t('training.fromWatch')}${w.minutes ? ` · ${num(w.minutes)} min` : ''}` : t('training.noDetails');
  return n ? `${t('training.exCount', { n })} · ${what}` : what;
}

/**
 * Übungen zum Anzeigen: gespeicherte mit ihren Sätzen; ohne Details die Übungen des Plans (ohne optionale) mit „–“.
 * → [{ name, uni, sets: 'Text', n: Arbeitssätze | null }]
 */
export function shownExercises(state, w) {
  if (w.exercises.length) {
    return w.exercises.map((ex) => ({ name: ex.name, uni: !!ex.uni, sets: ex.sets.map((s) => setText(s, { unit: '', x: '×' })).join(' · ') || '–', n: workingSets(ex).length }));
  }
  const plan = state.plans.find((p) => p.id === w.planId);
  return (plan?.ex || []).filter((e) => !e.optional).map((e) => ({ name: e.name, uni: !!e.uni, sets: '–', n: null }));
}

/** Liste für Detail-Fenster und Tagesübersicht. */
export function exerciseList(state, w, { compact = false } = {}) {
  return shownExercises(state, w).map((ex) => `<div class="item"${compact ? ' style="padding:6px 0"' : ''}><div class="grow"><div class="${compact ? 'small' : ''}" style="font-weight:600">${esc(ex.name)}${ex.uni ? ` <span class="tag accent">${esc(t('active.uniShort'))}</span>` : ''}</div>
    <div class="meta">${esc(ex.sets)}</div></div><span class="tiny muted">${ex.n ?? ''}</span></div>`).join('');
}
