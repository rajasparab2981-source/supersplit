import React, { useState, useMemo } from 'react';
import { CAT_BY_ID, REACTION_EMOJIS } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { youLine } from '../lib/splits';

// Lightweight reaction bar shown under each expense row.
export function ReactionBar({ expense, self, onReact }) {
  const [picking, setPicking] = useState(false);
  const reactions = (expense.reactions && typeof expense.reactions === 'object') ? expense.reactions : {};
  // Group by emoji → list of names
  const grouped = {};
  for (const [name, emoji] of Object.entries(reactions)) {
    if (!emoji) continue;
    if (!grouped[emoji]) grouped[emoji] = [];
    grouped[emoji].push(name);
  }
  const emojiOrder = REACTION_EMOJIS.filter((e) => grouped[e]);
  const myReaction = self ? reactions[self] : null;

  const stop = (e) => { e.stopPropagation(); };

  const handleReact = (emoji, e) => {
    e.stopPropagation();
    setPicking(false);
    // If user already had this emoji → remove. Otherwise set/replace.
    const next = { ...reactions };
    if (myReaction === emoji) delete next[self];
    else if (self) next[self] = emoji;
    onReact(expense.id, next);
  };

  if (emojiOrder.length === 0 && !self) return null;

  return (
    <div onClick={stop} style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginTop: 8, paddingTop: 8,
      borderTop: '1px dashed var(--border)',
    }}>
      {emojiOrder.map((emoji) => {
        const names = grouped[emoji];
        const youReacted = self && names.includes(self);
        return (
          <button
            key={emoji}
            onClick={(e) => handleReact(emoji, e)}
            title={names.join(', ')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', minHeight: 32, borderRadius: 999,
              background: youReacted ? 'rgb(var(--accent-rgb) / .15)' : 'var(--surface-2)',
              border: '1px solid ' + (youReacted ? 'rgb(var(--accent-rgb) / .4)' : 'var(--border)'),
              fontFamily: 'Inter', fontWeight: 600, fontSize: 12,
              color: youReacted ? 'var(--primary)' : 'var(--text-soft)',
              cursor: 'pointer',
            }}
          >
            <span>{emoji}</span>
            <span>{names.length}</span>
          </button>
        );
      })}
      {self && (
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setPicking((v) => !v); }}
            aria-label="React"
            style={{
              // 26px → 32px, with the surrounding row giving extra slop.
              width: 32, height: 32, borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-mute)',
              fontFamily: 'Inter', fontWeight: 700, fontSize: 15,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >{picking ? '×' : '+'}</button>
          {picking && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
              display: 'flex', gap: 4,
              padding: 6,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-2)',
              borderRadius: 999,
              boxShadow: '0 12px 32px rgb(var(--shadow-rgb) / .15)',
              zIndex: 5,
              // The popover is ~230px wide and anchored to a button near the
              // right edge; without this it ran off-screen on narrow phones.
              maxWidth: 'calc(100vw - 40px)',
              flexWrap: 'wrap', justifyContent: 'flex-end',
            }}>
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => handleReact(emoji, e)}
                  style={{
                    width: 32, height: 32, borderRadius: 999,
                    fontSize: 18,
                    background: myReaction === emoji ? 'rgb(var(--accent-rgb) / .2)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    transition: 'background .12s ease, transform .12s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >{emoji}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExpensesTab({ expenses, self, onEdit, onReact }) {
  const byDate = useMemo(() => {
    const g = new Map();
    for (const e of expenses) {
      if (!g.has(e.expense_date)) g.set(e.expense_date, []);
      g.get(e.expense_date).push(e);
    }
    return [...g.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <div className="empty">
        <div className="emoji-bubble">💸</div>
        <h3>No expenses yet</h3>
        <p>Tap the + button to log your first split.</p>
      </div>
    );
  }

  return (
    <React.Fragment>
      {byDate.map(([date, items]) => (
        <React.Fragment key={date}>
          <p className="section-title">{fmtDate(date)}</p>
          <div>
            {items.map((e) => {
              const cat = CAT_BY_ID[e.category] || CAT_BY_ID.other;
              const splitters = Array.isArray(e.split_among) ? e.split_among : [];
              const yl = youLine(e, self);
              return (
                <div key={e.id} className="exp-row" onClick={() => onEdit(e)} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
                    <span className="exp-cat">{cat.emoji}</span>
                    <div className="exp-main">
                      <p className="exp-desc">{e.description}</p>
                      <p className="exp-payer">
                        {e.paid_by === self ? 'You' : e.paid_by} paid {fmtINR(e.amount)} · {splitters.length} split{e.split_mode && e.split_mode !== 'equal' ? ' · unequal' : ''}
                      </p>
                    </div>
                    {e.image_url && (
                      <img
                        src={e.image_url}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                      />
                    )}
                    <div className="exp-side">
                      {yl != null ? (
                        Math.abs(yl) < 0.5 ? (
                          <React.Fragment>
                            <div className="you-line zero">—</div>
                            <div className="you-label">no impact</div>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            <div className={`you-line ${yl > 0 ? 'pos' : 'neg'}`}>
                              {(yl > 0 ? '+' : '−') + fmtINR(Math.abs(yl))}
                            </div>
                            <div className="you-label">{yl > 0 ? 'you lent' : 'you owe'}</div>
                          </React.Fragment>
                        )
                      ) : (
                        <React.Fragment>
                          <div className="total">total</div>
                          <div className="total-amt">{fmtINR(e.amount)}</div>
                        </React.Fragment>
                      )}
                    </div>
                  </div>
                  <ReactionBar expense={e} self={self} onReact={onReact} />
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}
