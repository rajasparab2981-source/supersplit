/**
 * Sign-in errors that Supabase sends back in the address
 * (?error=…&error_description=… or in the #hash), e.g. when Google sign-in fails.
 *
 * This module must be imported BEFORE anything that creates the Supabase
 * client (see main.tsx): supabase-js reads and clears these parameters as
 * soon as it initialises, so they have to be captured first.
 */

function capture(): string {
  if (typeof window === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const desc = q.get('error_description') || h.get('error_description');
  const code = q.get('error') || h.get('error');
  if (!desc && !code) return '';
  const text = (desc || code || '').replace(/\+/g, ' ');
  if (/exchange external code/i.test(text)) {
    return 'Google sign-in could not be completed (the app’s Google settings need fixing). Please use email for now.';
  }
  if (/access_denied/i.test(code || '')) return 'Google sign-in was cancelled or not allowed for this account.';
  if (/expired|invalid/i.test(text)) return 'That sign-in link has expired or was already used. Please request a new one.';
  return `Sign-in failed: ${text}`;
}

let pending = capture();

/** The captured sign-in error, if any (does not clear it). */
export function peekRedirectError(): string {
  return pending;
}

/** Forget the error once it has been shown, so it doesn't reappear after a later sign-out. */
export function clearRedirectError(): void {
  pending = '';
  if (typeof window !== 'undefined' && /[?&#](error|error_description)=/.test(window.location.href)) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}
