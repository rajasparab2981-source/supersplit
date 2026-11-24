import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { Sheet } from '../ui/primitives';

/** Creates a fresh invite link for the group and lets you share or copy it. */
export function InviteSheet({ open, onClose, group, toast }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !group) return;
    setLink(''); setError('');
    DB.createInvite(group.id)
      .then((token) => setLink(`${window.location.origin}/join/${token}`))
      .catch((e) => setError(e?.message || String(e)));
  }, [open, group?.id]);

  const message = group ? `Join "${group.name}" on SplitPro to split expenses: ${link}` : link;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${group.name} on SplitPro`, text: message }); return; } catch { /* cancelled */ }
    }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Invite link copied', 'success'); }
    catch { toast('Copy failed — select the link and copy it', 'error'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite people">
      <p style={{ color: 'var(--text-soft)', fontSize: 14, marginTop: 0 }}>
        Anyone with this link can join <strong>{group?.name}</strong> for the next 7 days.
        Friends you already added by name can claim that name, so their past expenses stay theirs.
      </p>
      {error && <p role="alert" style={{ color: 'var(--negative)' }}>{error}</p>}
      <div className="code-block" style={{ wordBreak: 'break-all', minHeight: 44 }}>{link || 'Creating link…'}</div>
      <div className="spacer-2" />
      <button className="btn btn-primary btn-full" disabled={!link} onClick={share}>Share link</button>
      <div className="spacer-1" />
      <a className="btn btn-soft btn-full" aria-disabled={!link}
        href={link ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noreferrer">
        Send on WhatsApp
      </a>
      <div className="spacer-1" />
      <button className="btn btn-ghost btn-full" disabled={!link} onClick={copy}>Copy link</button>
    </Sheet>
  );
}
