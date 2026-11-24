// Dates are calendar days in the user's own timezone (IST for most users).
// The old code used toISOString(), which is UTC: between 00:00 and 05:30 IST
// it returned yesterday's date and blocked picking today.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 'YYYY-MM-DD' → '5 Nov 2026'. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Number of calendar days from a to b inclusive (both YYYY-MM-DD). */
export function daySpan(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
