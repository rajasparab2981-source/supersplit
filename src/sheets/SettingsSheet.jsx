import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { isValidVpa } from '../lib/upi';
import { Sheet } from '../ui/primitives';

/** Account and profile: your name, UPI ID for receiving payments, sign out. */
export function SettingsSheet({ open, onClose, toast }) {
  const user = DB.getUser();
  const profile = DB.getProfile();
  const [name, setName] = useState('');
  const [upi, setUpi] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(profile?.display_name || ''); setUpi(profile?.upi_id || ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const upiOk = upi.trim() === '' || isValidVpa(upi);
  const changed = name.trim() !== (profile?.display_name || '') || upi.trim() !== (profile?.upi_id || '');

  const save = async () => {
    setBusy(true);
    try {
      await DB.updateProfile({ display_name: name.trim(), upi_id: upi.trim() || null });
      toast('Profile saved', 'success');
    } catch (e) { toast('Save failed: ' + (e?.message || e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="settings-item">
        <div>
          <div className="label">Signed in</div>
          <div className="desc">{user?.email || user?.phone || '—'}</div>
        </div>
        {DB.isStaging() && <span className="badge-warn">Staging</span>}
      </div>

      <div className="spacer-2" />
      <div className="field">
        <label className="field-label" htmlFor="sp-name">Your name</label>
        <input id="sp-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sp-upi">Your UPI ID (so friends can pay you)</label>
        <input id="sp-upi" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="name@oksbi"
          value={upi} onChange={(e) => setUpi(e.target.value)} />
        {!upiOk && <p className="split-hint" style={{ color: 'var(--negative)' }}>That doesn't look like a UPI ID (e.g. name@oksbi)</p>}
      </div>
      <button className="btn btn-primary btn-full" disabled={!changed || !upiOk || !name.trim() || busy} onClick={save}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>

      <div className="settings-item" style={{ marginTop: 16 }}>
        <div>
          <div className="label">Currency</div>
          <div className="desc">en-IN formatting</div>
        </div>
        <span style={{ fontFamily: 'Manrope', fontWeight: 700, color: 'var(--primary)' }}>₹ INR</span>
      </div>

      <div className="spacer-3" />
      <button className="btn btn-ghost btn-full" onClick={async () => { onClose(); await DB.signOut(); }}>Sign out</button>
    </Sheet>
  );
}
