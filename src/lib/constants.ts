export interface Category { id: string; label: string; emoji: string; group_id?: string | null }

/**
 * Categories offered in the app. Starts as the original eight (the fallback
 * when the database has no categories table yet) and is replaced with the
 * database's list once loaded: see setCategories().
 */
export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', emoji: '🍔' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'stay', label: 'Stay', emoji: '🏨' },
  { id: 'drinks', label: 'Drinks', emoji: '🍹' },
  { id: 'fun', label: 'Fun', emoji: '🎉' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'fuel', label: 'Fuel', emoji: '⛽' },
  { id: 'other', label: 'Other', emoji: '📌' },
];
export const CAT_BY_ID: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/**
 * Replace the category list with the one from the database. Both exports are
 * updated in place, so existing imports see the new list on the next render.
 * Archived categories stay resolvable (old expenses) but are not offered.
 */
export function setCategories(rows: { id: string; name: string; emoji: string; group_id: string | null; archived_at: string | null }[]): void {
  if (rows.length === 0) return;
  for (const k of Object.keys(CAT_BY_ID)) delete CAT_BY_ID[k];
  const offered: Category[] = [];
  for (const r of rows) {
    const c: Category = { id: r.id, label: r.name, emoji: r.emoji, group_id: r.group_id };
    CAT_BY_ID[r.id] = c;
    if (!r.archived_at) offered.push(c);
  }
  CATEGORIES.splice(0, CATEGORIES.length, ...offered);
}

export const GROUP_EMOJIS = ['👥', '🏖️', '🏠', '🎓', '💼', '❤️', '🍕', '🎬', '🚗', '⚽', '✈️', '🏔️', '🎵', '☕', '🍻', '🌴'];
export const TRIP_EMOJIS = ['🏖️', '✈️', '🏔️', '🚗', '🏠', '🎉', '🍽️', '💼', '🌴', '🎬', '🛍️', '⛺', '🏛️', '🎢', '🚂', '⛵'];
export const COLORS = ['#00E5A0', '#6E5BFF', '#FF4D6D', '#FFC857', '#3DA9FC', '#FF7AB6', '#3FE0D0', '#FFA740'];
export const AVATAR_COLORS: [string, string][] = [
  ['#00E5A0', '#00B080'], ['#6E5BFF', '#5040C8'], ['#FF4D6D', '#C9304E'], ['#FFC857', '#D9A030'],
  ['#3DA9FC', '#2380D0'], ['#FF7AB6', '#D9568F'], ['#3FE0D0', '#28A89A'], ['#FFA740', '#D9821C'],
  ['#A78BFA', '#7C5CD9'], ['#34D399', '#10B981'], ['#F472B6', '#DB2777'], ['#60A5FA', '#3B82F6'],
];
export const REACTION_EMOJIS = ['🎉', '👍', '💸', '🔥', '😂', '❤️'];
