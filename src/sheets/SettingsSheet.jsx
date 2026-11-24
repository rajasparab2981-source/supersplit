import React from 'react';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/primitives';

export function SettingsSheet({ open, onClose, mode, supaConfig, onOpenSupabase, onResetAll, onForgetPasscode }) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="settings-item" onClick={onOpenSupabase} style={{ cursor: 'pointer' }}>
        <div>
          <div className="label">Supabase sync</div>
          <div className="desc">
            {mode === 'supabase' ? 'Connected · real-time sync active' : 'Tap to connect for real-time sync'}
          </div>
        </div>
        <span className={mode === 'supabase' ? 'badge-ok' : 'badge-warn'}>
          {mode === 'supabase' ? <React.Fragment><Icon.Sync /> Live</React.Fragment> : 'Set up'}
        </span>
      </div>

      <div className="settings-item">
        <div>
          <div className="label">Currency</div>
          <div className="desc">en-IN formatting</div>
        </div>
        <span style={{ fontFamily: 'Manrope', fontWeight: 700, color: 'var(--primary)' }}>₹ INR</span>
      </div>

      <div className="settings-item">
        <div>
          <div className="label">Storage</div>
          <div className="desc">{mode === 'supabase' ? 'Supabase Postgres' : 'localStorage on this device'}</div>
        </div>
      </div>

      <div className="spacer-3" />
      {mode === 'supabase' ? (
        // Shared cloud data: no one-tap wipe for the whole group.
        <React.Fragment>
          <button className="btn btn-ghost btn-full" onClick={onForgetPasscode}>Forget passcode on this device</button>
          <p style={{ color: 'var(--text-mute)', fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            Use this on a shared or borrowed phone. You’ll need the passcode to get back in.
          </p>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <button className="btn btn-danger btn-full" onClick={onResetAll}>Reset all data</button>
          <p style={{ color: 'var(--text-mute)', fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            Permanently deletes everything in localStorage on this device.
          </p>
        </React.Fragment>
      )}
    </Sheet>
  );
}
