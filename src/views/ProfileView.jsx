import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { getThemeChoice, setThemeChoice } from '../lib/theme';
import { isValidVpa } from '../lib/upi';
import { Li } from '../ui/LineIcons';
import { Avatar } from '../ui/primitives';

/** Account, plan, your details, appearance and legal links. */
export function ProfileView({ plan, toast, onOpenPlan }) {
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

  const kind = plan?.plan || 'free';
  const planTitle = kind === 'trial' ? 'Premium trial' : kind === 'premium' ? 'Premium' : 'Free plan';
  const planSub = kind === 'trial' ? `${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left · no payment needed`
    : kind === 'premium' ? 'Active' : 'Premium features are paused';

  return (
    <div className="fade-in">
      <section className="pf-card">
        <Avatar name={profile?.display_name || '?'} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="pf-name">{profile?.display_name || 'Your account'}</p>
          <p className="pf-mail">{user?.email || (DB.isStaging() ? 'Test user' : '')}</p>
        </div>
        {DB.isStaging() && <span className="badge-warn">Test</span>}
      </section>

      <div className="list-card" style={{ marginTop: 12 }}>
        <button type="button" className="list-row" onClick={onOpenPlan}>
          <span className="pf-ico star"><Li.Star size={18} /></span>
          <span className="list-main">
            <span className="list-title"><b>{planTitle}</b></span>
            <span className="list-sub">{planSub}</span>
          </span>
          <span className="gcard-chev"><Li.Chevron size={18} /></span>
        </button>
      </div>

      <div className="section-head"><h2>Your details</h2></div>
      <div className="field">
        <label className="field-label" htmlFor="sp-name">Your name</label>
        <input id="sp-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sp-upi">Your UPI ID (so friends can pay you)</label>
        <input id="sp-upi" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="name@oksbi"
          value={upi} onChange={(e) => setUpi(e.target.value)} aria-invalid={!upiOk} aria-describedby={upiOk ? undefined : 'sp-upi-err'} />
        {!upiOk && <p id="sp-upi-err" className="split-hint" style={{ color: 'var(--negative)' }}>That doesn't look like a UPI ID (e.g. name@oksbi)</p>}
      </div>
      <button className="btn btn-primary btn-full" disabled={!changed || !upiOk || !name.trim() || busy} onClick={save}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>

      <div className="section-head"><h2>Appearance</h2></div>
      <div className="seg" role="group" aria-label="Theme">
        {[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={theme === id} onClick={() => pickTheme(id)}>{label}</button>
        ))}
      </div>

      <div className="section-head"><h2>About</h2></div>
      <div className="list-card">
        <div className="list-row">
          <span className="list-main"><span className="list-title">Currency</span></span>
          <span className="list-amt">₹ INR</span>
        </div>
        <a className="list-row" href="/privacy">
          <span className="list-main"><span className="list-title">Privacy Policy</span></span>
          <span className="gcard-chev"><Li.Chevron size={18} /></span>
        </a>
        <a className="list-row" href="/terms">
          <span className="list-main"><span className="list-title">Terms of Use</span></span>
          <span className="gcard-chev"><Li.Chevron size={18} /></span>
        </a>
        <a className="list-row" href="mailto:splitpro.app@gmail.com?subject=SplitPro%20account%20deletion">
          <span className="list-main">
            <span className="list-title">Request account deletion</span>
            <span className="list-sub">Opens an email to SplitPro support</span>
          </span>
          <span className="gcard-chev"><Li.Chevron size={18} /></span>
        </a>
      </div>

      <div className="spacer-3" />
      <button className="btn btn-ghost btn-full" onClick={() => DB.signOut()}>Sign out</button>
      <div className="spacer-fab" />
    </div>
  );
}
