export interface Category { id: string; label: string; emoji: string }

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

export const GROUP_EMOJIS = ['👥', '🏖️', '🏠', '🎓', '💼', '❤️', '🍕', '🎬', '🚗', '⚽', '✈️', '🏔️', '🎵', '☕', '🍻', '🌴'];
export const TRIP_EMOJIS = ['🏖️', '✈️', '🏔️', '🚗', '🏠', '🎉', '🍽️', '💼', '🌴', '🎬', '🛍️', '⛺', '🏛️', '🎢', '🚂', '⛵'];
export const COLORS = ['#00E5A0', '#6E5BFF', '#FF4D6D', '#FFC857', '#3DA9FC', '#FF7AB6', '#3FE0D0', '#FFA740'];
export const AVATAR_COLORS: [string, string][] = [
  ['#00E5A0', '#00B080'], ['#6E5BFF', '#5040C8'], ['#FF4D6D', '#C9304E'], ['#FFC857', '#D9A030'],
  ['#3DA9FC', '#2380D0'], ['#FF7AB6', '#D9568F'], ['#3FE0D0', '#28A89A'], ['#FFA740', '#D9821C'],
  ['#A78BFA', '#7C5CD9'], ['#34D399', '#10B981'], ['#F472B6', '#DB2777'], ['#60A5FA', '#3B82F6'],
];
export const REACTION_EMOJIS = ['🎉', '👍', '💸', '🔥', '😂', '❤️'];
