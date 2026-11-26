import React from 'react';
import { BrandMark, Li } from './LineIcons';

const LEFT = [{ id: 'home', label: 'Home', Icon: Li.Home }, { id: 'groups', label: 'Groups', Icon: Li.Groups }];
const RIGHT = [{ id: 'trips', label: 'Trips', Icon: Li.Trips }, { id: 'profile', label: 'Profile', Icon: Li.Profile }];

/** Tab bar: Home, Groups, [Add expense], Trips, Profile. */
export function BottomNav({ active, onChange, onAdd }) {
  const tab = ({ id, label, Icon }) => (
    <button key={id} type="button" className={`bottom-nav-item ${active === id ? 'active' : ''}`}
      aria-current={active === id ? 'page' : undefined} onClick={() => onChange(id)}>
      <Icon />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="nav-brand" aria-hidden="true"><BrandMark size={32} /><span className="brand-name">Split<b>Pro</b></span></div>
      {LEFT.map(tab)}
      <button type="button" className="bottom-nav-add" onClick={onAdd} aria-label="Add expense">
        <span className="add-disc"><Li.Plus size={26} strokeWidth={2.4} /></span>
        <span className="add-label">Add</span><span className="add-label-wide">Add expense</span>
      </button>
      {RIGHT.map(tab)}
    </nav>
  );
}
