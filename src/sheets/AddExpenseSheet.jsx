import React, { useState, useEffect, useMemo } from 'react';
import { CATEGORIES } from '../lib/constants';
import { todayISO } from '../lib/dates';
import { IS_TOUCH } from '../lib/env';
import { compressImage } from '../lib/image';
import { fmtINR } from '../lib/money';
import { computeSplit, seedSplitInputs } from '../lib/splits';
import { Icon } from '../ui/Icon';
import { Avatar, Sheet } from '../ui/primitives';

/** Each person's share in rupees, for any split mode (equal splits are worked out to the paisa). */
export function sharesFor(amount, splitAmong, shares) {
  if (shares && Object.keys(shares).length > 0) return shares;
  return Object.fromEntries(Object.entries(seedSplitInputs('exact', amount, splitAmong)).map(([k, v]) => [k, Number(v) || 0]));
}

export function AddExpenseSheet({ open, onClose, onCreate, onUpdate, onDelete, members, self, editing, tripName }) {
  const isEdit = !!editing;
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('food');
  const [paidBy, setPaidBy] = useState(self || members[0]?.name || '');
  const [splitAmong, setSplitAmong] = useState(members.map((m) => m.name));
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'percentage' | 'exact'
  const [shareInputs, setShareInputs] = useState({}); // { name: stringValue }
  const [imageUrl, setImageUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = React.useRef(null);

  // Reset state only when the sheet opens (false→true) OR when switching
  // between editing different expenses. Crucially we do NOT depend on
  // `members` or `self` — those references change on every Supabase poll
  // and would wipe what the user is currently typing.
  const editingId = editing?.id;
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description || '');
      setAmount(String(editing.amount ?? ''));
      setDate(editing.expense_date || todayISO());
      setCategory(editing.category || 'food');
      setPaidBy(editing.paid_by || (self || members[0]?.name || ''));
      setSplitAmong(Array.isArray(editing.split_among) ? [...editing.split_among] : members.map((m) => m.name));
      setImageUrl(editing.image_url || null);
      // v2 always carries exact amounts in `shares`; equal splits reopen as equal.
      if (editing.split_mode !== 'equal' && editing.shares && Object.keys(editing.shares).length > 0) {
        setSplitMode('exact');
        const inputs = {};
        for (const [k, v] of Object.entries(editing.shares)) inputs[k] = String(v);
        setShareInputs(inputs);
      } else {
        setSplitMode('equal');
        setShareInputs({});
      }
    } else {
      setDescription(''); setAmount(''); setDate(todayISO()); setCategory('food');
      setPaidBy(self || members[0]?.name || ''); setSplitAmong(members.map((m) => m.name));
      setSplitMode('equal'); setShareInputs({});
      setImageUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const amt = Number(amount);

  // ---- Split-mode helpers ----
  const switchMode = (next) => {
    if (next === splitMode) return;
    if (next === 'equal') {
      if (splitMode !== 'equal' && Object.keys(shareInputs).length > 0) setSplitAmong(Object.keys(shareInputs));
    } else {
      // Switching to % or exact: pre-fill an even split that already adds up
      // exactly (e.g. 33.34 / 33.33 / 33.33), so the form starts out valid.
      const targets = splitAmong.length ? splitAmong : members.map((m) => m.name);
      setShareInputs(seedSplitInputs(next, amt > 0 ? amt : 0, targets));
    }
    setSplitMode(next);
  };

  const toggleSplit = (name) => setSplitAmong((p) => p.includes(name) ? p.filter((n) => n !== name) : [...p, name]);
  const toggleShareMember = (name) => {
    setShareInputs((prev) => {
      const next = { ...prev };
      if (name in next) delete next[name];
      else next[name] = '';
      return next;
    });
  };
  const setShareValue = (name, value) => setShareInputs((prev) => ({ ...prev, [name]: value }));

  // ---- Compute final shares + validation ----
  // Paise-exact: % splits are converted so they add up to the amount exactly,
  // and exact splits must match the amount to the paisa (see lib/splits.ts).
  const computed = useMemo(
    () => computeSplit(splitMode, amt, splitAmong, shareInputs),
    [splitMode, splitAmong, shareInputs, amt],
  );

  const splittersCount = splitMode === 'equal' ? splitAmong.length : Object.keys(shareInputs).length;
  const amountOk = !isNaN(amt) && amt > 0;
  const isValid = description.trim().length > 0 && amountOk && !!paidBy && splittersCount > 0 && !!date && !computed.error;

  // Live preview: who ends up with which share, and what the payer gets back.
  const preview = useMemo(() => {
    if (!amountOk || computed.error || computed.splitAmong.length === 0) return null;
    const shares = sharesFor(amt, computed.splitAmong, computed.shares);
    const rows = computed.splitAmong.map((n) => ({ name: n, share: shares[n] || 0 }));
    return { rows, payerBack: Math.round((amt - (shares[paidBy] || 0)) * 100) / 100 };
  }, [amountOk, computed, amt, paidBy]);

  const submit = () => {
    if (!isValid) return;
    const payload = {
      description: description.trim(), amount: amt, paid_by: paidBy,
      split_among: computed.splitAmong, category, expense_date: date,
      shares: computed.shares,
      split_mode: splitMode,
      image_url: imageUrl,
    };
    if (isEdit) onUpdate(editing.id, payload);
    else onCreate(payload);
  };

  const onPickFile = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setImageUrl(await compressImage(file));
    } catch (e) {
      alert('Could not load image: ' + (e?.message || e));
    } finally {
      setPhotoBusy(false);
    }
  };
  const who = (n) => (n === self ? 'You' : n);

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Edit expense' : 'Add expense'} onSave={submit} saveLabel={isEdit ? 'Save' : 'Add'} canSave={isValid}>
      {tripName && <p className="xp-where">In <b>{tripName}</b></p>}
      <div className="xp-amount">
        <label className="field-label" htmlFor="xp-amount">Amount</label>
        <div className="amount-input-wrap">
          <input id="xp-amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" className="amount-input"
            autoFocus={!IS_TOUCH} value={amount} onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()} enterKeyHint="next" />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="xp-desc">What was it for?</label>
        <input id="xp-desc" placeholder="Dinner at Britto's" value={description}
          onChange={(e) => setDescription(e.target.value)} maxLength={60}
          enterKeyHint="done" autoComplete="off" />
      </div>
      <div className="field">
        <label className="field-label">Category</label>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={category === c.id}
              className={`chip selectable ${category === c.id ? 'active soft' : ''}`}
              onClick={() => setCategory(c.id)}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">Paid by</label>
        <div className="chips">
          {members.map((m) => (
            <button key={m.id} type="button" aria-pressed={paidBy === m.name}
              className={`chip-member ${paidBy === m.name ? 'selected-pay' : ''}`}
              onClick={() => setPaidBy(m.name)}>
              <Avatar name={m.name} size="sm" />
              {m.name === self ? `${m.name} (you)` : m.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">Split</label>
        <div className="seg" role="group" aria-label="How to split">
          <button type="button" aria-pressed={splitMode === 'equal'} onClick={() => switchMode('equal')}>Equally</button>
          <button type="button" aria-pressed={splitMode === 'percentage'} onClick={() => switchMode('percentage')}>By %</button>
          <button type="button" aria-pressed={splitMode === 'exact'} onClick={() => switchMode('exact')}>Exact ₹</button>
        </div>
      </div>

      {splitMode === 'equal' ? (
        <div className="field">
          <label className="field-label">Between ({splitAmong.length})</label>
          <div className="chips">
            {members.map((m) => (
              <button key={m.id} type="button" aria-pressed={splitAmong.includes(m.name)}
                className={`chip-member ${splitAmong.includes(m.name) ? 'active' : ''}`}
                onClick={() => toggleSplit(m.name)}>
                <Avatar name={m.name} size="sm" />
                {m.name === self ? `${m.name} (you)` : m.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <label className="field-label">{splitMode === 'percentage' ? 'Percentage per person' : 'Amount per person'}</label>
          <div className="xp-shares">
            {members.map((m) => {
              const included = m.name in shareInputs;
              return (
                <div key={m.id} className={`xp-share ${included ? 'on' : ''}`}>
                  <button type="button" className="xp-check" onClick={() => toggleShareMember(m.name)}
                    aria-label={included ? `Exclude ${m.name}` : `Include ${m.name}`}>{included ? '✓' : ''}</button>
                  <Avatar name={m.name} size="sm" />
                  <span className="xp-share-name">{m.name === self ? `${m.name} (you)` : m.name}</span>
                  <div className="xp-share-input">
                    <input
                      type="number" inputMode="decimal" min="0" step={splitMode === 'percentage' ? '0.01' : '1'} placeholder="0"
                      value={shareInputs[m.name] ?? ''}
                      onChange={(e) => {
                        setShareValue(m.name, e.target.value);
                        if (!(m.name in shareInputs) && e.target.value) toggleShareMember(m.name);
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      disabled={!included}
                      aria-label={`${m.name}'s ${splitMode === 'percentage' ? 'percentage' : 'amount'}`}
                    />
                    <span>{splitMode === 'percentage' ? '%' : '₹'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`xp-preview ${computed.error ? 'bad' : ''}`} aria-live="polite">
        <p className="xp-preview-title">Split preview</p>
        {computed.error ? <p className="xp-preview-note">{computed.error}</p>
          : !preview ? <p className="xp-preview-note">{splittersCount === 0 ? 'Pick at least one person to split with.' : 'Enter an amount to see each person’s share.'}</p>
          : (
            <React.Fragment>
              {preview.rows.map((r) => (
                <div key={r.name} className="xp-preview-row">
                  <span>{who(r.name)}{r.name === paidBy ? ' · paid' : ''}</span>
                  <b>{fmtINR(r.share, true)}</b>
                </div>
              ))}
              {paidBy && preview.payerBack > 0 && (
                <p className="xp-preview-foot">{who(paidBy)} paid {fmtINR(amt, true)} and {paidBy === self ? 'get' : 'gets'} back <b>{fmtINR(preview.payerBack, true)}</b>.</p>
              )}
            </React.Fragment>
          )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="xp-date">Date</label>
        <input id="xp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
      </div>
      <div className="field">
        <label className="field-label">Photo (optional)</label>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; onPickFile(f); e.target.value = ''; }} />
        {imageUrl ? (
          <div className="xp-photo">
            <img src={imageUrl} alt="Attached receipt" />
            <button type="button" onClick={() => setImageUrl(null)} aria-label="Remove photo"><Icon.X /></button>
          </div>
        ) : (
          <button type="button" className="xp-photo-add" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={photoBusy}>
            <Icon.Camera />
            {photoBusy ? 'Compressing…' : 'Attach a receipt photo'}
          </button>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-full" onClick={submit} disabled={!isValid}>
        {isEdit ? 'Save changes' : amountOk ? `Add ${fmtINR(amt, true)} expense` : 'Add expense'}
      </button>
      {isEdit && onDelete && (
        <React.Fragment>
          <div className="spacer-2" />
          <button className="btn btn-danger btn-full" onClick={() => onDelete(editing)}>
            <Icon.Trash /> Delete this expense
          </button>
        </React.Fragment>
      )}
      <div className="spacer-2" />
    </Sheet>
  );
}
