import React, { useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../lib/dates';
import { fmtINR, toPaise } from '../lib/money';
import { SECTIONS, estimate } from '../lib/tripPlan';
import { Icon } from '../ui/Icon';
import { Avatar, Sheet } from '../ui/primitives';

const BOOKING = [['none', 'No booking'], ['to_book', 'To book'], ['booked', 'Booked']];
const SPLITS = [['all', 'Everyone'], ['some', 'Selected people'], ['exact', 'Exact amounts']];
const pos = (v, min) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : null; };

/** Add or edit one budget line: unit price × quantity × people × days. */
export function BudgetItemSheet({ open, onClose, onSave, onDelete, editing, section, members = [], dayOptions = [], defaults = {} }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    const e = editing;
    setF({
      section: e?.section || section || 'food', label: e?.label || '',
      unit: e ? String(e.unit_price_minor / 100) : '', quantity: e ? String(e.quantity) : '1',
      people: e ? String(e.people) : String(defaults.people || 1), days: e ? String(e.days) : '1',
      day_date: e?.day_date || defaults.day_date || '', notes: e?.notes || '',
      booking_status: e?.booking_status || 'none', paid: !!e?.paid, suggested: e?.status === 'suggested',
      split: e?.shares ? 'exact' : e?.split_members?.length ? 'some' : 'all',
      chosen: e?.split_members?.length ? [...e.split_members] : members.map((m) => m.id),
      exact: e?.shares ? Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, String(v / 100)])) : {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const sec = SECTIONS.find((s) => s.id === f.section) || SECTIONS[0];
  const unit = pos(f.unit, 0), qty = pos(f.quantity, 0.01), people = pos(f.people, 1), days = pos(f.days, 1);
  const numbersOk = unit != null && qty != null && people != null && days != null && Number.isInteger(people) && Number.isInteger(days);
  const total = numbersOk ? estimate(toPaise(unit), qty, people, days) : 0;

  const exactSum = useMemo(() => Object.values(f.exact || {}).reduce((s, v) => s + toPaise(v), 0), [f.exact]);
  const splitError = f.split === 'some' && (f.chosen || []).length === 0 ? 'Pick at least one person.'
    : f.split === 'exact' && exactSum !== total ? `Amounts add up to ${fmtINR(exactSum / 100, true)}; the line is ${fmtINR(total / 100, true)}.` : '';
  const valid = (f.label || '').trim().length > 0 && numbersOk && !splitError;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const shares = f.split === 'exact'
        ? Object.fromEntries(Object.entries(f.exact).map(([k, v]) => [k, toPaise(v)]).filter(([, v]) => v > 0)) : null;
      await onSave({
        ...(editing ? { id: editing.id } : {}),
        section: f.section, label: f.label.trim(), unit_price_minor: toPaise(unit), quantity: qty, people, days,
        day_date: f.day_date || null, notes: f.notes, booking_status: f.booking_status, paid: f.paid,
        split_members: f.split === 'some' ? f.chosen : [], shares, source: editing?.source || 'user',
        status: f.suggested ? 'suggested' : 'accepted',
      });
    } finally { setBusy(false); }
  };
  const toggle = (id) => setF((p) => ({ ...p, chosen: p.chosen.includes(id) ? p.chosen.filter((x) => x !== id) : [...p.chosen, id] }));

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit budget line' : 'Add to budget'} onSave={submit}
      saveLabel={busy ? 'Saving…' : editing ? 'Save' : 'Add'} canSave={valid && !busy}>
      <div className="field">
        <label className="field-label">Section</label>
        <div className="chips">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`chip selectable ${f.section === s.id ? 'active soft' : ''}`}
              aria-pressed={f.section === s.id} onClick={() => set('section')(s.id)}><span>{s.emoji}</span>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="bi-label">What is it?</label>
        <input id="bi-label" list="bi-presets" maxLength={80} placeholder={sec.presets[0]} value={f.label || ''} onChange={set('label')} autoComplete="off" />
        <datalist id="bi-presets">{sec.presets.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="chips" style={{ marginTop: 8 }}>
          {sec.presets.slice(0, 6).map((p) => <button key={p} type="button" className="chip" onClick={() => set('label')(p)}>{p}</button>)}
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="bi-unit">Price each (₹)</label>
          <input id="bi-unit" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={f.unit ?? ''} onChange={set('unit')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bi-qty">Quantity</label>
          <input id="bi-qty" type="number" inputMode="decimal" min="0.01" step="any" value={f.quantity ?? ''} onChange={set('quantity')} />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label className="field-label" htmlFor="bi-people">People</label>
          <input id="bi-people" type="number" inputMode="numeric" min="1" step="1" value={f.people ?? ''} onChange={set('people')} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bi-days">Days / times</label>
          <input id="bi-days" type="number" inputMode="numeric" min="1" step="1" value={f.days ?? ''} onChange={set('days')} />
        </div>
      </div>
      <p className="split-hint" style={{ color: numbersOk ? 'var(--primary)' : 'var(--negative)' }}>
        {numbersOk ? `${fmtINR(unit, true)}${qty !== 1 ? ` × ${qty}` : ''} × ${people} ${people === 1 ? 'person' : 'people'} × ${days} ${days === 1 ? 'day' : 'days'} = ${fmtINR(total / 100, true)}`
          : 'Enter a price, and whole numbers of at least 1 for people and days.'}
      </p>

      {dayOptions.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="bi-day">Day (optional)</label>
          <select id="bi-day" className="plain-select" value={f.day_date || ''} onChange={set('day_date')}>
            <option value="">Whole trip / not tied to a day</option>
            {dayOptions.map((d, i) => <option key={d} value={d}>Day {i + 1} · {fmtDate(d)}</option>)}
          </select>
        </div>
      )}

      <div className="field">
        <label className="field-label">Who shares this?</label>
        <div className="chips">
          {SPLITS.map(([id, label]) => (
            <button key={id} type="button" className={`chip selectable ${f.split === id ? 'active soft' : ''}`}
              aria-pressed={f.split === id} onClick={() => set('split')(id)}>{label}</button>
          ))}
        </div>
        {f.split === 'some' && (
          <div className="chips" style={{ marginTop: 10 }}>
            {members.map((m) => (
              <button key={m.id} type="button" className={`chip-member ${(f.chosen || []).includes(m.id) ? 'active' : ''}`}
                aria-pressed={(f.chosen || []).includes(m.id)} onClick={() => toggle(m.id)}>
                <Avatar name={m.name} size="sm" />{m.name}
              </button>
            ))}
          </div>
        )}
        {f.split === 'exact' && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={m.name} size="sm" />
                <label htmlFor={`bi-x-${m.id}`} style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{m.name}</label>
                <input id={`bi-x-${m.id}`} type="number" inputMode="decimal" min="0" placeholder="0" style={{ width: 120, textAlign: 'right' }}
                  value={f.exact?.[m.id] ?? ''} onChange={(e) => setF((p) => ({ ...p, exact: { ...p.exact, [m.id]: e.target.value } }))} />
              </div>
            ))}
          </div>
        )}
        {splitError && <p className="split-hint" style={{ color: 'var(--negative)' }}>{splitError}</p>}
        {f.split === 'some' && (f.chosen || []).length === 1 && <p className="split-hint">One person covers this line.</p>}
      </div>

      <div className="field">
        <label className="field-label">Booking</label>
        <div className="chips">
          {BOOKING.map(([id, label]) => (
            <button key={id} type="button" className={`chip selectable ${f.booking_status === id ? 'active soft' : ''}`}
              aria-pressed={f.booking_status === id} onClick={() => set('booking_status')(id)}>{label}</button>
          ))}
          <button type="button" className={`chip selectable ${f.paid ? 'active soft' : ''}`} aria-pressed={!!f.paid} onClick={() => set('paid')(!f.paid)}>
            {f.paid ? '✓ Paid' : 'Not paid yet'}
          </button>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="bi-notes">Notes</label>
        <input id="bi-notes" maxLength={300} value={f.notes || ''} onChange={set('notes')} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={!!f.suggested} onChange={(e) => set('suggested')(e.target.checked)} />
        <span>Only a suggestion for now (not counted in the budget until accepted)</span>
      </label>

      {editing && onDelete && (
        <React.Fragment>
          <div className="spacer-3" />
          <button className="btn btn-danger btn-full" onClick={() => onDelete(editing)}><Icon.Trash /> Remove this line</button>
        </React.Fragment>
      )}
      <div className="spacer-2" />
    </Sheet>
  );
}
