import React, { useState, useEffect, useMemo } from 'react';
import { CATEGORIES } from '../lib/constants';
import { todayISO } from '../lib/dates';
import { IS_TOUCH } from '../lib/env';
import { compressImage } from '../lib/image';
import { fmtINR } from '../lib/money';
import { computeSplit, seedSplitInputs } from '../lib/splits';
import { Icon } from '../ui/Icon';
import { Avatar, Sheet } from '../ui/primitives';

export function AddExpenseSheet({ open, onClose, onCreate, onUpdate, onDelete, members, self, editing }) {
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
      // keep splitAmong as-is (or rebuild from shareInputs keys if needed)
      if (splitMode !== 'equal' && Object.keys(shareInputs).length > 0) {
        setSplitAmong(Object.keys(shareInputs));
      }
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
  const setShareValue = (name, value) => {
    setShareInputs((prev) => ({ ...prev, [name]: value }));
  };

  // ---- Compute final shares + validation ----
  // Paise-exact: % splits are converted so they add up to the amount exactly,
  // and exact splits must match the amount to the paisa (see lib/splits.ts).
  const computed = useMemo(
    () => computeSplit(splitMode, amt, splitAmong, shareInputs),
    [splitMode, splitAmong, shareInputs, amt],
  );

  const splittersCount = splitMode === 'equal' ? splitAmong.length : Object.keys(shareInputs).length;
  const isValid =
    description.trim().length > 0 &&
    !isNaN(amt) && amt > 0 &&
    !!paidBy &&
    splittersCount > 0 &&
    !!date &&
    !computed.error;

  const perPerson = (splitMode === 'equal' && isValid) ? amt / splitAmong.length : 0;

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
      const dataUrl = await compressImage(file);
      setImageUrl(dataUrl);
    } catch (e) {
      alert('Could not load image: ' + (e?.message || e));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Edit expense' : 'New expense'} onSave={submit} saveLabel={isEdit ? 'Save' : 'Add'} canSave={isValid}>
      <div className="field">
        <label className="field-label">Photo (optional)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            onPickFile(f);
            e.target.value = '';
          }}
        />
        {imageUrl ? (
          <div style={{
            position: 'relative',
            borderRadius: 'var(--r-2)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}>
            <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              aria-label="Remove photo"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 32, height: 32, borderRadius: 999,
                background: 'rgba(0,0,0,.6)',
                border: '1px solid rgba(255,255,255,.15)',
                color: 'white',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            ><Icon.X /></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={photoBusy}
            style={{
              width: '100%',
              padding: '20px 14px',
              borderRadius: 'var(--r-2)',
              border: '1px dashed var(--border-2)',
              background: 'var(--surface)',
              color: 'var(--text-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: 'Inter', fontWeight: 500, fontSize: 14,
              cursor: 'pointer',
              opacity: photoBusy ? .5 : 1,
            }}
          >
            <Icon.Camera />
            {photoBusy ? 'Compressing…' : 'Attach receipt or food photo'}
          </button>
        )}
      </div>
      <div className="field">
        <label className="field-label">Description</label>
        {/* autoFocus only on pointer devices. On a phone it yanked the
            keyboard up before the sheet finished animating, scrolling the
            form to a random position. */}
        <input autoFocus={!IS_TOUCH} placeholder="Dinner at Britto's" value={description}
          onChange={(e) => setDescription(e.target.value)} maxLength={60}
          enterKeyHint="next" autoComplete="off" />
      </div>
      <div className="field">
        <label className="field-label">Amount</label>
        <div className="amount-input-wrap">
          <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" className="amount-input"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()} enterKeyHint="done" />
        </div>
        {amt > 0 && splitAmong.length > 0 && (
          <p className="split-hint">{fmtINR(perPerson, true)} per person × {splitAmong.length}</p>
        )}
      </div>
      <div className="field">
        <label className="field-label">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
      </div>
      <div className="field">
        <label className="field-label">Category</label>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button"
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
            <button key={m.id} type="button"
              className={`chip-member ${paidBy === m.name ? 'selected-pay' : ''}`}
              onClick={() => setPaidBy(m.name)}>
              <Avatar name={m.name} size="sm" />
              {m.name === self ? `${m.name} (you)` : m.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">Split mode</label>
        <div className="chips">
          <button type="button" className={`chip selectable ${splitMode === 'equal' ? 'active soft' : ''}`} onClick={() => switchMode('equal')}>Equal</button>
          <button type="button" className={`chip selectable ${splitMode === 'percentage' ? 'active soft' : ''}`} onClick={() => switchMode('percentage')}>By %</button>
          <button type="button" className={`chip selectable ${splitMode === 'exact' ? 'active soft' : ''}`} onClick={() => switchMode('exact')}>Exact ₹</button>
        </div>
      </div>

      {splitMode === 'equal' ? (
        <div className="field">
          <label className="field-label">Split among ({splitAmong.length})</label>
          <div className="chips">
            {members.map((m) => (
              <button key={m.id} type="button"
                className={`chip-member ${splitAmong.includes(m.name) ? 'active' : ''}`}
                onClick={() => toggleSplit(m.name)}>
                <Avatar name={m.name} size="sm" />
                {m.name === self ? `${m.name} (you)` : m.name}
              </button>
            ))}
          </div>
          <p className="split-hint">Equal split between {splitAmong.length || 0} {splitAmong.length === 1 ? 'person' : 'people'}.</p>
        </div>
      ) : (
        <div className="field">
          <label className="field-label">
            {splitMode === 'percentage' ? 'Set percentage per person' : 'Set exact ₹ per person'}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => {
              const included = m.name in shareInputs;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1px solid ' + (included ? 'rgba(0,229,160,.35)' : 'var(--border)'),
                    borderRadius: 'var(--r-2)',
                    opacity: included ? 1 : .55,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleShareMember(m.name)}
                    style={{
                      // Bumped 22px → 28px; still small, but paired with the
                      // taller 44px row it is now a reliable thumb target.
                      width: 28, height: 28, borderRadius: 8,
                      border: '2px solid ' + (included ? 'var(--primary)' : 'var(--border-2)'),
                      background: included ? 'var(--primary)' : 'transparent',
                      color: '#0A1A14',
                      fontFamily: 'Manrope', fontWeight: 800, fontSize: 15,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-label={included ? `Exclude ${m.name}` : `Include ${m.name}`}
                  >{included ? '✓' : ''}</button>
                  <Avatar name={m.name} size="sm" />
                  <span style={{ fontFamily: 'Manrope', fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name === self ? `${m.name} (you)` : m.name}
                  </span>
                  {/* Shrinkable but never below 84px, so long names and the
                      input can coexist on a 320px screen. */}
                  <div style={{ position: 'relative', width: 100, minWidth: 84, flexShrink: 0 }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={splitMode === 'percentage' ? '0.01' : '1'}
                      placeholder="0"
                      value={shareInputs[m.name] ?? ''}
                      onChange={(e) => {
                        setShareValue(m.name, e.target.value);
                        // auto-include if user types
                        if (!(m.name in shareInputs) && e.target.value) toggleShareMember(m.name);
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      disabled={!included}
                      style={{
                        padding: '10px 26px 10px 10px',
                        fontFamily: 'Manrope', fontWeight: 700,
                        // Must stay >=16px or iOS zooms the sheet on every tap.
                        fontSize: 16,
                        textAlign: 'right',
                        minHeight: 44,
                      }}
                    />
                    <span style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--text-mute)', fontFamily: 'Manrope', fontWeight: 600, fontSize: 13,
                      pointerEvents: 'none',
                    }}>{splitMode === 'percentage' ? '%' : '₹'}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="split-hint" style={{ color: computed.error ? 'var(--negative)' : 'var(--primary)' }}>
            {computed.error
              ? computed.error
              : splitMode === 'percentage'
                ? `Totals 100% across ${Object.keys(shareInputs).length} ${Object.keys(shareInputs).length === 1 ? 'person' : 'people'}`
                : `Totals ${fmtINR(amt, true)} across ${Object.keys(shareInputs).length} ${Object.keys(shareInputs).length === 1 ? 'person' : 'people'}`
            }
          </p>
        </div>
      )}
      {isEdit && onDelete && (
        <React.Fragment>
          <div className="spacer-3" />
          <button className="btn btn-danger btn-full" onClick={() => onDelete(editing)}>
            <Icon.Trash /> Delete this expense
          </button>
        </React.Fragment>
      )}
      <div className="spacer-2" />
    </Sheet>
  );
}
