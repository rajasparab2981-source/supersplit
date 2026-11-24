import React, { useState, useEffect } from 'react';
import { fmtINR } from '../lib/money';
import { buildUpiUri, isMobile } from '../lib/upi';
import { Sheet } from '../ui/primitives';

export function UpiPaySheet({ open, onClose, transfer, knownVpa, tripName, onSaveVpa, toast }) {
  const [vpa, setVpa] = useState(knownVpa || '');
  // Only reset when sheet opens (false→true) or when targeting a different recipient.
  // Polling-driven re-renders must not wipe what the user just typed.
  const transferKey = transfer ? `${transfer.from}->${transfer.to}@${transfer.amount}` : null;
  useEffect(() => {
    if (open) setVpa(knownVpa || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transferKey]);

  if (!transfer) return null;

  const cleanVpa = vpa.trim();
  const validVpa = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(cleanVpa);

  const pay = () => {
    if (!validVpa) {
      toast('Enter a valid UPI ID (e.g. mustafa@oksbi)', 'error');
      return;
    }
    onSaveVpa(transfer.to, cleanVpa);
    const uri = buildUpiUri({
      vpa: cleanVpa,
      name: transfer.to,
      amount: transfer.amount,
      note: tripName ? `SplitPro · ${tripName}` : 'SplitPro',
    });
    if (isMobile()) {
      window.location.href = uri;
    } else {
      // Desktop: copy URI for user to send to themselves / paste in a UPI client
      try {
        navigator.clipboard.writeText(uri);
        toast('UPI link copied — open on your phone to pay', 'success');
      } catch {
        window.open(uri, '_blank');
      }
    }
    onClose();
  };

  const copyUri = () => {
    if (!validVpa) return;
    const uri = buildUpiUri({ vpa: cleanVpa, name: transfer.to, amount: transfer.amount, note: tripName ? `SplitPro · ${tripName}` : 'SplitPro' });
    try {
      navigator.clipboard.writeText(uri);
      onSaveVpa(transfer.to, cleanVpa);
      toast('UPI link copied to clipboard', 'success');
    } catch { toast('Copy failed', 'error'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Pay via UPI">
      <div className="summary" style={{ padding: 18, marginBottom: 16 }}>
        <p className="label">{transfer.from} pays {transfer.to}</p>
        <p className="net pos" style={{ marginTop: 8 }}>{fmtINR(transfer.amount)}</p>
      </div>

      <div className="field">
        <label className="field-label">{transfer.to}'s UPI ID</label>
        <input
          autoFocus
          placeholder="e.g. mustafa@oksbi"
          value={vpa}
          onChange={(e) => setVpa(e.target.value)}
          inputMode="email"
          spellCheck="false"
          autoCapitalize="none"
        />
        <p className="split-hint" style={{ color: 'var(--text-mute)' }}>
          Saved for {transfer.to} so you won't need to ask again.
        </p>
      </div>

      <div className="spacer-1" />
      <button className="btn btn-primary btn-full" onClick={pay} disabled={!validVpa}>
        {isMobile() ? 'Open UPI app' : 'Copy UPI link'}
      </button>

      {isMobile() && (
        <React.Fragment>
          <div className="spacer-1" />
          <button className="btn btn-ghost btn-full" onClick={copyUri} disabled={!validVpa}>
            Copy link instead
          </button>
        </React.Fragment>
      )}

      <p style={{ color: 'var(--text-mute)', fontSize: 11, textAlign: 'center', marginTop: 14 }}>
        Opens GPay / PhonePe / Paytm / any UPI app with the amount pre-filled. You still confirm and PIN inside the app.
      </p>
    </Sheet>
  );
}
