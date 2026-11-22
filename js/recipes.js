// Rezepte: Zutaten (mit gespeicherten Nährwerten pro 100 g), Portionen, optional Gewicht nach dem Kochen.
// Ein Rezept wird beim Eintragen wie ein Lebensmittel behandelt (Nährwerte pro 100 g des fertigen Gerichts).
import { round, num } from './util.js';
import { t } from './i18n.js';
import { NUTRIENTS, forGrams, emptyTotals } from './nutrition.js';

/**
 * Summen eines Rezepts.
 * totalWeight = Gewicht des fertigen Gerichts (gekocht, falls angegeben, sonst Summe der Zutaten).
 */
export function recipeTotals(r) {
  const total = emptyTotals();
  let raw = 0;
  for (const it of r.items || []) {
    const n = forGrams(it.per100, it.grams || 0);
    for (const k of NUTRIENTS) total[k] += n[k];
    raw += it.grams || 0;
  }
  const totalWeight = r.cookedWeight > 0 ? r.cookedWeight : raw;
  const servings = r.servings > 0 ? r.servings : 1;
  const per100 = {};
  const perPortion = {};
  for (const k of NUTRIENTS) {
    const dec = k === 'salt' ? 2 : 1;
    per100[k] = totalWeight ? round((total[k] / totalWeight) * 100, dec + 1) : 0; // eine Stelle mehr, damit Portionen genau bleiben
    perPortion[k] = round(total[k] / servings, dec);
    total[k] = round(total[k], dec);
  }
  return { total, raw: round(raw, 0), totalWeight: round(totalWeight, 0), servings, per100, perPortion, portionGrams: totalWeight ? round(totalWeight / servings, 0) : 0 };
}

/** Rezept als "Lebensmittel" für Suche und Eintragen. */
export function recipeFood(r) {
  const tot = recipeTotals(r);
  return {
    id: 'recipe-' + r.id,
    recipeId: r.id,
    source: 'recipe',
    name: r.name || '?',
    per100: tot.per100,
    portion: tot.portionGrams || 100,
    servings: tot.servings,
    perPortion: tot.perPortion,
  };
}

/** "1 Portion" / "1,5 Portionen" */
export function portionsLabel(n) {
  return n === 1 ? t('recipe.portion1') : t('recipe.portionsN', { n: num(n, 2) });
}
