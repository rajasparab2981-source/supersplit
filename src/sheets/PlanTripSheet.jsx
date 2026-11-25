import React, { useEffect, useState } from 'react';
import { TRIP_EMOJIS } from '../lib/constants';
import { toPaise } from '../lib/money';
import { tripLength } from '../lib/tripPlan';
import { EmojiPicker, Sheet } from '../ui/primitives';

const TYPES = [['solo', 'Solo'], ['couple', 'Couple'], ['friends', 'Friends'], ['family', 'Family'], ['group', 'Group']];
const STYLES = [['budget', 'Budget'], ['standard', 'Standard'], ['premium', 'Premium'], ['luxury', 'Luxury']];
const numOrNull = (v) => (v === '' || v == null ? null : Math.max(0, Math.floor(Number(v))));

/**
 * Create a trip plan, or edit an existing trip's details. Only the name (and
 * a group, when creating) is required; everything else can be filled in later.
 */
export function PlanTripSheet({ open, onClose, groups = [], trip, onSave }) {
  const editing = !!trip;
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setF({
      group_id: trip?.group_id || groups[0]?.id || '',
      name: trip?.name || '', emoji: trip?.emoji || '🏖️',
      destination: trip?.destination || '', start_location: trip?.start_location || '',
      start_date: trip?.start_date || '', end_date: trip?.end_date || '',
      adults: trip?.adults ?? '', children: trip?.children ?? '',
      travel_type: trip?.travel_type || '', travel_style: trip?.travel_style || '',
      budget: trip?.budget_minor != null ? String(trip.budget_minor / 100) : '',
      buffer_pct: trip?.buffer_pct != null ? String(Number(trip.buffer_pct)) : '10',
      transport: trip?.prefs?.transport || '', stay: trip?.prefs?.stay || '', activities: trip?.prefs?.activities || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip?.id]);

  const datesOk = !f.start_date || !f.end_date || f.end_date >= f.start_date;
  const bufferOk = f.buffer_pct === '' || (Number(f.buffer_pct) >= 0 && Number(f.buffer_pct) <= 100);
  const valid = (f.name || '').trim().length > 0 && (editing || !!f.group_id) && datesOk && bufferOk;
  const days = tripLength({ id: '', start_date: f.start_date, end_date: f.end_date });

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave({
        group_id: f.group_id, name: f.name.trim(), emoji: f.emoji,
        details: {
          destination: f.destination, start_location: f.start_location,
          start_date: f.start_date || null, end_date: f.end_date || null,
          adults: numOrNull(f.adults), children: numOrNull(f.children),
          travel_type: f.travel_type || null, travel_style: f.travel_style || null,
          budget_minor: f.budget === '' ? null : toPaise(f.budget),
          buffer_pct: f.buffer_pct === '' ? 10 : Number(f.buffer_pct),
          prefs: { transport: f.transport.trim(), stay: f.stay.trim(), activities: f.activities.trim() },
        },
      });
    } finally { setBusy(false); }
  };
  const chips = (key, options) => (
    <div className="chips">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={`chip selectable ${f[key] === id ? 'active soft' : ''}`}
          aria-pressed={f[key] === id} onClick={() => set(key)(f[key] === id ? '' : id)}>{label}</button>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Trip details' : 'Plan a trip'} onSave={submit}
      saveLabel={busy ? 'Saving…' : editing ? 'Save' : 'Create'} canSave={valid && !busy}>
      <p className="muted-note" style={{ marginTop: 0 }}>Only the name is needed. Add the rest whenever you know it.</p>
      <div className="field">
        <label className="field-label" htmlFor="pt-name">Trip name</label>
        <input id="pt-name" maxLength={60} placeholder="Goa with friends" value={f.name || ''} onChange={set('name')} />
      </div>
      {!editing && (
        <div className="field">
          <label className="field-label" htmlFor="pt-group">Who is going? (group)</label>
          <select id="pt-group" className="plain-select" value={f.group_id || ''} onChange={set('group_id')}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select>
          <p className="split-hint">The group's members share this plan. For other people, create a new group first.</p>
        </div>
      )}
      <div className="field">
        <label className="field-label">Icon</label>
        <EmojiPicker pool={TRIP_EMOJIS} value={f.emoji} onChange={set('emoji')} />
      </div>
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="pt-dest">Destination</label>
          <input id="pt-dest" maxLength={80} placeholder="Goa" value={f.destination || ''} onChange={set('destination')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pt-from">Starting from</label>
          <input id="pt-from" maxLength={80} placeholder="Mumbai" value={f.start_location || ''} onChange={set('start_location')} />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="pt-start">Departure</label>
          <input id="pt-start" type="date" value={f.start_date || ''} onChange={set('start_date')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pt-end">Return</label>
          <input id="pt-end" type="date" min={f.start_date || undefined} value={f.end_date || ''} onChange={set('end_date')} />
        </div>
      </div>
      {!datesOk && <p className="split-hint" style={{ color: 'var(--negative)' }}>The return date is before the departure date.</p>}
      {days && <p className="split-hint">{days} day{days === 1 ? '' : 's'}</p>}
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="pt-adults">Adults</label>
          <input id="pt-adults" type="number" inputMode="numeric" min="0" value={f.adults ?? ''} onChange={set('adults')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pt-children">Children</label>
          <input id="pt-children" type="number" inputMode="numeric" min="0" value={f.children ?? ''} onChange={set('children')} />
        </div>
      </div>
      <div className="field"><label className="field-label">Travel type</label>{chips('travel_type', TYPES)}</div>
      <div className="field"><label className="field-label">Travel style</label>{chips('travel_style', STYLES)}</div>
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="pt-budget">Overall budget (₹)</label>
          <input id="pt-budget" type="number" inputMode="decimal" min="0" placeholder="Optional" value={f.budget ?? ''} onChange={set('budget')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pt-buffer">Buffer for surprises (%)</label>
          <input id="pt-buffer" type="number" inputMode="decimal" min="0" max="100" value={f.buffer_pct ?? ''} onChange={set('buffer_pct')} />
        </div>
      </div>
      {!bufferOk && <p className="split-hint" style={{ color: 'var(--negative)' }}>The buffer must be between 0 and 100%.</p>}
      <div className="field">
        <label className="field-label" htmlFor="pt-transport">How you'll travel</label>
        <input id="pt-transport" maxLength={80} placeholder="Flight, train, own car…" value={f.transport || ''} onChange={set('transport')} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="pt-stay">Where you'll stay</label>
        <input id="pt-stay" maxLength={80} placeholder="Hotel, homestay, hostel…" value={f.stay || ''} onChange={set('stay')} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="pt-act">Planned activities</label>
        <input id="pt-act" maxLength={200} placeholder="Beaches, scuba, nightlife…" value={f.activities || ''} onChange={set('activities')} />
      </div>
      <p className="muted-note">Currency: ₹ INR. Other currencies arrive with multi-currency support.</p>
      <div className="spacer-2" />
    </Sheet>
  );
}
