import React, { useEffect } from 'react';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { Avatar } from '../ui/primitives';

/** Plain-text version of a receipt, for sharing in a chat. */
export function receiptText(r) {
  const lines = r.kind === 'payment'
    ? [`${r.from} paid ${r.to} ${fmtINR(r.amount, true)}`, `${r.tripName} · ${r.groupName}`, fmtDate(r.date)]
    : [`${r.title}: ${fmtINR(r.amount, true)}`, `Paid by ${r.paidBy} · ${r.tripName} (${r.groupName})`,
      ...r.participants.map((p) => `• ${p.name}: ${fmtINR(p.share, true)}`), fmtDate(r.date)];
  return [...lines, 'Shared from SplitPro'].join('\n');
}

/**
 * Full-screen confirmation after an expense is added or a payment is
 * recorded. Shows only what was actually saved.
 */
export function ReceiptScreen({ receipt: r, self, onDone, onAddAnother, toast }) {
  useEffect(() => {
    if (!r) return;
    const onKey = (e) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r, onDone]);
  if (!r) return null;
  const who = (n) => (n === self ? 'You' : n);
  const share = async () => {
    const text = receiptText(r);
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Copied. Paste it in any chat.', 'success'); }
    } catch (e) { if (e?.name !== 'AbortError') toast('Could not share this', 'error'); }
  };
  const time = new Date(r.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="receipt-screen" role="dialog" aria-modal="true" aria-label={r.kind === 'payment' ? 'Payment recorded' : 'Expense added'}>
      <div className="receipt-inner fade-in">
        <span className="receipt-check" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <p className="receipt-status">{r.kind === 'payment' ? 'Payment recorded' : 'Expense added'}</p>
        <p className="receipt-amt">{fmtINR(r.amount, true)}</p>
        <p className="receipt-title">{r.kind === 'payment' ? `${who(r.from)} paid ${r.to === self ? 'you' : r.to}` : r.title}</p>

        <div className="receipt-card">
          <div className="receipt-line"><span>Group</span><b>{r.groupName}</b></div>
          <div className="receipt-line"><span>Trip</span><b>{r.tripName}</b></div>
          {r.kind === 'expense' && <div className="receipt-line"><span>Paid by</span><b>{who(r.paidBy)}</b></div>}
          <div className="receipt-line"><span>Date</span><b>{fmtDate(r.date)} · {time}</b></div>
          {r.kind === 'payment' && <p className="receipt-note">This records that the money changed hands. SplitPro did not move any money.</p>}
          {r.kind === 'expense' && (
            <React.Fragment>
              <p className="receipt-sub">Split between {r.participants.length} {r.participants.length === 1 ? 'person' : 'people'}</p>
              {r.participants.map((p) => (
                <div key={p.name} className="receipt-person">
                  <Avatar name={p.name} size="sm" />
                  <span>{who(p.name)}</span>
                  <b>{fmtINR(p.share, true)}</b>
                </div>
              ))}
            </React.Fragment>
          )}
        </div>

        <div className="receipt-actions">
          <button type="button" className="btn btn-primary btn-full" onClick={onDone}>{r.kind === 'payment' ? 'Done' : 'View trip'}</button>
          <div className="receipt-row">
            <button type="button" className="btn btn-ghost" onClick={share}>Share</button>
            {onAddAnother && <button type="button" className="btn btn-ghost" onClick={onAddAnother}>Add another</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
