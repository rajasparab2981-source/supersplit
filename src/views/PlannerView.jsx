import React, { useMemo, useState } from 'react';
import { DB } from '../db/db';
import { dayLabel } from '../lib/analytics';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { SECTIONS, dayPlan, peoplePlan, planSummary, tripLength } from '../lib/tripPlan';
import { BudgetItemSheet } from '../sheets/BudgetItemSheet';
import { PlanTripSheet } from '../sheets/PlanTripSheet';
import { Bars } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { Avatar, ConfirmSheet } from '../ui/primitives';

const money = (n) => fmtINR(n);
const SOURCE = { user: 'Your estimate', personal_history: 'From your past spending', group_history: 'From past group trips' };
const STATUS = { planning: 'Planning', active: 'In progress', completed: 'Completed' };
const errText = (e) => (e?.code === 'P0003' ? 'Planning is a Premium feature.' : e?.message || String(e));

/** Planned vs actual as two thin bars on a shared scale. */
function PlanBar({ planned, actual }) {
  const max = Math.max(planned, actual, 1);
  const over = actual > planned && planned > 0;
  return (
    <div className="plan-bars" role="img" aria-label={`Planned ${money(planned)}, spent ${money(actual)}`}>
      <span className="pb pb-plan" style={{ width: `${(planned / max) * 100}%` }} />
      <span className={`pb ${over ? 'pb-over' : 'pb-actual'}`} style={{ width: `${(actual / max) * 100}%` }} />
    </div>
  );
}
function Stat({ label, value, tone, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: tone === 'pos' ? 'var(--primary)' : tone === 'neg' ? 'var(--negative)' : 'var(--text)' }}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
function ItemRow({ item, onEdit, onAccept, canEdit }) {
  const formula = `${fmtINR(item.unit_price_minor / 100, true)}${item.quantity !== 1 ? ` × ${item.quantity}` : ''}${item.people > 1 ? ` × ${item.people} people` : ''}${item.days > 1 ? ` × ${item.days} days` : ''}`;
  return (
    <div className={`bitem ${item.status === 'suggested' ? 'suggested' : ''}`}>
      <button type="button" className="bitem-main" onClick={() => canEdit && onEdit(item)} disabled={!canEdit}>
        <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
          <span className="bitem-title">{item.label}</span>
          <span className="bitem-sub">{formula}{item.day_date ? ` · ${dayLabel(item.day_date)}` : ''}</span>
          <span className="bitem-tags">
            <span className="tag">{SOURCE[item.source] || SOURCE.user}</span>
            {item.booking_status === 'booked' && <span className="tag ok">Booked</span>}
            {item.booking_status === 'to_book' && <span className="tag warn">To book</span>}
            {item.paid && <span className="tag ok">Paid</span>}
            {item.status === 'suggested' && <span className="tag warn">Suggestion</span>}
          </span>
        </span>
        <span className="bitem-amt">{fmtINR(item.estimated_minor / 100)}</span>
      </button>
      {item.status === 'suggested' && canEdit && (
        <button type="button" className="btn btn-soft" style={{ margin: '0 12px 12px' }} onClick={() => onAccept(item)}>Accept into budget</button>
      )}
    </div>
  );
}

/**
 * Smart Trip Planner for one trip. Planned figures come from budget lines;
 * actual figures come from the trip's real expenses.
 */
