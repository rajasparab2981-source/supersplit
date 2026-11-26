import React from 'react';

// SplitPro line icons: one stroke weight, rounded joins, 24px grid.
const make = (children) => function LineIcon({ size = 22, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
  );
};

export const Li = {
  Home: make(<><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>),
  Groups: make(<><circle cx="9" cy="8.5" r="3.3" /><path d="M2.8 19.5c.4-3.3 3-5.3 6.2-5.3s5.8 2 6.2 5.3" /><path d="M16.2 5.6a3.3 3.3 0 0 1 0 5.8" /><path d="M18.4 14.6c1.6.8 2.6 2.4 2.8 4.9" /></>),
  Plus: make(<><path d="M12 5v14M5 12h14" /></>),
  Trips: make(<><path d="M20.5 3.5 3.5 10.6l6.6 2.3 2.3 6.6 8.1-16Z" /><path d="m10.1 12.9 4.3-4.3" /></>),
  Profile: make(<><circle cx="12" cy="8.2" r="3.8" /><path d="M4.5 20.5c.6-3.9 3.6-6.2 7.5-6.2s6.9 2.3 7.5 6.2" /></>),
  Receipt: make(<><path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17Z" /><path d="M9 8.5h6M9 12h6" /></>),
  GroupAdd: make(<><circle cx="9.5" cy="8.5" r="3.3" /><path d="M3.3 19.5c.4-3.3 3-5.3 6.2-5.3 1.6 0 3 .5 4.1 1.3" /><path d="M18 13.5v6M15 16.5h6" /></>),
  Handshake: make(<><path d="M3 8.5 7 7l4 1.5 2-1 4 1.5 4-1.5" /><path d="M3 8.5v7l3.5 1.5L11 20l2-1 2 .5 6-4.5V7.5" /><path d="m11 8.5-2.5 3 2 1.2L13 10" /></>),
  Compass: make(<><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>),
  Chart: make(<><path d="M4 20V11M10 20V4.5M16 20v-7M20.5 20h-17" /></>),
  Split: make(<><path d="M12 3.5v6" /><path d="M12 9.5c0 4-6 3-6 8v3M12 9.5c0 4 6 3 6 8v3" /><path d="m3.8 18.3 2.2 2.2 2.2-2.2M15.8 18.3l2.2 2.2 2.2-2.2" /></>),
  Bell: make(<><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>),
  Alert: make(<><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5M12 17.2v.3" /></>),
  Wallet: make(<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5v9A2.5 2.5 0 0 0 6.5 19H20V8H6.5A2.5 2.5 0 0 1 4 7.5Z" /><path d="M16 13.5h.5" /></>),
  Star: make(<><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z" /></>),
  Close: make(<><path d="M6 6l12 12M18 6 6 18" /></>),
  Chevron: make(<><path d="m9 5.5 6.5 6.5L9 18.5" /></>),
  Calc: make(<><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 7.5h7M8.5 12h.5M12 12h.5M15.5 12h.5M8.5 16h.5M12 16h.5M15.5 16h.5" /></>),
  Back: make(<><path d="M15 5.5 8.5 12l6.5 6.5" /></>),
};

/** SplitPro mark: a coin split in two, on the brand navy. */
export function BrandMark({ size = 34 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SplitPro">
      <rect width="64" height="64" rx="16" fill="#142B4A" />
      <path d="M30 14a18 18 0 0 0 0 36V14Z" fill="#FFFFFF" />
      <path d="M36 16.5a18 18 0 0 1 0 31V16.5Z" fill="#00B8A9" />
    </svg>
  );
}
