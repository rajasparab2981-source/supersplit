/** Coarse pointer = finger. Used to skip desktop-only behaviour such as autofocus. */
export const IS_TOUCH: boolean =
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
