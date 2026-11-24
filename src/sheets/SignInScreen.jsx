import React, { useState } from 'react';
import { DB } from '../db/db';
import { IS_TOUCH } from '../lib/env';

const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

/** Shown when nobody is signed in. Email link/code and Google. */
export function SignInScreen({ joining }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testName, setTestName] = useState('Test user');

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <main className="app-content">
      <div className="empty" style={{ maxWidth: 380, margin: '0 auto' }}>
        <div className="emoji-bubble">₹</div>
        <h3>{joining ? 'Sign in to join the group' : 'Welcome to SplitPro'}</h3>
        <p>Split trips and shared bills with friends. Your groups sync across all your devices.</p>

        <button type="button" className="btn btn-full" disabled={busy}
          onClick={() => run(() => DB.signInWithGoogle())}
          style={{ marginTop: 20, background: '#fff', color: '#1F1F1F', fontWeight: 700 }}>
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
              We sent a link to <strong>{sentTo}</strong>. Tap it on this device, or type the code from the email:
            </p>
            <div className="field">
              <label className="field-label" htmlFor="sp-code">Code</label>
              <input id="sp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
                value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={code.length < 6 || busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: 8 }}
              onClick={() => { setSentTo(null); setCode(''); setError(''); }}>Use a different email</button>
          </form>
        )}

        {error && <p className="split-hint" role="alert" style={{ color: 'var(--negative)', textAlign: 'left' }}>{error}</p>}

        {DB.isStaging() && (
          <div style={{ marginTop: 28, textAlign: 'left', borderTop: '1px dashed var(--border-2)', paddingTop: 12 }}>
            <p className="section-title" style={{ margin: '0 0 8px' }}>Staging only</p>
            <form onSubmit={(e) => { e.preventDefault(); run(() => DB.signInAsTestUser(testName.trim() || 'Test user')); }}>
              <div className="field">
                <label className="field-label" htmlFor="sp-test-name">Test user name</label>
                <input id="sp-test-name" value={testName} maxLength={60} onChange={(e) => setTestName(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-soft btn-full" disabled={busy}>Continue as a throwaway test user</button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
