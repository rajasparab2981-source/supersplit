import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { clearRedirectError, peekRedirectError } from '../lib/authRedirect';
import { IS_TOUCH } from '../lib/env';
import { BrandMark, Li } from '../ui/LineIcons';

/**
 * Whether sign-in emails contain a typeable code. Supabase's default emails
 * only have a link; the code-and-link template (supabase/templates/signin.html)
 * needs a custom email provider (SMTP). Flip to true once that is configured.
 */
const EMAIL_HAS_CODE = false;

const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

/** Shown when nobody is signed in. Email link/code and Google. */
export function SignInScreen({ joining }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(peekRedirectError);
  useEffect(() => { clearRedirectError(); }, []);
  const [testName, setTestName] = useState('Test user');

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <main className="app-content">
      <div className="auth fade-in">
        <div className="auth-hero">
          <BrandMark size={56} />
          <h1>{joining ? 'Sign in to join the group' : 'Split costs, stay friends'}</h1>
          <p>Track shared expenses for trips, flats and nights out, and see who owes whom.</p>
        </div>
        <ul className="auth-points">
          <li><span><Li.Receipt size={18} /></span>Add an expense in seconds and split it your way</li>
          <li><span><Li.Handshake size={18} /></span>Settle up with the fewest payments</li>
          <li><span><Li.Groups size={18} /></span>Everyone in the group sees the same numbers</li>
        </ul>
        {error && <p role="alert" style={{ color: 'var(--negative)', background: 'rgb(var(--negative-rgb) / .08)', border: '1px solid rgb(var(--negative-rgb) / .3)', borderRadius: 12, padding: '10px 12px', textAlign: 'left', fontSize: 14 }}>{error}</p>}

        {/* Test builds (previews, local dev) use the staging database, which has
            no Google sign-in and can't email the public: offer only the test user. */}
        {!DB.isStaging() && (<React.Fragment>
        <button type="button" className="btn btn-full" disabled={busy}
          onClick={() => run(() => DB.signInWithGoogle())}
          style={{ marginTop: 20, background: '#fff', color: '#1F1F1F', fontWeight: 700, border: '1px solid #DADCE0' }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ marginRight: 8 }}>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--text-mute)', fontSize: 12 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border-2)' }} /> or with email <span style={{ flex: 1, height: 1, background: 'var(--border-2)' }} />
        </div>

        {!sentTo ? (
          <form onSubmit={(e) => { e.preventDefault(); if (validEmail) run(async () => { await DB.signInWithEmail(email); setSentTo(email.trim()); }); }}
            style={{ textAlign: 'left' }}>
            <div className="field">
              <label className="field-label" htmlFor="sp-email">Email</label>
              <input id="sp-email" type="email" inputMode="email" autoComplete="email" autoFocus={!IS_TOUCH}
                placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={!validEmail || busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); run(() => DB.verifyEmailCode(sentTo, code)); }} style={{ textAlign: 'left' }}>
            <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>
              We sent a sign-in link to <strong>{sentTo}</strong>.{' '}
              {EMAIL_HAS_CODE
                ? 'Tap it on this device, or type the code from the email:'
                : "Open it on this device, in this browser, to finish signing in. Check spam if it isn't there within a minute."}
            </p>
            {EMAIL_HAS_CODE && (
              <React.Fragment>
                <div className="field">
                  <label className="field-label" htmlFor="sp-code">Code</label>
                  <input id="sp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
                    value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} />
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={code.length < 6 || busy}>
                  {busy ? 'Checking…' : 'Sign in'}
                </button>
              </React.Fragment>
            )}
            <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: 8 }}
              onClick={() => { setSentTo(null); setCode(''); setError(''); }}>Use a different email</button>
          </form>
        )}
        </React.Fragment>)}

        <p style={{ color: 'var(--text-mute)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
          By continuing you agree to how we handle your data, as described in our{' '}
          <a href="/privacy" style={{ color: 'var(--primary)' }}>Privacy Policy</a>.
        </p>

        {DB.isStaging() && (
          <div className="auth-test">
            <p className="section-title" style={{ margin: '0 0 6px' }}>Test version</p>
            <p style={{ color: 'var(--text-soft)', fontSize: 13, margin: '0 0 10px' }}>
              This is a preview with test data, separate from the real app. Your real groups are at supersplit.netlify.app.
              Pick any name to try it; nothing here affects real data.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); run(() => DB.signInAsTestUser(testName.trim() || 'Test user')); }}>
              <div className="field">
                <label className="field-label" htmlFor="sp-test-name">Test user name</label>
                <input id="sp-test-name" value={testName} maxLength={60} onChange={(e) => setTestName(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={busy}>Continue as a test user</button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
