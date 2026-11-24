import { useState } from 'react';
import { DB } from '../db/db';
import { IS_TOUCH } from '../lib/env';

// Shown when the cloud database is locked (Phase 0 lockdown) and this
// device has no valid group passcode yet.
export function PasscodeGate({ onUseLocal }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await DB.unlock(code);
    } catch (err) {
      setError(err && err.name === 'PasscodeError'
        ? 'That passcode didn’t work. Check with whoever runs your group.'
        : 'Couldn’t reach the server: ' + ((err && err.message) || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-content">
      <form className="empty" onSubmit={submit} style={{ maxWidth: 360, margin: '0 auto' }}>
        <div className="emoji-bubble">🔒</div>
        <h3>Enter group passcode</h3>
        <p>Your group’s data is now protected. Ask the group admin for the passcode. You only need to enter it once on this device.</p>
        <div className="field" style={{ textAlign: 'left', marginTop: 20 }}>
          <label className="field-label" htmlFor="sp-passcode">Passcode</label>
          <input
            id="sp-passcode"
            type="password"
            autoComplete="current-password"
            autoFocus={!IS_TOUCH}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }}
            enterKeyHint="go"
          />
        </div>
        {error && <p className="split-hint" role="alert" style={{ color: 'var(--negative)', textAlign: 'left' }}>{error}</p>}
        <button type="submit" className="btn btn-primary btn-full" disabled={!code.trim() || busy}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <div className="spacer-2" />
        <button type="button" className="btn btn-ghost btn-full" onClick={onUseLocal}>
          Use offline on this device instead
        </button>
      </form>
    </main>
  );
}
