import React from 'react';

const ico = (d) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const TABS = [
  { id: 'home', label: 'Home', icon: ico(<React.Fragment><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></React.Fragment>) },
  { id: 'groups', label: 'Groups', icon: ico(<React.Fragment><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.3c2.1.7 3.5 2.6 3.5 5.7" /></React.Fragment>) },
  { id: 'trips', label: 'Trips', icon: ico(<React.Fragment><path d="M21 3L3 10.5l7 2.5 2.5 7L21 3z" /></React.Fragment>) },
  { id: 'analytics', label: 'Analytics', icon: ico(<React.Fragment><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></React.Fragment>) },
  { id: 'profile', label: 'Profile', icon: ico(<React.Fragment><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></React.Fragment>) },
];

/** Five-tab bar fixed to the bottom of the app column. */
export function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={`bottom-nav-item ${active === t.id ? 'active' : ''}`}
          aria-current={active === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
