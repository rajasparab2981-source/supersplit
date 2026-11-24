import React, { useState, useEffect } from 'react';
import { COLORS, GROUP_EMOJIS, TRIP_EMOJIS } from '../lib/constants';
import { Icon } from '../ui/Icon';
import { Avatar, ColorPicker, EmojiPicker, Sheet } from '../ui/primitives';

// ---------- Sheets ----------
export function AddGroupSheet({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);
  useEffect(() => { if (open) { setName(''); setEmoji(GROUP_EMOJIS[0]); setColor(COLORS[0]); } }, [open]);
  const submit = () => { if (!name.trim()) return; onCreate({ name: name.trim(), emoji, color }); };
  return (
    <Sheet open={open} onClose={onClose} title="New group" onSave={submit} saveLabel="Create" canSave={!!name.trim()}>
      <div className="field">
        <label className="field-label">Group name</label>
        <input autoFocus placeholder="Goa Squad" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </div>
      <div className="field">
        <label className="field-label">Accent color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="field">
        <label className="field-label">Emoji</label>
        <EmojiPicker pool={GROUP_EMOJIS} value={emoji} onChange={setEmoji} />
      </div>
    </Sheet>
  );
}

export function AddMemberSheet({ open, onClose, onCreate, existingNames }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  const trimmed = name.trim();
  const taken = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const canSave = trimmed.length > 0 && !taken;
  const submit = () => { if (canSave) onCreate(trimmed); };
  return (
    <Sheet open={open} onClose={onClose} title="Add member" onSave={submit} saveLabel="Add" canSave={canSave}>
      <div className="field">
        <label className="field-label">Name</label>
        <input autoFocus placeholder="Mustafa" value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        {taken && <p style={{ color: 'var(--negative)', fontSize: 13, marginTop: 8 }}>A member with this name already exists.</p>}
      </div>
    </Sheet>
  );
}

export function AddTripSheet({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(TRIP_EMOJIS[0]);
  useEffect(() => { if (open) { setName(''); setEmoji(TRIP_EMOJIS[0]); } }, [open]);
  const submit = () => { if (!name.trim()) return; onCreate({ name: name.trim(), emoji }); };
  return (
    <Sheet open={open} onClose={onClose} title="New trip" onSave={submit} saveLabel="Create" canSave={!!name.trim()}>
      <div className="field">
        <label className="field-label">Trip name</label>
        <input autoFocus placeholder="Goa Dec 2024" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
      </div>
      <div className="field">
        <label className="field-label">Emoji</label>
        <EmojiPicker pool={TRIP_EMOJIS} value={emoji} onChange={setEmoji} />
      </div>
    </Sheet>
  );
}

export function SelfPickerSheet({ open, onClose, members, current, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="Who are you?">
      <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 0 }}>
        Pick yourself from the group's members. The app uses this to show personalized "you owe" / "you're owed" amounts.
      </p>
      <div className="spacer-1" />
      <div>
        {members.map((m) => (
          <div key={m.id} className="exp-row" onClick={() => { onPick(m.name); onClose(); }}>
            <Avatar name={m.name} size="lg" />
            <div className="exp-main">
              <p className="exp-desc">{m.name}</p>
              {m.name === current && <p className="exp-payer" style={{ color: 'var(--primary)' }}>Currently selected</p>}
            </div>
            {m.name === current && <Icon.Check style={{ color: 'var(--primary)' }} />}
          </div>
        ))}
        {current && (
          <React.Fragment>
            <div className="spacer-2" />
            <button className="btn btn-ghost btn-full" onClick={() => { onPick(null); onClose(); }}>Clear selection</button>
          </React.Fragment>
        )}
      </div>
    </Sheet>
  );
}
