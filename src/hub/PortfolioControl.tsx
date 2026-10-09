import { useEffect, useState } from 'react'
import { AllocationChart } from './AllocationChart'
import { budgetSlices, exposureSlices, unavailableExposureSleeves } from './allocationCharts'
import { money, planPortfolio, validatePortfolio } from './portfolio'
import type { Allocation, PortfolioConfig, PortfolioLimits, PortfolioRevision, PortfolioStrategy, PortfolioTelemetry, TargetInput } from './portfolio'

type RevisionSummary = { revision: number; updatedAt: string; capitalUsd: number; participating: number; paused: boolean }
type Saved = PortfolioRevision & { history: RevisionSummary[] }
type Snapshot = Saved & { inputs: TargetInput[]; telemetry: PortfolioTelemetry | null }
type Shadow = { status: string; observations: number; recordedAt?: string; revision?: number; navUsd?: number; contributedUsd?: number; pnlUsd?: number; feesUsd?: number; financingUsd?: number; pending?: boolean; sleeves: { strategyId: string; navUsd: number; contributedUsd: number; pnlUsd: number; feesUsd: number; financingUsd: number }[] }
const dollars = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const displayNumber = (value: number) => Number.isFinite(value) ? value : ''

async function read<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/hub/${endpoint}`, { signal, cache: 'no-store' })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Portfolio state is unavailable.')
  return value
}

function Dial({ label, value, max, min = 0, step = 1, suffix = '%', disabled, onChange }: { label: string; value: number; max: number; min?: number; step?: number; suffix?: string; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="portfolio-dial"><span>{label}<strong>{value}{suffix}</strong></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} /></label>
}

export function PortfolioControl({ strategies, active }: { strategies: PortfolioStrategy[]; active: boolean }) {
  const [saved, setSaved] = useState<Saved | null>(null)
  const [draft, setDraft] = useState<PortfolioConfig | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [shadow, setShadow] = useState<Shadow | null>(null)
  const [shadowError, setShadowError] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [now, setNow] = useState(Date.now)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    read<Saved>('portfolio', controller.signal).then(value => { if (!controller.signal.aborted) { setSaved(value); setDraft(value.config) } }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout>
    const poll = async () => {
      const results = await Promise.allSettled([read<Snapshot>('portfolio/targets', controller.signal), read<Shadow>('portfolio/shadow', controller.signal)])
      if (!controller.signal.aborted) {
        if (results[0].status === 'fulfilled') { setSnapshot(results[0].value); setSourceError('') }
        else { setSnapshot(null); setSourceError('Current target connection is unavailable. The saved plan remains local.') }
        if (results[1].status === 'fulfilled') { setShadow(results[1].value); setShadowError('') }
        else { setShadow(null); setShadowError('The prospective shadow ledger is unavailable. Accounting values are withheld.') }
      }
      if (!controller.signal.aborted) timeout = setTimeout(poll, 10_000)
    }
    void poll()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { controller.abort(); clearTimeout(timeout); clearInterval(clock) }
  }, [active])

  if (!draft || !saved) return <p role={error ? 'alert' : 'status'}>{error || 'Loading portfolio controls…'}</p>
  let invalid = '', plan = null
  try { validatePortfolio(draft, strategies); plan = planPortfolio(draft, strategies, snapshot?.inputs ?? [], snapshot?.telemetry ?? null, now) }
  catch (e) { invalid = (e as Error).message }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.config)
  const changedElsewhere = snapshot && snapshot.revision > saved.revision
  const edit = (change: Partial<PortfolioConfig>) => { setDraft({ ...draft, ...change }); setNotice(''); setError('') }
  const limit = (key: keyof PortfolioLimits, value: number) => edit({ limits: { ...draft.limits, [key]: value } })
  const allocate = (id: string, change: Partial<Allocation>) => edit({ allocations: draft.allocations.map(a => a.strategyId === id ? { ...a, ...change } : a) })
  const reload = async () => {
    try { const value = await read<Saved>('portfolio'); setSaved(value); setDraft(value.config); setError(''); setNotice('Loaded the saved plan.') }
    catch (e) { setError((e as Error).message) }
  }
  const save = async () => {
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/hub/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: draft, expectedRevision: saved.revision }) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? 'The portfolio could not be saved.')
      setSaved(value); setDraft(value.config)
      setNotice(`Saved revision ${value.revision} for paper evaluation.`)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }
  const selected = strategies.filter(s => `${s.name} ${s.label}`.toLowerCase().includes(query.toLowerCase()) && (filter !== 'participating' || draft.allocations.find(a => a.strategyId === s.id)?.enabled))
  const allocated = money(draft.allocations.reduce((sum, a) => sum + a.capitalUsd, 0))
  const unavailable = plan ? unavailableExposureSleeves(plan.sleeves) : []

  return <div className="portfolio-workspace">
    <p className="hub-caption">Paper plan · budgets feed the virtual observer; account holdings are separate.</p>
    {(error || invalid) && <div className="notice warning" role="alert">{error || invalid}</div>}
    {sourceError && <div className="notice warning" role="status">{sourceError}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {changedElsewhere && <div className="notice warning">The saved plan changed in another session. Reload before saving your draft.</div>}
    <section className="data-section portfolio-capital"><header className="section-header"><h2>Portfolio budget</h2><span>{dirty ? 'Unsaved draft' : saved.revision ? `Saved revision ${saved.revision}` : 'New plan'} · {saved.updatedAt ? new Date(saved.updatedAt).toLocaleString() : 'No saved plan yet'}</span></header>
      <div className="portfolio-capital-controls"><label>Portfolio budget · USD<input type="number" min="1" max="1000000000" step="0.01" value={displayNumber(draft.capitalUsd)} disabled={saving} onChange={e => edit({ capitalUsd: e.target.value === '' ? NaN : Number(e.target.value) })} /></label><button className="text-button" disabled={saving || !plan?.accountEquityUsd} onClick={() => edit({ capitalUsd: money(plan!.accountEquityUsd!) })}>Use current paper equity</button><span>Observed account equity<strong>{dollars(plan?.accountEquityUsd ?? null)}</strong></span><button className="text-button" disabled={saving} aria-pressed={draft.paused} onClick={() => edit({ paused: !draft.paused })}>{draft.paused ? 'Resume plan' : 'Pause plan'}</button></div>
      <dl className="metric-rail portfolio-metrics"><div><dt>Assigned budgets</dt><dd>{dollars(allocated)}</dd><dd className="metric-detail">Includes paused budgets</dd></div><div><dt>Unassigned capital</dt><dd>{dollars(money(draft.capitalUsd - allocated))}</dd><dd className="metric-detail">Ready to allocate</dd></div><div><dt>Proposed gross</dt><dd>{dollars(plan?.grossUsd ?? null)}</dd><dd className="metric-detail">Before sleeve netting</dd></div><div><dt>Modeled cash</dt><dd>{dollars(plan?.modeledCashUsd ?? null)}</dd><dd className="metric-detail">Target preview · includes short proceeds</dd></div></dl>
    </section>
    <div className="portfolio-charts">
      <AllocationChart title="Strategy mix" caption="Share of budget · includes paused allocations" slices={budgetSlices(draft.capitalUsd, draft.allocations, strategies)} empty="Enter a valid budget and allocations to see the mix." />
      <AllocationChart title="Proposed exposure" caption={`Share of gross by instrument · ${plan?.status === 'ready' ? 'target preview' : plan?.status === 'paused' ? 'plan paused' : 'preview blocked'}`} slices={plan && !unavailable.length ? exposureSlices(plan.targets) : null} empty={unavailable.length ? `Targets unavailable: ${unavailable.join(', ')}.` : plan ? 'No proposed instrument exposure.' : 'Exposure unavailable until the plan is valid.'} />
    </div>
    <section className="data-section"><header className="section-header"><h2>Strategy allocations</h2><span>{strategies.length} strategies</span></header>
      <div className="hub-search portfolio-search"><label>Find a strategy<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or evaluation stage…" /></label><label>Show<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All registered strategies</option><option value="participating">Participating in plan</option></select></label></div>
      <div className="table-scroll" role="region" aria-label="Strategy allocations" tabIndex={0}><table className="portfolio-table"><thead><tr><th>Strategy</th><th>Include</th><th>Budget · USD</th><th>Share</th><th>Risk scale</th><th>Gross cap</th></tr></thead><tbody>{selected.map(strategy => {
        const a = draft.allocations.find(row => row.strategyId === strategy.id)!, sleeve = plan?.sleeves.find(s => s.strategyId === strategy.id)
        return <tr key={strategy.id}><th className="hub-wrap">{strategy.name}<small className={sleeve?.status === 'unavailable' ? 'warning' : ''}>{sleeve?.status === 'ready' ? 'Target connected' : sleeve?.status === 'paused' ? 'Paused' : sleeve?.status === 'unfunded' ? 'No budget' : 'Target unavailable'}</small></th><td><input type="checkbox" aria-label={`Include ${strategy.name}`} checked={a.enabled} disabled={saving} onChange={e => allocate(strategy.id, { enabled: e.target.checked })} /></td><td><input className="portfolio-amount" type="number" min="0" step="0.01" max={draft.capitalUsd} aria-label={`${strategy.name} budget`} value={displayNumber(a.capitalUsd)} disabled={saving} onChange={e => allocate(strategy.id, { capitalUsd: e.target.value === '' ? NaN : Number(e.target.value) })} /></td><td>{(a.capitalUsd / draft.capitalUsd * 100).toFixed(1)}%</td><td><Dial label={`${strategy.name} risk scale`} value={a.riskScale} max={3} step={0.05} suffix="×" disabled={saving} onChange={v => allocate(strategy.id, { riskScale: v })} /></td><td><Dial label={`${strategy.name} gross cap`} value={a.maxGrossPct} max={300} disabled={saving} onChange={v => allocate(strategy.id, { maxGrossPct: v })} /></td></tr>
      })}{!selected.length && <tr><td colSpan={6} className="table-empty">No strategies match this filter.</td></tr>}</tbody></table></div>
    </section>
    <details className="hub-details portfolio-risk"><summary>Risk controls<span>Cash reserve {draft.limits.cashReservePct}% · gross cap {draft.limits.maxGrossPct}%</span></summary><div className="portfolio-risk-grid">
      <Dial label="Cash reserve" value={draft.limits.cashReservePct} max={100} disabled={saving} onChange={v => limit('cashReservePct', v)} />
      <Dial label="Gross exposure cap" value={draft.limits.maxGrossPct} max={300} disabled={saving} onChange={v => limit('maxGrossPct', v)} />
      <Dial label="Per-symbol gross cap" value={draft.limits.maxSymbolPct} max={300} disabled={saving} onChange={v => limit('maxSymbolPct', v)} />
      <Dial label="Turnover per rebalance" value={draft.limits.maxTurnoverPct} max={600} disabled={saving} onChange={v => limit('maxTurnoverPct', v)} />
      <Dial label="Daily loss stop" value={draft.limits.maxDailyLossPct} min={0.1} step={0.1} max={100} disabled={saving} onChange={v => limit('maxDailyLossPct', v)} />
      <Dial label="Trailing drawdown stop" value={draft.limits.maxDrawdownPct} min={0.1} step={0.1} max={100} disabled={saving} onChange={v => limit('maxDrawdownPct', v)} />
    </div><p className="section-note">Caps scale target sizes. Loss stops and turnover limits block rebalances. These settings apply to the plan and virtual observer.</p></details>
    <details className="hub-details"><summary>Current targets<span>{plan?.status === 'ready' ? 'Ready' : plan?.status === 'paused' ? 'Paused' : 'Blocked'} · refreshes every 10s</span></summary>
      {plan && <><div className="portfolio-plan-status"><strong>{plan.riskScaleApplied < 1 ? `Exposure caps apply ${(plan.riskScaleApplied * 100).toFixed(1)}% of the requested size.` : 'Requested exposure fits the portfolio caps.'}</strong><span>{snapshot?.telemetry?.sourceGeneratedAt ? `Account observation: ${new Date(snapshot.telemetry.sourceGeneratedAt).toLocaleString()}` : 'Awaiting current account observation'}</span></div>
      <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Combined proposed target</th><th>Gross across sleeves</th><th>Observed account holding</th><th>Indicative change</th></tr></thead><tbody>{plan.targets.map(t => <tr key={t.symbol}><th>{t.symbol}</th><td>{dollars(t.targetUsd)}</td><td>{dollars(t.sleeveGrossUsd)}</td><td>{dollars(t.currentUsd)}</td><td>{t.deltaUsd === null ? 'Withheld' : dollars(t.deltaUsd)}</td></tr>)}</tbody></table></div>
      {plan.reasons.length > 0 && <ul className="portfolio-blockers">{plan.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <p className="section-note">Planning targets require a separate execution adapter. Account P&L is not individual strategy performance.</p></>}
    </details>
    <details className="hub-details"><summary>Virtual paper performance<span>{shadow ? `${shadow.observations} observations · ${shadow.status.replaceAll('-', ' ')}` : 'Loading…'}{shadow?.recordedAt && now - Date.parse(shadow.recordedAt) > 120_000 ? ' · observer stale' : ''}</span></summary>
      {shadowError ? <p className="section-note warning" role="alert">{shadowError}</p> : shadow?.observations ? <><dl className="metric-rail portfolio-metrics"><div><dt>Modeled NAV</dt><dd>{dollars(shadow.navUsd ?? null)}</dd></div><div><dt>Modeled P&L after costs</dt><dd>{dollars(shadow.pnlUsd ?? null)}</dd></div><div><dt>Modeled fees</dt><dd>{dollars(shadow.feesUsd ?? null)}</dd></div><div><dt>Borrow / financing</dt><dd>{dollars(shadow.financingUsd ?? null)}</dd></div></dl><div className="table-scroll"><table><thead><tr><th>Virtual sleeve</th><th>Contributed budget</th><th>Modeled NAV</th><th>Modeled P&L</th><th>Fees / financing</th></tr></thead><tbody>{shadow.sleeves.map(s => <tr key={s.strategyId}><th>{strategies.find(row => row.id === s.strategyId)?.name ?? s.strategyId}</th><td>{dollars(s.contributedUsd)}</td><td>{dollars(s.navUsd)}</td><td>{dollars(s.pnlUsd)}</td><td>{dollars(s.feesUsd + s.financingUsd)}</td></tr>)}</tbody></table></div><p className="section-note">Last recorded {new Date(shadow.recordedAt!).toLocaleString()} · saved plan revision {shadow.revision} · {shadow.pending ? 'A target is waiting for a later quote.' : 'No pending modeled rebalance.'}</p></> : <p className="section-note">No observations yet. Save a plan and connect the virtual observer to begin prospective evaluation.</p>}
      <p className="section-note">Modeled results include spread, impact, fees and financing. Distributions, corporate actions and tax are unmodeled.</p>
    </details>
    <div className="portfolio-save"><span>{dirty ? 'Unsaved changes' : saved.revision ? `Saved · revision ${saved.revision}` : 'New paper plan'}</span><button className="text-button" disabled={saving} onClick={() => void reload()}>Reload</button><button className="text-button primary" disabled={saving || Boolean(invalid) || (!dirty && saved.revision > 0) || Boolean(changedElsewhere)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save plan'}</button></div>
    <details className="hub-details"><summary>Revision history · last 20 saves</summary><div className="table-scroll"><table><thead><tr><th>Revision</th><th>Saved</th><th>Budget</th><th>Participating</th><th>Plan state</th></tr></thead><tbody>{saved.history.map(r => <tr key={r.revision}><th>{r.revision}</th><td>{new Date(r.updatedAt).toLocaleString()}</td><td>{dollars(r.capitalUsd)}</td><td>{r.participating}</td><td>{r.paused ? 'Paused' : 'Available for shadow evaluation'}</td></tr>)}{!saved.history.length && <tr><td colSpan={5} className="table-empty">Save your first plan to start its revision history.</td></tr>}</tbody></table></div></details>
  </div>
}