export function PlannerView({ group, trip, members, expenses, items, premium, toast, onOpenExpenses, onOpenPlan }) {
  const [tab, setTab] = useState('overview');
  const [sheet, setSheet] = useState(null);      // { editing?, section?, day_date? }
  const [editTrip, setEditTrip] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const sum = useMemo(() => planSummary(trip, items, expenses, members.length), [trip, items, expenses, members.length]);
  const days = useMemo(() => dayPlan(trip, items, expenses), [trip, items, expenses]);
  const people = useMemo(() => peoplePlan(trip, items, expenses, members), [trip, items, expenses, members]);
  const length = tripLength(trip);
  const dayOptions = days.days.map((d) => d.date);
  const me = DB.getSelfName(group.id);

  const run = async (label, fn) => {
    try { await fn(); return true; } catch (e) { toast(`${label} failed: ${errText(e)}`, 'error'); return false; }
  };
  const saveItem = async (payload) => {
    if (await run('Save', () => DB.saveBudgetItem({ trip_id: trip.id, ...payload }))) { setSheet(null); toast('Budget updated', 'success'); }
  };
  const acceptItem = (item) => run('Accept', () => DB.saveBudgetItem({ ...item, status: 'accepted' }));
  const removeItem = (item) => setConfirm({
    title: 'Remove this budget line?', message: `"${item.label}" — ${fmtINR(item.estimated_minor / 100)}.`, confirmLabel: 'Remove',
    onConfirm: async () => { if (await run('Remove', () => DB.deleteBudgetItem(item.id))) { setSheet(null); toast('Line removed', 'success'); } setConfirm(null); },
  });
  const setStatus = (status) => run('Update', () => DB.updateTripPlan(trip.id, { status }));
  const saveTrip = async ({ name, emoji, details }) => {
    if (await run('Save', () => DB.updateTripPlan(trip.id, { name, emoji, ...details }))) { setEditTrip(false); toast('Trip updated', 'success'); }
  };
  const add = (section, day_date) => (premium ? setSheet({ section, day_date }) : onOpenPlan());

  const usedPct = sum.used == null ? null : Math.round(sum.used);
  const meta = [trip.destination, trip.start_date && trip.end_date ? `${dayLabel(trip.start_date)} – ${dayLabel(trip.end_date)}` : null,
    length ? `${length} day${length === 1 ? '' : 's'}` : null, `${sum.travellers} traveller${sum.travellers === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

  return (
    <React.Fragment>
      <div className="summary" style={{ borderColor: `${group.color}40` }}>
        <div className="grain" />
        <p className="label" style={{ color: group.color }}>{trip.emoji} {trip.name} · {STATUS[trip.status] || 'Trip'}</p>
        <p className="net" style={{ color: 'var(--text)' }}>{money(sum.plannedWithBuffer)}</p>
        <p className="sub">{sum.planned > 0 ? `Planned budget, including a ${Number(trip.buffer_pct ?? 0)}% buffer` : 'No budget lines yet. Add what you expect to spend.'}</p>
        <p className="sub" style={{ marginTop: 4 }}>{meta}</p>
        <div className="summary-split">
          <div><div className="col-label">Spent so far</div><div className="col-amt" style={{ color: 'var(--text)' }}>{money(sum.actual)}</div></div>
          <div><div className="col-label">{sum.remaining < 0 ? 'Over budget' : 'Remaining'}</div>
            <div className="col-amt" style={{ color: sum.remaining < 0 ? 'var(--negative)' : 'var(--primary)' }}>{money(Math.abs(sum.remaining))}</div></div>
          <div><div className="col-label">Per person</div><div className="col-amt" style={{ color: 'var(--text)' }}>{money(sum.perPersonPlanned)}</div></div>
        </div>
      </div>

      <div className="chips" style={{ margin: '12px 0 4px' }}>
        {premium && trip.status === 'planning' && <button className="chip selectable active soft" onClick={() => setStatus('active')}>Start trip</button>}
        {premium && trip.status === 'active' && <button className="chip selectable" onClick={() => setStatus('completed')}>Mark completed</button>}
        {premium && trip.status === 'completed' && <button className="chip selectable" onClick={() => setStatus('active')}>Reopen trip</button>}
        {premium && <button className="chip selectable" onClick={() => setEditTrip(true)}>Edit details</button>}
        <button className="chip selectable" onClick={onOpenExpenses}>Expenses ({expenses.filter((e) => !e.is_settlement).length})</button>
      </div>
      {!premium && (
        <div className="plan-banner" role="button" tabIndex={0} onClick={onOpenPlan} onKeyDown={(e) => { if (e.key === 'Enter') onOpenPlan(); }}>
          <span className="plan-star" aria-hidden="true">★</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="plan-title">Planning is a Premium feature</span>
            <span className="plan-sub">You can view this plan. Changing it needs Premium. Adding expenses stays free.</span>
          </span>
        </div>
      )}

      <div className="tabs">
        {[['overview', 'Overview'], ['budget', 'Budget'], ['days', 'Days'], ['people', 'People']].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <React.Fragment>
          {sum.planned === 0 && sum.actual === 0 ? (
            <div className="empty" style={{ paddingTop: 24 }}>
              <div className="emoji-bubble">🧭</div>
              <h3>Start your budget</h3>
              <p>Add the things you expect to pay for: travel, stay, food, activities. SplitPro then tracks your real expenses against it.</p>
              <div className="spacer-2" />
              <button className="btn btn-primary" onClick={() => { setTab('budget'); add('transport'); }}>Add first budget line</button>
            </div>
          ) : (
            <React.Fragment>
              {usedPct != null && (
                <div className="chart-card" style={{ padding: 14 }}>
                  <div className="cat-line"><span>Budget used</span><span style={{ color: usedPct > 100 ? 'var(--negative)' : 'var(--text)' }}>{usedPct}%</span></div>
                  <div className="cat-bar" style={{ height: 10 }}><span style={{ width: `${Math.min(100, usedPct)}%`, background: usedPct > 100 ? 'var(--negative)' : usedPct >= 90 ? '#FFC857' : 'var(--primary)' }} /></div>
                  <div className="cat-meta">{money(sum.actual)} of {money(sum.plannedWithBuffer)}</div>
                </div>
              )}
              {sum.alerts.length > 0 && (
                <React.Fragment>
                  <p className="section-title">Budget alerts</p>
                  <ul className="insights">
                    {sum.alerts.map((a) => (
                      <li key={a.section} style={{ borderLeftColor: a.used > 100 ? 'var(--negative)' : '#FFC857' }}>
                        {a.section}: {a.used}% of its budget used{a.used > 100 ? ' — over budget.' : a.used === 100 ? ' — fully used.' : `, past the ${a.level}% mark.`}
                      </li>
                    ))}
                  </ul>
                </React.Fragment>
              )}
              <p className="section-title">Summary</p>
              <div className="stat-grid">
                <Stat label="Budget lines" value={money(sum.planned)} hint={`+ ${money(sum.buffer)} buffer`} />
                <Stat label="Spent" value={money(sum.actual)} hint={`${money(sum.perPersonActual)} per person`} />
                <Stat label={sum.remaining < 0 ? 'Over by' : 'Left'} value={money(Math.abs(sum.remaining))} tone={sum.remaining < 0 ? 'neg' : 'pos'} />
                {sum.target != null && <Stat label="Your target" value={money(sum.target)} tone={sum.overTarget > 0 ? 'neg' : undefined}
                  hint={sum.overTarget > 0 ? `plan is ${money(sum.overTarget)} over` : sum.overTarget < 0 ? `plan is ${money(-sum.overTarget)} under` : 'plan matches'} />}
                <Stat label="Bookings" value={`${sum.bookedCount} booked`} hint={sum.toBookCount ? `${sum.toBookCount} still to book` : 'nothing pending'} />
                <Stat label="Already paid" value={money(sum.paidAmount)} hint="of planned lines" />
              </div>
              {sum.suggested > 0 && <p className="muted-note">{money(sum.suggested)} of suggestions are waiting in the Budget tab and are not counted yet.</p>}

              <p className="section-title">Planned vs spent</p>
              <div className="legend"><span><i className="pb-plan" /> Planned</span><span><i className="pb-actual" /> Spent</span></div>
              <div className="cat-list">
                {sum.sections.filter((s) => s.planned > 0 || s.actual > 0).map((s) => (
                  <div key={s.id} className="cat-row">
                    <span className="cat-emoji" aria-hidden="true">{s.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cat-line"><span className="cat-name">{s.label}</span>
                        <span className="cat-amt" style={{ color: s.remaining < 0 ? 'var(--negative)' : 'var(--text)' }}>{money(s.actual)} / {money(s.planned)}</span></div>
                      <PlanBar planned={s.planned} actual={s.actual} />
                      <div className="cat-meta">
                        {s.unplanned ? 'Spending with no budget set' : s.remaining < 0 ? `Over by ${money(-s.remaining)} (${Math.round(s.used)}%)` : `${money(s.remaining)} left${s.used != null ? ` · ${Math.round(s.used)}% used` : ''}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {days.days.some((d) => d.actual > 0) && (
                <React.Fragment>
                  <p className="section-title">Spending by day</p>
                  <div className="chart-card"><Bars data={days.days.map((d) => ({ key: d.date, label: `D${d.index}`, amount: d.actual }))} height={130} format={money} title="Spending by day" /></div>
                </React.Fragment>
              )}
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {tab === 'budget' && (
        <React.Fragment>
          {SECTIONS.map((s) => {
            const row = sum.sections.find((x) => x.id === s.id);
            const list = items.filter((i) => i.section === s.id);
            return (
              <div key={s.id} className="bsection">
                <div className="bsection-head">
                  <span className="cat-emoji" aria-hidden="true">{s.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="bsection-title">{s.label}</span>
                    <span className="cat-meta" style={{ display: 'block' }}>
                      Planned {money(row.planned)} · spent {money(row.actual)}{row.used != null ? ` · ${Math.round(row.used)}%` : ''}
                    </span>
                  </span>
                  <button type="button" className="chip selectable" onClick={() => add(s.id)} aria-label={`Add to ${s.label}`}>+ Add</button>
                </div>
                {list.map((i) => <ItemRow key={i.id} item={i} canEdit={premium} onEdit={(it) => setSheet({ editing: it })} onAccept={acceptItem} />)}
              </div>
            );
          })}
          <div className="bsection">
            <div className="bsection-head">
              <span className="cat-emoji" aria-hidden="true">🛟</span>
              <span style={{ flex: 1 }}>
                <span className="bsection-title">Buffer for surprises</span>
                <span className="cat-meta" style={{ display: 'block' }}>{Number(trip.buffer_pct ?? 0)}% of planned lines = {money(sum.buffer)}</span>
              </span>
              {premium && <button type="button" className="chip selectable" onClick={() => setEditTrip(true)}>Change</button>}
            </div>
          </div>
          <div className="settings-item" style={{ marginTop: 12 }}>
            <div><div className="label">Total planned</div><div className="desc">{money(sum.perPersonPlanned)} per person · {sum.travellers} traveller{sum.travellers === 1 ? '' : 's'}</div></div>
            <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 18 }}>{money(sum.plannedWithBuffer)}</span>
          </div>
        </React.Fragment>
      )}

      {tab === 'days' && (
        <React.Fragment>
          {days.days.length === 0 ? (
            <div className="empty" style={{ paddingTop: 24 }}>
              <div className="emoji-bubble">🗓️</div>
              <h3>Add your travel dates</h3>
              <p>With a departure and return date, you can plan and track each day.</p>
              {premium && <React.Fragment><div className="spacer-2" /><button className="btn btn-primary" onClick={() => setEditTrip(true)}>Add dates</button></React.Fragment>}
            </div>
          ) : (
            <React.Fragment>
              {(days.highest || days.lowest) && (
                <div className="stat-grid two">
                  {days.highest && <Stat label="Highest spending day" value={money(days.highest.actual)} hint={`Day ${days.highest.index} · ${dayLabel(days.highest.date)}`} />}
                  {days.lowest && <Stat label="Lowest spending day" value={money(days.lowest.actual)} hint={`Day ${days.lowest.index} · ${dayLabel(days.lowest.date)}`} />}
                </div>
              )}
              {days.days.map((d) => (
                <div key={d.date} className="bsection">
                  <div className="bsection-head">
                    <span className="day-badge">D{d.index}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="bsection-title">{fmtDate(d.date)}</span>
                      <span className="cat-meta" style={{ display: 'block' }}>
                        {d.planned === 0 ? `Nothing planned · spent ${money(d.actual)}` : (
                          <React.Fragment>
                            Planned {money(d.planned)} · spent {money(d.actual)} ·{' '}
                            <span style={{ color: d.remaining < 0 ? 'var(--negative)' : 'inherit' }}>{d.remaining < 0 ? `over by ${money(-d.remaining)}` : `${money(d.remaining)} left`}</span>
                          </React.Fragment>
                        )}
                      </span>
                    </span>
                    <button type="button" className="chip selectable" onClick={() => add('food', d.date)} aria-label={`Add to day ${d.index}`}>+ Add</button>
                  </div>
                  {d.items.map((i) => <ItemRow key={i.id} item={i} canEdit={premium} onEdit={(it) => setSheet({ editing: it })} onAccept={acceptItem} />)}
                </div>
              ))}
              {days.unscheduled.length > 0 && <p className="muted-note">{money(days.unscheduledPlanned)} of the plan ({days.unscheduled.length} line{days.unscheduled.length === 1 ? '' : 's'}) isn't tied to a day. Edit a line to give it a day.</p>}
              {days.outsideActual > 0 && <p className="muted-note">{money(days.outsideActual)} was spent on dates outside the trip (for example, bookings made in advance).</p>}
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {tab === 'people' && (
        <React.Fragment>
          <p className="muted-note">Each person's part of the planned budget (with the buffer), against their share of real expenses so far.</p>
          <div className="people">
            {people.map((p) => (
              <div key={p.id} className="person">
                <Avatar name={p.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="person-name">{p.name}{p.name === me ? ' (you)' : ''}</div>
                  <PlanBar planned={p.planned} actual={p.actual} />
                  <div className="cat-meta">Planned {money(p.planned)} · spent {money(p.actual)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="cat-meta">{p.remaining < 0 ? 'over' : 'left'}</div>
                  <div className="person-net" style={{ color: p.remaining < 0 ? 'var(--negative)' : 'var(--primary)' }}>{money(Math.abs(p.remaining))}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="stat-grid two" style={{ marginTop: 12 }}>
            <Stat label="Group budget" value={money(sum.plannedWithBuffer)} hint={`${money(sum.perPersonPlanned)} per person`} />
            <Stat label="Group budget left" value={money(Math.abs(sum.remaining))} tone={sum.remaining < 0 ? 'neg' : 'pos'} hint={sum.remaining < 0 ? 'over budget' : `${money(sum.perPersonActual)} spent per person`} />
          </div>
        </React.Fragment>
      )}

      <div className="spacer-fab" />
      {premium && <button className="fab" onClick={() => add('food')} aria-label="Add budget line"><Icon.Plus /></button>}

      <BudgetItemSheet open={!!sheet} onClose={() => setSheet(null)} onSave={saveItem} onDelete={removeItem}
        editing={sheet?.editing} section={sheet?.section} members={members} dayOptions={dayOptions}
        defaults={{ people: sum.travellers, day_date: sheet?.day_date }} />
      <PlanTripSheet open={editTrip} onClose={() => setEditTrip(false)} trip={trip} onSave={saveTrip} />
      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} onConfirm={confirm?.onConfirm} title={confirm?.title || ''} message={confirm?.message || ''} confirmLabel={confirm?.confirmLabel} />
    </React.Fragment>
  );
}
