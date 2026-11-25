import React, { useMemo, useState } from 'react';
import {
  PRESETS, bucketFor, categoryBreakdown, categorySeries, comparePeriods, dayLabel, daysInclusive, groupAnalytics,
  insights, monthLabel, myEntries, periodFor, series, settlementTotals, spendingStats, unusualDays, recurringPatterns, weekdayWeekend,
} from '../lib/analytics';
import { CAT_BY_ID } from '../lib/constants';
import { downloadText, toCSV } from '../lib/csv';
import { fmtDate, todayISO } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { Bars, CHART_COLORS, CompareBar, Donut } from '../ui/charts';
import { Avatar } from '../ui/primitives';

const catInfo = (id) => CAT_BY_ID[id] || { label: id, emoji: '📌' };
const money = (n) => fmtINR(n);
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtINR(Math.abs(n));
const pctText = (p) => (p == null ? 'new' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p))}%`);

const SECTIONS = [
  { id: 'overview', label: 'Overview' }, { id: 'categories', label: 'Categories' }, { id: 'compare', label: 'Compare' },
  { id: 'trends', label: 'Trends' }, { id: 'groups', label: 'Groups' },
];
const FREE_PRESETS = ['thisMonth', 'all'];

function Stat({ label, value, tone, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: tone === 'pos' ? 'var(--primary)' : tone === 'neg' ? 'var(--negative)' : 'var(--text)' }}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
function Empty({ title, text }) {
  return (
    <div className="empty" style={{ paddingTop: 24 }}>
      <div className="emoji-bubble">📊</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Locked({ onOpenPlan }) {
  return (
    <div className="plan-banner" style={{ marginTop: 16 }} role="button" tabIndex={0} onClick={onOpenPlan}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenPlan(); }}>
      <span className="plan-star" aria-hidden="true">★</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="plan-title">This is a Premium feature</span>
        <span className="plan-sub">Category drill-down, comparisons, trends, group breakdowns, insights and exports are part of Premium. Your basic overview stays free.</span>
      </span>
    </div>
  );
}
function TxnList({ entries, groupsById }) {
  return (
    <div>
      {entries.map((e) => (
        <div key={e.id} className="txn">
          <div style={{ minWidth: 0 }}>
            <div className="txn-title">{e.description}</div>
            <div className="txn-sub">{fmtDate(e.date)} · {groupsById[e.group_id]?.name || 'Group'} · bill {fmtINR(e.amount / 100)} paid by {e.paid_by}</div>
          </div>
          <div className="txn-amt">{fmtINR(e.mine / 100, true)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Overview ----------
function Overview({ a, premium, onExport }) {
  const { summary, settle, stats, owed, owe, notes, period } = a;
  if (summary.count === 0 && summary.paid === 0) {
    return <Empty title="Nothing in this period" text="No expenses with your share or paid by you here. Try a longer period." />;
  }
  return (
    <React.Fragment>
      <div className="summary">
        <div className="grain" />
        <p className="label">Your spending · {period.label}</p>
        <p className="net" style={{ color: 'var(--text)' }}>{money(summary.myShare)}</p>
        <p className="sub">Your own share across {summary.count} expense{summary.count === 1 ? '' : 's'}. Not the full bills.</p>
      </div>

      <p className="section-title">Money in and out</p>
      <div className="stat-grid">
        <Stat label="You paid" value={money(summary.paid)} hint="out of pocket" />
        <Stat label="Paid for others" value={money(summary.paidForOthers)} tone="pos" hint="their shares" />
        <Stat label="Paid for you" value={money(summary.coveredByOthers)} hint="your shares others paid" />
        <Stat label="Received back" value={money(settle.received)} hint="settlements" />
        <Stat label="Paid back" value={money(settle.sent)} hint="settlements" />
        <Stat label="Net personal expense" value={money(summary.myShare)} hint="what you consumed" />
      </div>

      <p className="section-title">Outstanding now</p>
      <div className="stat-grid two">
        <Stat label="Owed to you" value={money(owed)} tone={owed > 0.5 ? 'pos' : undefined} hint="across all groups" />
        <Stat label="You owe" value={money(owe)} tone={owe > 0.5 ? 'neg' : undefined} hint="across all groups" />
      </div>

      {premium && stats && (
        <React.Fragment>
          <p className="section-title">Averages over {stats.days} day{stats.days === 1 ? '' : 's'}</p>
          <div className="stat-grid">
            <Stat label="Per day" value={money(stats.avgDaily)} />
            <Stat label="Per week" value={money(stats.avgWeekly)} />
            <Stat label="Per month" value={money(stats.avgMonthly)} />
            <Stat label="Highest day" value={money(stats.highestDay.amount)} hint={dayLabel(stats.highestDay.date)} />
            {stats.highestMonth && <Stat label="Highest month" value={money(stats.highestMonth.amount)} hint={monthLabel(stats.highestMonth.month)} />}
            {stats.lowestMonth && <Stat label="Lowest month" value={money(stats.lowestMonth.amount)} hint={monthLabel(stats.lowestMonth.month)} />}
            <Stat label="Frequency" value={`${stats.perWeek}/week`} hint={`${stats.activeDays} spending day${stats.activeDays === 1 ? '' : 's'}`} />
          </div>

          <p className="section-title">Insights</p>
          {notes.length === 0 ? (
            <p className="muted-note">Not enough data in this period for reliable insights yet. They appear as you add more expenses.</p>
          ) : (
            <ul className="insights">{notes.map((t, i) => <li key={i}>{t}</li>)}</ul>
          )}

          <div className="spacer-2" />
          <button className="btn btn-soft btn-full" onClick={onExport}>Download CSV for this period</button>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// ---------- Categories ----------
function Categories({ a, premium, groupsById, onOpenPlan }) {
  const [open, setOpen] = useState(null);
  const rows = a.categories;
  if (rows.length === 0) return <Empty title="No spending in this period" text="Add expenses or pick a longer period." />;
  const donut = rows.map((r, i) => ({ label: catInfo(r.category).label, value: r.amount, color: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <React.Fragment>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 4px' }}>
        <Donut data={donut} centerTop={money(a.summary.myShare)} centerBottom="your share" />
      </div>
      <div className="cat-list">
        {rows.map((r, i) => {
          const info = catInfo(r.category);
          const isOpen = open === r.category;
          const list = isOpen ? a.entries.filter((e) => e.category === r.category && e.mine > 0).sort((x, y) => (x.date < y.date ? 1 : -1)) : [];
          const trend = isOpen ? categorySeries(a.allEntries, r.category) : [];
          return (
            <div key={r.category} className="cat-row col">
              <button type="button" className="cat-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.category)}>
                <span className="cat-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="cat-emoji" aria-hidden="true">{info.emoji}</span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span className="cat-line"><span className="cat-name">{info.label}</span><span className="cat-amt">{money(r.amount)}</span></span>
                  <span className="cat-meta">
                    {Math.round(r.pct)}% · {r.count} expense{r.count === 1 ? '' : 's'} · avg {money(r.avg)}
                    {premium && a.period.previous && <span> · {pctText(r.changePct)} vs before</span>}
                  </span>
                </span>
              </button>
              {isOpen && (premium ? (
                <div className="cat-detail">
                  <p className="muted-note">Largest: {r.max.description}, {money(r.max.amount)} on {dayLabel(r.max.date)}.</p>
                  {trend.length >= 2 && (
                    <React.Fragment>
                      <p className="mini-title">{info.label} by month (all your history)</p>
                      <Bars data={trend} height={110} color={CHART_COLORS[i % CHART_COLORS.length]} format={money} title={`${info.label} by month`} />
                    </React.Fragment>
                  )}
                  <p className="mini-title">Expenses in this period (your share)</p>
                  <TxnList entries={list} groupsById={groupsById} />
                </div>
              ) : <Locked onOpenPlan={onOpenPlan} />)}
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

// ---------- Compare ----------
function Compare({ a, groupsById }) {
  const { period, cmp } = a;
  if (!period.previous) return <Empty title="Pick a period to compare" text="“All time” has nothing before it. Choose a month, a year or a number of days." />;
  if (cmp.count === 0 && cmp.prevCount === 0) return <Empty title="Nothing to compare" text="No spending in either period." />;
  const row = (label, cur, prev, fmt = money) => (
    <tr><th scope="row">{label}</th><td>{fmt(cur)}</td><td>{fmt(prev)}</td></tr>
  );
  const delta = (d, label) => (
    <div key={d.key} className="delta-row">
      <div className="delta-head"><span>{label}</span><span style={{ color: d.change > 0 ? 'var(--negative)' : d.change < 0 ? 'var(--primary)' : 'var(--text-soft)' }}>{signed(d.change)}</span></div>
      <CompareBar current={d.current} previous={d.previous} format={money} />
    </div>
  );
  return (
    <React.Fragment>
      <div className="summary">
        <div className="grain" />
        <p className="label">{period.label} vs {period.previousLabel}</p>
        <p className="net" style={{ color: cmp.changePct == null ? 'var(--text)' : cmp.changePct > 0 ? 'var(--negative)' : 'var(--primary)' }}>
          {cmp.changePct == null ? money(cmp.total) : pctText(cmp.changePct)}
        </p>
        <p className="sub">
          {cmp.changePct == null ? 'No spending in the earlier period to compare with.' : `${money(cmp.total)} now, ${money(cmp.prevTotal)} before.`}
        </p>
      </div>
      <table className="cmp-table">
        <thead><tr><th /><th scope="col">Now</th><th scope="col">Before</th></tr></thead>
        <tbody>
          {row('Your spending', cmp.total, cmp.prevTotal)}
          {row('Expenses', cmp.count, cmp.prevCount, String)}
          {row('Average expense', cmp.avgTxn, cmp.prevAvgTxn)}
          {row('Average per day', cmp.dailyAvg, cmp.prevDailyAvg)}
        </tbody>
      </table>
      {a.daysNote && <p className="muted-note">{a.daysNote}</p>}

      <p className="section-title">What changed by category</p>
      {cmp.categories.map((d) => delta(d, `${catInfo(d.key).emoji} ${catInfo(d.key).label}`))}

      {cmp.groups.length > 1 && (
        <React.Fragment>
          <p className="section-title">What changed by group</p>
          {cmp.groups.map((d) => delta(d, groupsById[d.key]?.name || 'Group'))}
        </React.Fragment>
      )}

      {cmp.top.length > 0 && (
        <React.Fragment>
          <p className="section-title">Top expenses in {period.label}</p>
          <TxnList entries={cmp.top} groupsById={groupsById} />
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// ---------- Trends ----------
function Trends({ a }) {
  const [bucket, setBucket] = useState(a.defaultBucket);
  const pts = useMemo(() => series(a.entries, bucket, a.spanRange), [a.entries, bucket, a.spanRange]);
  if (a.summary.count === 0) return <Empty title="No spending in this period" text="Trends appear once there are expenses to plot." />;
  const tooMany = pts.length > 120;
  return (
    <React.Fragment>
      <div className="chips" style={{ margin: '4px 0 10px' }}>
        {['day', 'week', 'month'].map((b) => (
          <button key={b} type="button" className={`chip selectable ${bucket === b ? 'active soft' : ''}`} onClick={() => setBucket(b)}>
            {b === 'day' ? 'Daily' : b === 'week' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>
      <div className="chart-card">
        {tooMany ? <p className="muted-note">Too many days to draw. Switch to weekly or monthly.</p>
          : <Bars data={pts} format={money} title="Your spending over time" />}
      </div>

      {a.week && (a.week.weekdayDays >= 5 && a.week.weekendDays >= 2) && (
        <React.Fragment>
          <p className="section-title">Weekdays vs weekends</p>
          <div className="stat-grid two">
            <Stat label="Average weekday" value={money(a.week.weekdayAvg)} hint={`${a.week.weekdayDays} days`} />
            <Stat label="Average weekend day" value={money(a.week.weekendAvg)} hint={`${a.week.weekendDays} days`} />
          </div>
        </React.Fragment>
      )}

      <p className="section-title">Unusually high days</p>
      {a.odd.length === 0 ? <p className="muted-note">{a.stats && a.stats.activeDays < 7 ? 'Not enough data yet: this needs at least 7 spending days in the period.' : 'No day stood out in this period.'}</p> : (
        <ul className="insights">{a.odd.slice(0, 5).map((d) => <li key={d.date}>{fmtDate(d.date)}: {money(d.amount)} (a typical spending day is {money(d.typical)})</li>)}</ul>
      )}

      <p className="section-title">Recurring expenses</p>
      {a.recurring.length === 0 ? <p className="muted-note">None found yet. An expense counts as recurring when the same description appears in 3 different months.</p> : (
        <ul className="insights">{a.recurring.slice(0, 8).map((r) => <li key={r.description}>{r.description}: about {money(r.avg)}, seen in {r.months} months</li>)}</ul>
      )}
    </React.Fragment>
  );
}

// ---------- Groups and people ----------
function Groups({ a, groups, expenses, selfMap }) {
  const [gid, setGid] = useState(groups[0]?.id || '');
  const g = useMemo(() => (gid ? groupAnalytics(expenses, gid, a.period.range) : null), [expenses, gid, a.period.range]);
  const totals = useMemo(() => groups.map((x) => ({ key: x.id, label: x.name.length > 9 ? x.name.slice(0, 8) + '…' : x.name, amount: groupAnalytics(expenses, x.id, a.period.range).total })), [groups, expenses, a.period.range]);
  if (groups.length === 0) return <Empty title="No groups yet" text="Create a group to see its breakdown here." />;
  const me = selfMap[gid];
  return (
    <React.Fragment>
      {groups.length > 1 && (
        <React.Fragment>
          <p className="section-title">Total spending by group · {a.period.label}</p>
          <div className="chart-card"><Bars data={totals} height={130} format={money} highlightKey={gid} title="Total spending by group" /></div>
          <ul className="insights">{totals.map((t, i) => <li key={t.key}>{groups[i].name}: {money(t.amount)}</li>)}</ul>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="an-group">Group</label>
            <select id="an-group" value={gid} onChange={(e) => setGid(e.target.value)}>
              {groups.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}
            </select>
          </div>
        </React.Fragment>
      )}
      {g && g.count === 0 && g.settlementCount === 0 ? <Empty title="No expenses in this period" text="Pick a longer period or another group." /> : g && (
        <React.Fragment>
          <div className="stat-grid">
            <Stat label="Group spent" value={money(g.total)} hint={`${g.count} expense${g.count === 1 ? '' : 's'}`} />
            <Stat label="Per member" value={money(g.avgPerMember)} hint={`${g.memberCount} people`} />
            <Stat label="Paid the most" value={g.topPayer ? g.topPayer.name : '—'} hint={g.topPayer ? money(g.topPayer.amount) : ''} />
            <Stat label="Settled so far" value={money(g.settledAmount)} hint={`${g.settlementCount} payment${g.settlementCount === 1 ? '' : 's'}`} />
            <Stat label="Still unsettled" value={`${g.unsettled} ${g.unsettled === 1 ? 'person' : 'people'}`} />
          </div>

          <p className="section-title">People: paid vs their share</p>
          <p className="muted-note">Paying more doesn't mean spending more. “Share” is what each person actually consumed.</p>
          <div className="people">
            {g.people.map((p) => (
              <div key={p.name} className="person">
                <Avatar name={p.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="person-name">{p.name}{p.name === me ? ' (you)' : ''}</div>
                  <div className="cat-meta">Paid {money(p.paid)} in {p.paidCount} expense{p.paidCount === 1 ? '' : 's'}{p.paidCount ? ` (avg ${money(p.avgPaid)})` : ''} · share {money(p.share)}{p.settlements ? ` · ${p.settlements} settlement${p.settlements === 1 ? '' : 's'}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="cat-meta">{Math.abs(p.net) < 0.005 ? 'settled' : p.net > 0 ? 'is owed' : 'owes'}</div>
                  <div className="person-net" style={{ color: Math.abs(p.net) < 0.005 ? 'var(--text-soft)' : p.net > 0 ? 'var(--primary)' : 'var(--negative)' }}>{money(Math.abs(p.net))}</div>
                </div>
              </div>
            ))}
          </div>

          {g.categories.length > 0 && (
            <React.Fragment>
              <p className="section-title">Group spending by category</p>
              <div className="cat-list">
                {g.categories.map((c) => (
                  <div key={c.category} className="cat-row">
                    <span className="cat-emoji" aria-hidden="true">{catInfo(c.category).emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cat-line"><span className="cat-name">{catInfo(c.category).label}</span><span className="cat-amt">{money(c.amount)}</span></div>
                      <div className="cat-bar"><span style={{ width: `${Math.max(2, c.pct)}%` }} /></div>
                      <div className="cat-meta">{Math.round(c.pct)}% · {c.count} expense{c.count === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

/**
 * Analytics. Free: overview and category split for this month or all time.
 * Premium (or trial): every period, drill-down, comparisons, trends, group
 * and people breakdowns, insights and CSV export.
 */
export function AnalyticsView({ expenses, selfMap, groups = [], trips = [], groupSummaries = {}, premium = false, toast, onOpenPlan }) {
  const today = todayISO();
  const [preset, setPreset] = useState('thisMonth');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [section, setSection] = useState('overview');
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const a = useMemo(() => {
    const period = periodFor(preset, today, custom);
    const entries = myEntries(expenses, selfMap, period.range);
    const previous = period.previous ? myEntries(expenses, selfMap, period.previous) : [];
    const allEntries = myEntries(expenses, selfMap);
    const dates = entries.map((e) => e.date).sort();
    // The span actually covered: the chosen dates, or first-to-last expense for "all time".
    const spanRange = { from: period.range.from ?? dates[0], to: period.range.to ?? dates[dates.length - 1] };
    const curDays = spanRange.from && spanRange.to ? daysInclusive(spanRange.from, spanRange.to) : 1;
    const prevDays = period.previous ? daysInclusive(period.previous.from, period.previous.to) : 1;
    let owed = 0, owe = 0;
    for (const s of Object.values(groupSummaries)) { if (!s?.hasSelf) continue; if (s.net > 0) owed += s.net; else owe -= s.net; }
    const personal = { myShare: 0, paid: 0, paidForOthers: 0, coveredByOthers: 0, count: 0 };
    for (const e of entries) {
      personal.myShare += e.mine; personal.paid += e.paid;
      if (e.paid > 0) personal.paidForOthers += e.paid - e.mine; else personal.coveredByOthers += e.mine;
      if (e.mine > 0) personal.count++;
    }
    for (const k of ['myShare', 'paid', 'paidForOthers', 'coveredByOthers']) personal[k] = personal[k] / 100;
    return {
      period, entries, previous, allEntries, spanRange,
      summary: personal,
      settle: settlementTotals(expenses, selfMap, period.range),
      stats: spendingStats(entries, period.range),
      categories: categoryBreakdown(entries, previous),
      cmp: comparePeriods(entries, previous, curDays, prevDays),
      daysNote: period.previous && curDays !== prevDays ? `The periods differ in length (${curDays} vs ${prevDays} days), so “average per day” is the fairest comparison.` : '',
      week: weekdayWeekend(entries, period.range),
      odd: unusualDays(entries),
      recurring: recurringPatterns(allEntries),
      defaultBucket: bucketFor(curDays),
      notes: insights({ entries, previous, allEntries, period, today, categoryName: (id) => catInfo(id).label, money }),
      owed, owe,
    };
  }, [expenses, selfMap, preset, custom, today, groupSummaries]);

  const exportCsv = () => {
    const tripsById = Object.fromEntries(trips.map((t) => [t.id, t]));
    const rows = [...a.entries].sort((x, y) => (x.date < y.date ? -1 : 1)).map((e) => [
      e.date, groupsById[e.group_id]?.name || '', tripsById[e.trip_id]?.name || '', e.description, catInfo(e.category).label,
      e.amount / 100, e.paid_by, e.mine / 100, e.paid / 100,
    ]);
    const name = `splitpro-${(a.spanRange.from || 'start')}_to_${(a.spanRange.to || today)}.csv`;
    downloadText(name, toCSV(['Date', 'Group', 'Trip', 'Description', 'Category', 'Bill amount (INR)', 'Paid by', 'Your share (INR)', 'You paid (INR)'], rows));
    toast?.(`Exported ${rows.length} expense${rows.length === 1 ? '' : 's'}`, 'success');
  };

  const presets = premium ? PRESETS : PRESETS.filter((p) => FREE_PRESETS.includes(p.id));
  const sectionLocked = !premium && section !== 'overview' && section !== 'categories';

  return (
    <React.Fragment>
      <div className="an-controls">
        <label className="visually-hidden" htmlFor="an-period">Period</label>
        <select id="an-period" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="an-dates">
          <div className="field"><label className="field-label" htmlFor="an-from">From</label>
            <input id="an-from" type="date" value={custom.from} max={custom.to || today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></div>
          <div className="field"><label className="field-label" htmlFor="an-to">To</label>
            <input id="an-to" type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></div>
        </div>
      )}

      <div className="an-sections" role="tablist" aria-label="Analytics sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id}
            className={`chip selectable ${section === s.id ? 'active soft' : ''}`} onClick={() => setSection(s.id)}>
            {s.label}{!premium && s.id !== 'overview' && s.id !== 'categories' ? ' ★' : ''}
          </button>
        ))}
      </div>

      {preset === 'custom' && !(custom.from && custom.to) ? <Empty title="Choose both dates" text="Pick a start and an end date above." />
        : sectionLocked ? <Locked onOpenPlan={onOpenPlan} />
        : section === 'overview' ? <Overview a={a} premium={premium} onExport={exportCsv} />
        : section === 'categories' ? <Categories a={a} premium={premium} groupsById={groupsById} onOpenPlan={onOpenPlan} />
        : section === 'compare' ? <Compare a={a} groupsById={groupsById} />
        : section === 'trends' ? <Trends key={preset + (custom.from || '') + (custom.to || '')} a={a} />
        : <Groups a={a} groups={groups} expenses={expenses} selfMap={selfMap} />}

      {!premium && section === 'overview' && <Locked onOpenPlan={onOpenPlan} />}
      <div className="spacer-fab" />
    </React.Fragment>
  );
}
