// Öffentliche Rezepte der anderen ("Entdecken"): Liste, Detail-Sheet, Kopieren.
// Gemeinsam genutzt vom Rezepte-Tab (Ernährung) und von "Hinzufügen".
import { esc, num, uid, icon, I } from '../util.js';
import { t } from '../i18n.js';
import { portionsLabel } from '../recipes.js';
import * as publicRecipes from '../publicRecipes.js';
import * as sync from '../sync.js';
import { energy, sheetHead } from '../ui.js';

export let discover = { status: 'idle', list: [] }; // status: idle | loading | done | error
let pubDetail = null; // gerade angesehenes öffentliches Rezept

/** Öffentliches Rezept als "Lebensmittel" zum Eintragen. */
export function publicFood(p) {
  return { id: 'pub-' + p.id, source: 'recipe', isPublic: true, name: p.name, per100: p.data.per100, portion: p.data.portionGrams || 100, perPortion: p.data.perPortion };
}

export function current() { return discover.list.find((x) => x.id === pubDetail) || null; }
export function open(id, ctx) { pubDetail = id; ctx.openSheet(pubSheet); }

export async function load(onDone) {
  if (!sync.getUser() || discover.status === 'loading') return;
  discover = { status: 'loading', list: [] };
  try { discover = { status: 'done', list: await publicRecipes.loadPublic() }; } catch { discover = { status: 'error', list: [] }; }
  onDone?.();
}

/** Liste der öffentlichen Rezepte (optional nach Name gefiltert). */
export function listHtml(state, q = '') {
  if (!sync.getUser()) return `<div class="small muted">${esc(t('recipe.discoverNeedsAccount'))}</div>`;
  if (discover.status === 'loading' || discover.status === 'idle') return `<div class="empty"><span class="spinner"></span></div>`;
  if (discover.status === 'error') return `<div class="small">${esc(t('auth.errNetwork'))}</div><button class="link" data-act="discover-reload">${esc(t('food.retry'))}</button>`;
  if (!discover.list.length) return `<div class="small muted">${esc(t('recipe.discoverEmpty'))}</div>`;
  const needle = q.trim().toLowerCase();
  const list = needle ? discover.list.filter((p) => p.name.toLowerCase().includes(needle)) : discover.list;
  if (!list.length) return `<div class="small muted">${esc(t('recipe.noMatch'))}</div>`;
  return `<div class="list">${list.map((p) => `<div class="item"><button class="item-btn grow" data-act="pub-open" data-id="${esc(p.id)}">
      <div class="ellipsis" style="font-weight:600">${esc(p.name)}</div>
      <div class="meta ellipsis">${energy(state, p.data.perPortion?.kcal || 0)} ${esc(t('recipe.perPortionShort'))} · ${esc(t('n.pShort'))} ${num(p.data.perPortion?.p || 0)} g · ${esc(t('recipe.by', { name: p.author_name || t('recipe.anonymous') }))}</div></button>
    ${icon(I.chevron)}</div>`).join('')}</div>`;
}

function pubSheet(state) {
  const p = current();
  if (!p) return null;
  const d = p.data;
  const pp = d.perPortion || {};
  return `${sheetHead(p.name)}
    <div class="small muted">${esc(t('recipe.by', { name: p.author_name || t('recipe.anonymous') }))} · ${esc(portionsLabel(d.servings || 1))}${d.portionGrams ? ` · ${esc(t('recipe.portionIs', { g: num(d.portionGrams) }))}` : ''}</div>
    <div class="grid2"><div class="stack" style="gap:2px"><span class="tiny muted">${esc(t('recipe.perPortion'))}</span><span class="big">${energy(state, pp.kcal || 0)}</span></div>
      <div class="stack small" style="gap:2px"><span>${esc(t('n.p'))} <b>${num(pp.p || 0, 1)} g</b></span><span>${esc(t('n.c'))} <b>${num(pp.c || 0, 1)} g</b></span><span>${esc(t('n.f'))} <b>${num(pp.f || 0, 1)} g</b></span></div></div>
    <div><h3>${esc(t('recipe.ingredients'))}</h3><div class="list">${(d.items || []).map((it) => `<div class="item"><span class="grow small">${esc(it.name)}</span><span class="small muted">${num(it.grams)} g</span></div>`).join('')}</div></div>
    ${d.instructions ? `<div><h3>${esc(t('recipe.instructions'))}</h3><div class="small" style="white-space:pre-wrap;line-height:1.5;margin-top:6px">${esc(d.instructions)}</div></div>` : ''}
    <div class="grid2"><button class="btn" data-act="pub-copy">${esc(t('recipe.copy'))}</button><button class="btn primary" data-act="pub-log">${esc(t('recipe.log'))}</button></div>`;
}

/** Angesehenes öffentliches Rezept in die eigenen Rezepte kopieren. Gibt die Kopie zurück. */
export function copyCurrent(ctx) {
  const p = current();
  if (!p) return null;
  const d = p.data;
  const r = {
    id: uid(), name: p.name, servings: d.servings || 1, cookedWeight: d.cookedWeight ?? null, instructions: d.instructions || '',
    items: (d.items || []).map((it) => ({ id: uid(), foodId: null, name: it.name, grams: it.grams, per100: it.per100 })),
    public: false, copiedFrom: p.author_name || null, updatedAt: new Date().toISOString(),
  };
  ctx.update((s) => { (s.recipes ||= []).push(r); });
  ctx.closeSheet();
  ctx.toast(t('recipe.copied', { name: p.name }));
  return r;
}
