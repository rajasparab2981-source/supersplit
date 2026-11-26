// Light / dark / match-device theme. The choice is stored on the device and
// applied as data-theme on <html>; styles.css defines every colour per theme.

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'splitpro_theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch { return 'light'; }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice;
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  if (typeof document === 'undefined') return;
  const mode = resolve(choice);
  document.documentElement.setAttribute('data-theme', mode);
  // Browser chrome (address bar, status bar in the installed app).
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0B1524' : '#F3FAFD');
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice); } catch { /* storage blocked: still apply for this visit */ }
  applyTheme(choice);
}

// Follow the device while "Match device" is selected.
media?.addEventListener?.('change', () => { if (getThemeChoice() === 'system') applyTheme('system'); });
