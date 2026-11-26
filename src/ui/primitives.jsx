import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AVATAR_COLORS, COLORS } from '../lib/constants';
import { Icon } from './Icon';

export function hashStr(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xfffffff;
  return h;
}

export function avatarColors(name) { return AVATAR_COLORS[hashStr(name) % AVATAR_COLORS.length]; }

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 'md' }) {
  const [a, b] = avatarColors(name);
  return (
    <span
      className={`avatar ${size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : ''}`}
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);
  return { toasts, push };
}

// CSS-only confetti. Fires once, parent removes after animation.
export function Celebration({ message }) {
  const confetti = useMemo(() => {
    const colors = ['var(--accent)', 'var(--accent2)', 'var(--warning-fill)', 'var(--negative)', '#3DA9FC', '#FF7AB6'];
    const arr = [];
    for (let i = 0; i < 80; i++) {
      arr.push({
        id: i,
        left: Math.random() * 100,
        x: (Math.random() - 0.5) * 240,
        rot: 360 + Math.random() * 720,
        dur: 2 + Math.random() * 1.6,
        delay: Math.random() * 0.4,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 10,
      });
    }
    return arr;
  }, []);
  return (
    <React.Fragment>
      <div className="confetti-stage" aria-hidden="true">
        {confetti.map((c) => (
          <span
            key={c.id}
            className="confetti"
            style={{
              left: c.left + '%',
              background: c.color,
              width: c.size + 'px',
              height: (c.size * 1.6) + 'px',
              animationDelay: c.delay + 's',
              '--x': c.x + 'px',
              '--rot': c.rot + 'deg',
              '--dur': c.dur + 's',
            }}
          />
        ))}
      </div>
      <div className="celebrate-banner">
        <div style={{ fontSize: 56, marginBottom: 4 }}>🎉</div>
        <h2>All squared up!</h2>
        <p>{message || 'Everyone\'s settled — enjoy the trip.'}</p>
      </div>
    </React.Fragment>
  );
}

export function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '!' : '·'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Simple action menu (kebab popover) ----------
export function ActionsSheet({ open, onClose, title, actions }) {
  // actions: [{ label, danger, onClick, icon }]
  return (
    <Sheet open={open} onClose={onClose} title={title || 'Actions'}>
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => { a.onClick(); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 18px',
            background: 'var(--surface)',
            border: '1px solid ' + (a.danger ? 'rgb(var(--negative-rgb) / .25)' : 'var(--border)'),
            borderRadius: 'var(--r-2)',
            color: a.danger ? 'var(--negative)' : 'var(--text)',
            fontFamily: 'Inter', fontWeight: 600, fontSize: 15,
            textAlign: 'left',
            marginBottom: 8,
            cursor: 'pointer',
            transition: 'background .15s ease',
          }}
        >
          {a.icon || null}
          <span style={{ flex: 1 }}>{a.label}</span>
        </button>
      ))}
      <div className="spacer-1" />
      <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
      <div className="spacer-1" />
    </Sheet>
  );
}

// Locks background scrolling while any sheet is open, and restores the exact
// scroll offset on close. Reference-counted because sheets can stack
// (e.g. Settings → Supabase setup).
let __scrollLockCount = 0;

let __scrollLockY = 0;

export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    if (__scrollLockCount === 0) {
      __scrollLockY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${__scrollLockY}px`;
      document.body.classList.add('sheet-open');
    }
    __scrollLockCount += 1;
    return () => {
      __scrollLockCount -= 1;
      if (__scrollLockCount === 0) {
        document.body.classList.remove('sheet-open');
        document.body.style.top = '';
        window.scrollTo(0, __scrollLockY);
      }
    };
  }, [active]);
}

export function Sheet({ open, onClose, title, onSave, saveLabel = 'Save', canSave = true, children }) {
  useBodyScrollLock(open);

  // Escape closes the sheet (desktop + hardware keyboards).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="sheet-cancel" onClick={onClose}>Cancel</button>
          <h3 className="sheet-title">{title}</h3>
          {onSave ? (
            <button className="sheet-save" onClick={onSave} disabled={!canSave}>{saveLabel}</button>
          ) : <span style={{ width: 60, flexShrink: 0 }} />}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </React.Fragment>
  );
}

export function EmojiPicker({ pool, value, onChange }) {
  return (
    <div className="emoji-picker">
      {pool.map((em) => (
        <button key={em} type="button"
          className={`emoji-cell ${em === value ? 'active' : ''}`}
          onClick={() => onChange(em)}>{em}</button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <div className="swatches">
      {COLORS.map((c) => (
        <button key={c} type="button"
          className={`swatch ${c === value ? 'active' : ''}`}
          style={{ background: `linear-gradient(135deg, ${c} 0%, color-mix(in srgb, ${c} 60%, #000) 100%)` }}
          onClick={() => onChange(c)} aria-label={`Color ${c}`} />
      ))}
    </div>
  );
}

export function Header({ title, subtitle, onBack, onSettings, onCalc, syncStatus }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`app-header ${scrolled ? 'scrolled' : ''}`}>
      <div style={{ width: 44, display: 'flex', alignItems: 'center' }}>
        {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon.Back /></button> : null}
      </div>
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 8px' }}>
        <h1>{title}</h1>
        {subtitle ? <p className="crumb">{subtitle}</p> : null}
      </div>
      <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
        {syncStatus === 'live' && (
          <span title="Live sync" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)', marginRight: 4 }} />
        )}
        {onCalc ? <button className="icon-btn" onClick={onCalc} aria-label="Calculator"><Icon.Calc /></button> : null}
        {onSettings ? <button className="icon-btn" onClick={onSettings} aria-label="Settings"><Icon.Gear /></button> : null}
      </div>
    </header>
  );
}

export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete' }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p style={{ color: 'var(--text-soft)', marginTop: 4, fontSize: 14 }}>{message}</p>
      <div className="spacer-2" />
      <button className="btn btn-danger btn-full" onClick={onConfirm}>{confirmLabel}</button>
      <div className="spacer-1" />
      <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
      <div className="spacer-1" />
    </Sheet>
  );
}
