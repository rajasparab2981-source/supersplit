import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { fmtDate } from '../lib/dates';
import { getThemeChoice, setThemeChoice } from '../lib/theme';
import { isValidVpa } from '../lib/upi';
import { Avatar } from '../ui/primitives';

const FREE = ['Groups, trips and expenses', 'Equal, percentage and exact splits', 'Balances and settle-up with UPI', 'Basic spending dashboard'];
const PREMIUM = ['Advanced analytics and insights', 'Smart Trip Planner and budgets', 'Receipt scanning', 'Reports in PDF, Excel and CSV', 'Custom categories, multi-currency'];

function PlanCard({ plan }) {
  if (!plan) return null;
  const ends = plan.plan === 'premium' ? plan.premium_until : plan.trial_ends_at;
  const title = plan.plan === 'trial' ? 'Premium trial' : plan.plan === 'premium' ? 'Premium' : 'Free plan';
  const line = plan.plan === 'trial'
    ? `${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left, until ${fmtDate(String(ends).slice(0, 10))}. No payment details needed.`
    : plan.plan === 'premium'
      ? `Active until ${fmtDate(String(ends).slice(0, 10))}.`
      : 'Your trial has ended. Premium features are paused; everything else keeps working. Subscriptions are coming soon.';
  return (
    <div className="summary" id="plan" style={{ marginTop: 16 }}>
      <div className="grain" />
      <p className="label" style={{ color: plan.plan === 'free' ? 'var(--text-soft)' : 'var(--primary)' }}>★ {title}</p>
      <p className="sub" style={{ marginTop: 6 }}>{line}</p>
      <div className="plan-cols">
        <div>
          <p className="plan-col-title">Always free</p>
          <ul>{FREE.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
        <div>
          <p className="plan-col-title" style={{ color: 'var(--primary)' }}>Premium</p>
          <ul>{PREMIUM.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      </div>
      <p className="sub" style={{ fontSize: 12 }}>Premium features are being released one by one. Planned price: ₹79 a month or ₹599 a year.</p>
    </div>
  );
}

/** Account, profile and plan. Replaces the old Settings sheet. */
export function ProfileView({ plan, toast }) {
  const user = DB.getUser();
  const profile = DB.getProfile();
  const [name, setName] = useState(profile?.display_name || '');
  const [upi, setUpi] = useState(profile?.upi_id || '');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(getThemeChoice);
  const pickTheme = (t) => { setThemeChoice(t); setTheme(t); };

  // Fill in once the profile arrives; don't overwrite what the person is typing.
  useEffect(() => {
    setName((v) => v || profile?.display_name || '');
    setUpi((v) => v || profile?.upi_id || '');
  }, [profile?.display_name, profile?.upi_id]);

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
    <React.Fragment>
      <div className="settings-item" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Avatar name={profile?.display_name || '?'} />
          <div style={{ minWidth: 0 }}>
            <div className="label">{profile?.display_name || 'Your account'}</div>
            <div className="desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || '—'}</div>
          </div>
        </div>
        {DB.isStaging() && <span className="badge-warn">Staging</span>}
      </div>

      <PlanCard plan={plan} />

      <p className="section-title">Your details</p>
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
        <span style={{ fontFamily: 'Inter', fontWeight: 700, color: 'var(--primary)' }}>₹ INR</span>
      </div>

      <p className="section-title">Appearance</p>
      <div className="seg" role="group" aria-label="Theme">
        {[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={theme === id} onClick={() => pickTheme(id)}>{label}</button>
        ))}
      </div>

      <div className="spacer-3" />
      <button className="btn btn-ghost btn-full" onClick={() => DB.signOut()}>Sign out</button>
      <p style={{ color: 'var(--text-mute)', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
        <a href="/privacy" style={{ color: 'var(--text-soft)' }}>Privacy Policy</a>
        {' · '}
        <a href="mailto:splitpro.app@gmail.com?subject=SplitPro%20account%20deletion" style={{ color: 'var(--text-soft)' }}>Request account deletion</a>
      </p>
      <div className="spacer-fab" />
    </React.Fragment>
  );
}
