import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { Avatar } from '../ui/primitives';

const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

/**
 * Opened from an invite link (/join/<token>) once signed in. Lets you claim
 * an existing name (keeps that person's history) or join as someone new.
 */
export function JoinScreen({ token, onJoined, onCancel }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState(DB.getProfile()?.display_name || '');

  useEffect(() => {
    let alive = true;
    DB.invitePreview(token)
      .then((p) => {
        if (!alive) return;
        if (!p) { setError('This invite link is invalid or has expired.'); return; }
        if (p.already_member) { onJoined(p.group_id, true); return; }
        setPreview(p);
      })
      .catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const join = async (claimId, name) => {
    setBusy(true); setError('');
    try {
      const gid = await DB.acceptInvite(token, claimId, name);
      onJoined(gid, false);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <main className="app-content">
      <div className="auth fade-in" style={{ textAlign: 'center' }}>
        {!preview && !error && <p>Checking invite…</p>}
        {preview && (
          <React.Fragment>
            <span className="gcard-ico lg" style={{ background: `${preview.color}26` }}>{preview.emoji}</span>
            <h1 className="auth-h">Join “{preview.group_name}”</h1>
            <p className="auth-p">{preview.member_count} {preview.member_count === 1 ? 'person' : 'people'} in this group.</p>

            {preview.placeholders.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: 20 }}>
                <p className="section-title" style={{ margin: '0 0 8px' }}>Are you one of these people?</p>
                <p style={{ color: 'var(--text-mute)', fontSize: 12, marginTop: 0 }}>
                  Pick your name to keep your existing expenses and balance.
                </p>
                {preview.placeholders.map((p) => (
                  <button key={p.id} type="button" className="btn btn-soft btn-full" disabled={busy}
                    style={{ justifyContent: 'flex-start', marginBottom: 8 }} onClick={() => join(p.id, null)}>
                    <Avatar name={p.display_name} size="sm" /> <span style={{ marginLeft: 10 }}>I'm {p.display_name}</span>
                  </button>
                ))}
              </div>
            )}

            <form style={{ textAlign: 'left', marginTop: 20 }}
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) join(null, newName.trim()); }}>
              <p className="section-title" style={{ margin: '0 0 8px' }}>
                {preview.placeholders.length > 0 ? "I'm someone new" : 'Your name in this group'}
              </p>
              <div className="field">
                <label className="field-label" htmlFor="sp-join-name">Name</label>
                <input id="sp-join-name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={!newName.trim() || busy}>
                {busy ? 'Joining…' : 'Join group'}
              </button>
            </form>
          </React.Fragment>
        )}
        {error && (
          <React.Fragment>
            <span className="gcard-ico lg">🔗</span>
            <p role="alert" style={{ color: 'var(--negative)' }}>{error}</p>
          </React.Fragment>
        )}
        <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: 12 }} onClick={onCancel}>Not now</button>
      </div>
    </main>
  );
}
