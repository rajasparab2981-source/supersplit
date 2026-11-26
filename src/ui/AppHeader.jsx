import React, { useEffect, useState } from 'react';
import { BrandMark, Li } from './LineIcons';
import { Avatar } from './primitives';

/**
 * Sticky header. On Home: brand, plan indicator and your avatar.
 * On other screens: back, title and the calculator.
 */
export function AppHeader({ home, bare, title, subtitle, onBack, onCalc, plan, name, onProfile, onPlan }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (home) {
    const pill = plan?.plan === 'trial' ? `Trial · ${plan.days_left}d` : plan?.plan === 'premium' ? 'Premium' : null;
    return (
      <header className={`app-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Split<b>Pro</b></span>
          {subtitle && <span className="badge-warn" style={{ marginLeft: 4 }}>{subtitle}</span>}
        </div>
        {!bare && <div className="header-actions">
          {pill && (
            <button type="button" className="premium-pill" onClick={onPlan || onProfile} aria-label={`Your plan: ${pill}`}>
              <Li.Star size={14} /> {pill}
            </button>
          )}
          <button type="button" className="avatar-btn" onClick={onProfile} aria-label="Your profile">
            <Avatar name={name || '?'} size="sm" />
          </button>
        </div>}
      </header>
    );
  }

  return (
    <header className={`app-header ${scrolled ? 'scrolled' : ''}`}>
      <div style={{ width: 44, display: 'flex', alignItems: 'center' }}>
        {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Back"><Li.Back size={24} /></button> : null}
      </div>
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 8px' }}>
        <h1>{title}</h1>
        {subtitle ? <p className="crumb">{subtitle}</p> : null}
      </div>
      <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {onCalc ? <button className="icon-btn" onClick={onCalc} aria-label="Calculator"><Li.Calc /></button> : null}
      </div>
    </header>
  );
}
