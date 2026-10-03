import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MetricRail } from '../components/MetricRail'
import { PerformanceChart } from '../components/PerformanceChart'
import { formatCurrency as money, formatNumber as number, signedPercent as percent } from '../utils/format'
import type { Assumptions, CashFlow, Experiment, RunRecord, RunRequest, StrategyDefinition } from './types'
import { createCashFlow, selectedFlowSleeve } from './cashFlows'
import { HistoricalReplay } from './HistoricalReplay'
import './hub.css'

type View = 'portfolio' | 'research' | 'experiments' | 'reports' | 'connections' | 'replay'
type Catalog = { migration?: { status: string; importedRuns: number; importedEvents: number; error?: string; conflicts: string[] }; definitions: StrategyDefinition[]; ngas: StrategyDefinition; assumptions: Assumptions; capabilities: { id: string; name: string; type: string; status: string; products: string }[]; reporting: { checkedAt: string; status: string; delivery: string; metrics: string; requirements: string; nextStep: string } }
type RunSummary = Omit<RunRecord, 'result'> & { summary: NonNullable<RunRecord['result']>['summary'] | null }
type Ledger = { status: string; error?: string; experiments: Experiment[]; historyCount: number; hash: string | null; pendingAppend: boolean; importedAt: string }
type Report = { weeks: { week: string; endDate: string; nav: number; netPnl: number; netExternalFlows: number; returnPct: number; executionCosts: number; sleeveNav: Record<string, number> }[]; label: string; runId: string }
const views: View[] = ['portfolio', 'research', 'replay', 'experiments', 'reports', 'connections']
const viewFromHash = () => views.includes(window.location.hash.slice(1) as View) ? window.location.hash.slice(1) as View : 'portfolio'
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/hub/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Qore-Local': '1' }, body: JSON.stringify(body), signal } : { signal })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Local research service unavailable.')
  return value
}
function exportFile(filename: string, content: string) {
  const bridge = (window as unknown as { webkit?: { messageHandlers?: { qoreExport?: { postMessage: (body: unknown) => void } } } }).webkit?.messageHandlers?.qoreExport
  if (bridge) { bridge.postMessage({ filename, content }); return }
  const url = URL.createObjectURL(new Blob([content], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function DataTable({ children, label }: { children: ReactNode; label: string }) { return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}><table>{children}</table></div> }
function Panel({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) { return <section className="data-section"><header className="section-header"><h2>{title}</h2>{detail && <span>{detail}</span>}</header>{children}</section> }

export function StrategyHub() {
  const [view, setView] = useState<View>(viewFromHash)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [definitions, setDefinitions] = useState<StrategyDefinition[]>([])
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null)
  const [capital, setCapital] = useState(100000)
  const [partition, setPartition] = useState<RunRequest['partition']>('development')
  const [flows, setFlows] = useState<CashFlow[]>([])
  const [parentRunId, setParentRunId] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [active, setActive] = useState<RunRecord | null>(null)
  const [comparison, setComparison] = useState<RunRecord | null>(null)
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingRun, setLoadingRun] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState('trend-core')
  const [traceStrategy, setTraceStrategy] = useState('trend-core')
  const [traceDate, setTraceDate] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('study')
  const [experimentId, setExperimentId] = useState('')
  const [flowDate, setFlowDate] = useState('2026-02-02')
  const [flowAmount, setFlowAmount] = useState(0)
  const [flowSleeve, setFlowSleeve] = useState('trend-core')
  const selectionSequence = useRef(0)
  const running = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    api<Catalog>('catalog', undefined, controller.signal).then(c => { setCatalog(c); setDefinitions(c.definitions); setAssumptions(c.assumptions) }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    api<RunSummary[]>('runs', undefined, controller.signal).then(setRuns).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    const change = () => setView(viewFromHash())
    window.addEventListener('hashchange', change)
    return () => { controller.abort(); window.removeEventListener('hashchange', change) }
  }, [])

  useEffect(() => {
    if (view !== 'experiments') return
    const controller = new AbortController()
    api<Ledger>('experiments', undefined, controller.signal).then(setLedger).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [view])

  useEffect(() => {
    if (!active?.result) return
    const controller = new AbortController()
    api<Report>(`runs/${active.id}/report`, undefined, controller.signal).then(setReport).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [active])

  const navigate = (next: View) => { window.history.pushState(null, '', `#${next}`); setView(next) }
  const selectRun = async (id: string, compare = false) => {
    const sequence = ++selectionSequence.current
    setLoadingRun(true); setError('')
    try {
      const record = await api<RunRecord>(`runs/${id}`)
      if (sequence !== selectionSequence.current) return
      if (compare) setComparison(record)
      else { setActive(record); setComparison(null); setReport(null); setTraceDate(''); setTraceStrategy(record.request?.definitions?.[0]?.id ?? ''); }
    } catch (e) { if (sequence === selectionSequence.current) setError((e as Error).message) }
    finally { if (sequence === selectionSequence.current) setLoadingRun(false) }
  }
  const run = async () => {
    if (!assumptions || running.current) return
    running.current = true; setBusy(true); setError(''); ++selectionSequence.current; setLoadingRun(false)
    try {
      const request: RunRequest = { definitions, assumptions, capital, partition, flows }
      const record = await api<RunRecord>('runs', { request, parentRunId })
      setActive(record); setComparison(null); setReport(null); setTraceDate(''); setTraceStrategy(record.request?.definitions?.[0]?.id ?? '');
      setRuns(await api<RunSummary[]>('runs'))
      if (record.status === 'blocked') setError(record.error ?? 'Simulation blocked.')
      else navigate('portfolio')
    } catch (e) { setError((e as Error).message) }
    finally { running.current = false; setBusy(false) }
  }
  const editRun = () => {
    if (!active?.request || !Array.isArray(active.request.definitions) || active.request.definitions.some(d => !d || typeof d.id !== 'string' || typeof d.name !== 'string' || typeof d.kind !== 'string' || typeof d.status !== 'string' || !Array.isArray(d.instruments) || !d.parameters) || !active.request.assumptions || !Array.isArray(active.request.flows)) { setError('This malformed trial has no editable protocol.'); return }
    setDefinitions(structuredClone(active.request.definitions)); setAssumptions({ ...active.request.assumptions }); setCapital(active.request.capital); setPartition(active.request.partition); setFlows(structuredClone(active.request.flows)); setParentRunId(active.id); navigate('research')
  }
  const updateDefinition = (id: string, patch: Partial<StrategyDefinition>) => setDefinitions(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d))
  const flowTarget = selectedFlowSleeve(definitions, flowSleeve)
  const addFlow = () => {
    try { const flow = createCashFlow(definitions, { date: flowDate, amount: flowAmount, sleeveId: flowTarget }); setFlows([...flows, flow]) }
    catch (e) { setError((e as Error).message) }
  }
  const selected = definitions.find(d => d.id === selectedStrategy) ?? definitions[0]
  const result = active?.result
  const summary = result?.summary
  const chart = result?.points.map((p, chartIndex) => ({ chartIndex, date: p.date, portfolio: p.twrPct, compare: comparison?.result?.points.find(c => c.date === p.date)?.twrPct ?? null })) ?? []
  const compatibleCompare = comparison?.result && result && comparison.dataHash === active?.dataHash && comparison.result.partition === result.partition
  const trace = result?.traces.find(t => t.sleeveId === traceStrategy && t.date === (traceDate || result.points.at(-1)?.date))
  const experiments = ledger?.experiments.filter(e => (!kind || e.kind === kind) && `${e.id} ${e.title} ${e.status} ${e.theory}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const experiment = ledger?.experiments.find(e => e.id === experimentId)

  return <div className="app-shell hub-shell">
    <header className="topbar"><a className="wordmark" href="#portfolio"><span>QORE</span><b>Strategy Hub</b></a><nav aria-label="Primary">{views.map(v => <button key={v} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => navigate(v)}>{v === 'replay' ? 'Historical replay' : v[0].toUpperCase() + v.slice(1)}</button>)}</nav></header>
    <main className="view">
      <div className="breadcrumb">Workspace / {view[0].toUpperCase() + view.slice(1)} <span className="hub-local">Local desktop candidate · Live disabled</span></div>
      <header className="view-header"><div className="view-heading"><h1>{view === 'portfolio' ? 'Portfolio overview' : view === 'research' ? 'Strategy laboratory' : view === 'experiments' ? 'Experiment history' : view === 'reports' ? 'Weekly portfolio brief' : view === 'replay' ? 'Historical strategy replay' : 'Data & execution connections'}</h1><div className="header-meta"><span className="mode-label">{view === 'replay' ? 'HISTORICAL REPLAY' : 'PAPER SIMULATION'}</span><span>{view === 'replay' ? 'Released NAV research · no broker connection' : 'Synthetic fixtures · USD · no broker connection'}</span></div></div><div className="hub-toolbar"><button className="text-button" disabled title="Live execution is unconfigured">Live unavailable</button><button className="text-button primary" onClick={() => navigate('research')}>New experiment</button></div></header>
      {error && <div className="notice warning" role="alert"><strong>Action needs attention</strong><span>{error}</span><button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
      {!catalog && <div className="notice">{error ? 'Start the native QORE app to connect its local research service.' : 'Loading local research service…'}</div>}
      {catalog?.migration && ['conflict', 'attention'].includes(catalog.migration.status) && <div className="notice warning" role="alert"><strong>Previous run migration needs attention</strong><span>Originals and existing destination records are preserved. {catalog.migration.error ?? catalog.migration.conflicts.join('; ')} Quit QORE and resolve the storage conflict before recording new trials.</span></div>}
      {catalog?.migration?.status === 'migrated' && <div className="notice"><strong>Previous runs imported</strong><span>{catalog.migration.importedRuns} runs and {catalog.migration.importedEvents} registry events added. Original files were preserved.</span></div>}
      {view === 'replay' && <HistoricalReplay />}
      {view !== 'replay' && <div className="control-strip hub-run-strip"><label><span>Active frozen run</span><select aria-label="Active frozen run" value={active?.id ?? ''} disabled={busy || loadingRun} onChange={e => { if (e.target.value) void selectRun(e.target.value) }}><option value="">Choose a recorded experiment</option>{runs.map(r => <option key={r.id} value={r.id}>{r.createdAt.slice(0, 16).replace('T', ' ')} · {r.request?.partition ?? 'Invalid protocol'} · {r.status} · {r.id.slice(-8)}</option>)}</select></label><div><span>Reconciliation</span><strong>{summary ? `${number(summary.reconciliationError, 8)} USD difference` : 'No simulation selected'}</strong></div><div><span>Broker state</span><strong>Unconfigured</strong></div>{active && <button className="text-button" disabled={busy || loadingRun} onClick={editRun}>Edit as new trial</button>}</div>}
      {view === 'portfolio' && <>
        {!result ? <Panel title="A shared portfolio starts with a recorded run"><div className="hub-empty"><h2>{active?.status === 'blocked' ? 'This experiment was blocked and preserved.' : 'No simulated portfolio yet.'}</h2><p>Configure three contrasting strategies, freeze the assumptions, and run the shared ledger.</p><button className="text-button primary" onClick={() => navigate('research')}>Open strategy laboratory</button></div></Panel> : <>
          <MetricRail ariaLabel="Simulated portfolio metrics" metrics={[{ label: 'Portfolio NAV', value: money(summary!.nav), detail: `Contributed ${money(summary!.contributed)}` }, { label: 'Net investment P&L', value: money(summary!.pnl), detail: 'External cash flows excluded', tone: summary!.pnl >= 0 ? 'positive' : 'negative' }, { label: 'Time-weighted return', value: percent(summary!.twrPct), detail: 'Valued before and after each opening flow' }, { label: 'Maximum drawdown', value: percent(summary!.drawdownPct), detail: 'Based on flow-adjusted wealth' }]} />
          <PerformanceChart title="Portfolio performance" meta={`${result.partition} · ${result.points[0].date} — ${result.points.at(-1)?.date} · drag to zoom`} data={chart} empty="No completed sessions." series={[{ axis: 'left', color: '#1767a6', dataKey: 'portfolio', id: 'portfolio', label: 'Active run · TWR', valueFormatter: percent }, ...(compatibleCompare ? [{ axis: 'left' as const, color: '#b27a3d', dataKey: 'compare' as const, id: 'compare', label: 'Comparison run · TWR', valueFormatter: percent }] : [])]} />
          <Panel title="Strategy attribution" detail="Sleeves add to the single account NAV"><DataTable label="Strategy attribution"><thead><tr><th>Strategy sleeve</th><th>Contributed</th><th>NAV</th><th>Net P&L</th><th>TWR</th><th>Cash</th><th>Costs¹</th></tr></thead><tbody>{result.sleeves.map(s => <tr key={s.id}><th>{s.name}<small>{s.id}</small></th><td>{money(s.contributed)}</td><td>{money(s.nav)}</td><td className={s.pnl < 0 ? 'negative' : 'positive'}>{money(s.pnl)}</td><td>{percent(s.twrPct)}</td><td>{money(s.cash)}</td><td>{number(s.fees + s.slippage + s.borrow)}</td></tr>)}</tbody></DataTable><p className="section-note">¹ Fees, slippage and borrow charged once. Income {money(summary!.income)}. Internal transfers cross at the opening reference; external net costs are shared by absolute sleeve changes. Ending positions are marked, not liquidated.</p></Panel>
          <div className="data-grid"><Panel title="Netted account positions" detail="One position per instrument"><DataTable label="Netted positions"><thead><tr><th>Instrument</th><th>Net quantity</th><th>Virtual gross quantity</th></tr></thead><tbody>{Object.entries(result.positions).map(([id, quantity]) => <tr key={id}><th>{id}<small>Synthetic ETF-like fixture</small></th><td>{number(quantity, 4)}</td><td>{number(result.sleeves.reduce((n, s) => n + Math.abs(s.positions[id] ?? 0), 0), 4)}</td></tr>)}</tbody></DataTable></Panel><Panel title="Frozen provenance"><dl className="facts"><div><dt>Data / code hashes</dt><dd><code>{active!.dataHash.slice(0, 20)}</code><small><code>{active!.codeHash.slice(0, 20)}</code></small></dd></div><div><dt>Timing & costs</dt><dd>{result.assumptions.lagSessions} prior session(s) → next open<small>{result.assumptions.feeBps} bps fees + {result.assumptions.slippageBps} bps slippage · {result.assumptions.borrowAprPct}% borrow APR</small></dd></div><div><dt>Exposure</dt><dd>Synthetic, already inspectable<small>Protected outcomes unavailable. Test reruns are recorded, not fresh discoveries.</small></dd></div></dl></Panel></div>
          <Panel title="Decision & position trace"><div className="hub-trace-controls"><label>Sleeve<select aria-label="Trace sleeve" value={traceStrategy} onChange={e => setTraceStrategy(e.target.value)}>{active!.request.definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Execution session<select aria-label="Trace session" value={traceDate || result.points.at(-1)?.date} onChange={e => setTraceDate(e.target.value)}>{result.points.map(p => <option key={p.date}>{p.date}</option>)}</select></label></div>{trace && <dl className="facts"><div><dt>Decision</dt><dd>{trace.reason}<small>{trace.status} · Information cut {trace.asOf}</small></dd></div><div><dt>Target / actual positions</dt><dd>{Object.entries(trace.weights).map(([id, w]) => `${id} ${percent(w * 100)}`).join(' · ') || 'Cash'}<small>{Object.entries(trace.positions).map(([id, q]) => `${id} ${number(q, 4)} shares`).join(' · ')}</small></dd></div><div><dt>Sleeve valuation</dt><dd>{money(trace.nav)} NAV · {money(trace.cash)} cash</dd></div></dl>}</Panel>
          <details className="hub-details"><summary>Execution ledger · {result.fills.length} netting events</summary><DataTable label="Execution ledger"><thead><tr><th>Session / instrument</th><th>Net quantity</th><th>Fill price</th><th>Internal cross</th><th>Fees</th><th>Slippage</th></tr></thead><tbody>{result.fills.map((f, i) => <tr key={i}><th>{f.date} / {f.instrument}</th><td>{number(f.quantity, 4)}</td><td>{number(f.fillPrice, 4)}</td><td>{number(f.internalCrossQuantity, 4)}</td><td>{number(f.fee)}</td><td>{number(f.slippage)}</td></tr>)}</tbody></DataTable></details>
        </>}
      </>}
      {view === 'research' && catalog && assumptions && <>
        <div className="notice"><strong>Research workspace</strong><span>Fixture runs test the machinery, not an investment thesis. Every run freezes code, data, parameters and costs before outcomes; negative and blocked trials remain recorded.</span></div>
        <div className="hub-lab-grid"><Panel title="Strategy definitions" detail={`${definitions.length} / 24 sleeves`}><div className="hub-strategy-list">{definitions.map(d => <button key={d.id} className={selected?.id === d.id ? 'selected' : ''} onClick={() => setSelectedStrategy(d.id)}><span>{d.name}</span><small>{d.kind} · {d.status} · {number(d.allocation * 100, 0)}% capital</small></button>)}</div><div className="hub-panel-action"><button className="text-button" disabled={definitions.length >= 24} onClick={() => { const d = structuredClone(catalog.definitions[definitions.length % 3]); d.id = `sleeve-${crypto.randomUUID().slice(0, 8)}`; d.name += ` ${definitions.length + 1}`; d.allocation = 0; setDefinitions([...definitions, d]); setSelectedStrategy(d.id) }}>Add strategy sleeve</button></div></Panel><Panel title={selected?.name ?? 'Definition editor'} detail="Pure deterministic target logic">{selected && <div className="hub-form"><label>Strategy name<input value={selected.name} onChange={e => updateDefinition(selected.id, { name: e.target.value })} maxLength={120} /></label><label>Lifecycle<select value={selected.status} onChange={e => updateDefinition(selected.id, { status: e.target.value as StrategyDefinition['status'] })}><option value="research">Research</option><option value="paused">Paused / cash</option></select></label><label>Capital allocation (%)<input type="number" min={0} max={100} value={selected.allocation * 100} onChange={e => updateDefinition(selected.id, { allocation: Number(e.target.value) / 100 })} /></label><label>Completed sessions<input type="number" min={2} max={60} step={1} value={selected.parameters.lookback} onChange={e => updateDefinition(selected.id, { parameters: { ...selected.parameters, lookback: Number(e.target.value) } })} /></label><label>Signal threshold (%)<input type="number" min={0} max={50} step={.1} value={Number((selected.parameters.threshold * 100).toFixed(4))} onChange={e => updateDefinition(selected.id, { parameters: { ...selected.parameters, threshold: Number(e.target.value) / 100 } })} /></label><label>Gross exposure (%)<input type="number" min={0} max={100} value={selected.parameters.exposure * 100} onChange={e => updateDefinition(selected.id, { parameters: { ...selected.parameters, exposure: Number(e.target.value) / 100 } })} /></label><p className="hub-form-note">{selected.kind === 'trend' ? 'Long when completed-session momentum exceeds the threshold; otherwise cash.' : selected.kind === 'reversion' ? 'Buy below the trailing mean; short above it. Threshold controls the cash band.' : 'Trade opposing legs around the trailing price ratio. Gross is split equally; calendar alignment is required.'}<br />Instruments: {selected.instruments.join(' / ')} · Simulation only</p><button className="text-button" disabled={definitions.length <= 1} onClick={() => { setDefinitions(definitions.filter(d => d.id !== selected.id)); setSelectedStrategy(definitions.find(d => d.id !== selected.id)?.id ?? '') }}>Remove sleeve</button></div>}</Panel></div>
        <Panel title="Experiment protocol" detail={parentRunId ? `Revision of ${parentRunId.slice(-8)}; prior run stays frozen` : 'New trial'}><div className="hub-form hub-protocol"><label>Starting capital (USD)<input type="number" min={1} value={capital} onChange={e => setCapital(Number(e.target.value))} /></label><label>Partition<select value={partition} onChange={e => { setPartition(e.target.value as RunRequest['partition']); setFlows([]); setFlowDate(e.target.value === 'test' ? '2026-04-01' : '2026-02-02') }}><option value="development">Development · Jan 5 – Mar 27</option><option value="test">Test · Mar 30 – May 8</option></select></label>{(['feeBps', 'slippageBps', 'borrowAprPct', 'lagSessions'] as const).map(key => <label key={key}>{({ feeBps: 'Fees (bps)', slippageBps: 'Slippage (bps)', borrowAprPct: 'Borrow APR (%)', lagSessions: 'Prior-session signal lag' })[key]}<input type="number" min={key === 'lagSessions' ? 1 : 0} max={key === 'lagSessions' ? 5 : 100} step={1} value={assumptions[key]} onChange={e => setAssumptions({ ...assumptions, [key]: Number(e.target.value) })} /></label>)}</div><p className="section-note">Allocation {number(definitions.reduce((n, d) => n + d.allocation, 0) * 100, 2)}% · Remaining capital stays in cash. Raw synthetic prices + explicit income, zero cash interest; borrow uses prior net shorts and calendar days / 360. Opening distributions and overnight borrow enter NAV before cash flows. Signal age limit: {assumptions.maxAgeDays} days. Test history is exposed synthetic data. No optimization or hidden data access.</p><details className="hub-flow"><summary>External cash flows · {flows.length} recorded</summary><div className="hub-form hub-flow-form"><label>Opening session<input type="date" value={flowDate} onChange={e => setFlowDate(e.target.value)} /></label><label>Amount (negative = withdrawal)<input type="number" value={flowAmount} onChange={e => setFlowAmount(Number(e.target.value))} /></label><label>Sleeve<select value={flowTarget} onChange={e => setFlowSleeve(e.target.value)}>{definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}<option value="reserve">Unallocated cash</option></select></label><button className="text-button" onClick={addFlow}>Add flow</button></div>{flows.map((f, i) => <p className="section-note" key={i}>{f.date} · {money(f.amount)} · {f.sleeveId} <button className="link-button" onClick={() => setFlows(flows.filter((_, index) => index !== i))}>Remove</button></p>)}</details><div className="hub-run-action"><span>Freeze this configuration and write a new immutable experiment.</span><button className="text-button primary" disabled={busy} onClick={() => void run()}>{busy ? 'Running shared simulation…' : 'Freeze & run simulation'}</button></div></Panel>
        <Panel title="Run registry" detail="Completed and blocked trials retained"><DataTable label="Run registry"><thead><tr><th>Run / recorded</th><th>Partition</th><th>Status</th><th>Net P&L</th><th>TWR</th><th>Action</th></tr></thead><tbody>{runs.length ? runs.map(r => <tr key={r.id}><th>{r.id.slice(-8)}<small>{r.createdAt.slice(0, 19).replace('T', ' ')}</small></th><td>{r.request?.partition ?? 'Invalid protocol'}</td><td>{r.status}</td><td>{r.summary ? money(r.summary.pnl) : 'Unavailable'}</td><td>{r.summary ? percent(r.summary.twrPct) : 'Unavailable'}</td><td><button className="link-button" disabled={busy || loadingRun} onClick={() => { void selectRun(r.id); navigate('portfolio') }}>Inspect</button>{active?.result && r.status === 'completed' && r.id !== active.id && <button className="link-button" disabled={busy || loadingRun} onClick={() => { void selectRun(r.id, true); navigate('portfolio') }}>Compare</button>}</td></tr>) : <tr><td className="table-empty" colSpan={6}>No experiments recorded yet.</td></tr>}</tbody></DataTable></Panel>
      </>}
      {view === 'experiments' && <>
        <div className="notice"><strong>Canonical research ledger</strong><span>{ledger ? `${ledger.experiments.length} latest records from ${ledger.historyCount} history events · ${ledger.status}` : 'Loading…'}. Study, design, configuration and version records are not additive discoveries. Historical equity dates through Oct 1, 2026 are exposed; protected GEFS outcomes remain unavailable.</span></div>
        <div className="hub-search"><label>Search evidence<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Mechanism, study, result or retry…" /></label><label>Record kind<select value={kind} onChange={e => setKind(e.target.value)}><option value="study">Studies</option><option value="design">Designs</option><option value="configuration">Configurations</option><option value="history_group">History groups (zero tests)</option><option value="">All records</option></select></label><button className="text-button" onClick={() => { void api<Ledger>('experiments').then(setLedger).catch(e => setError(e.message)) }}>Refresh read-only ledger</button></div>
        {ledger?.error ? <div className="notice warning">{ledger.error}</div> : <Panel title="Research evidence" detail={`${experiments.length} matches; showing first 100`}><DataTable label="Research experiments"><thead><tr><th>Experiment / mechanism</th><th>Kind</th><th>Revision</th><th>Outcome / state</th><th>Details</th></tr></thead><tbody>{experiments.slice(0, 100).map(e => <tr key={e.id}><th className="hub-wrap">{e.title}<small>{e.id}</small></th><td>{e.kind}</td><td>{e.revision}</td><td className="hub-wrap">{e.status.replaceAll('_', ' ')}</td><td><button className="link-button" onClick={() => setExperimentId(e.id)}>Read evidence</button></td></tr>)}</tbody></DataTable></Panel>}
        {experiment && <Panel title={experiment.title} detail={`Revision ${experiment.revision}`}><p className="section-note">{experiment.theory}</p><dl className="facts"><div><dt>Inheritance</dt><dd>{experiment.inheritedFrom.join(' → ') || 'Study-owned evidence'}</dd></div><div><dt>Retry conditions</dt><dd className="hub-wrap">{experiment.retry}</dd></div><div><dt>Source binding</dt><dd>{experiment.sources.length ? experiment.sources.map((s, i) => <p key={i}>{s.name}<small><code>{s.sha256}</code></small></p>) : 'No source refs supplied in this revision.'}</dd></div></dl><details className="hub-details"><summary>Frozen protocol</summary><pre>{experiment.protocol}</pre></details><details className="hub-details"><summary>Released metrics, exposure and audit gaps</summary><pre>{experiment.metrics}</pre></details><p className="section-note">Missing final metrics remain unavailable. Nonselected, failed, blocked and skipped evidence is retained by the canonical log owner.</p></Panel>}
      </>}
      {view === 'reports' && <>
        <div className="notice"><strong>Simulation weekly report</strong><span>Weekly values come from the active frozen run’s ledger. Actual PAPER account reporting is unavailable; scheduled email is inactive.</span></div>
        {report && active?.result ? <><Panel title="Weekly performance & flows" detail={`Frozen run ${active.id.slice(-8)}`}><DataTable label="Weekly report"><thead><tr><th>Week starting / last session</th><th>Closing NAV</th><th>Net P&L</th><th>External flows</th><th>TWR</th><th>Fees + slippage</th></tr></thead><tbody>{report.weeks.map(w => <tr key={w.week}><th>{w.week}<small>{w.endDate}</small></th><td>{money(w.nav)}</td><td className={w.netPnl < 0 ? 'negative' : 'positive'}>{money(w.netPnl)}</td><td>{money(w.netExternalFlows)}</td><td>{percent(w.returnPct)}</td><td>{number(w.executionCosts)}</td></tr>)}</tbody></DataTable><p className="section-note">Net P&L includes borrow and explicit income. Weekly sleeve closing NAV is included in JSON. Partial weeks retain actual session bounds.</p></Panel><div className="hub-toolbar"><button className="text-button" onClick={() => exportFile(`${active.id}-weekly.json`, JSON.stringify(report, null, 2))}>Export weekly JSON</button><button className="text-button" onClick={() => exportFile(`${active.id}-weekly.csv`, 'week,end_date,nav_usd,net_pnl_usd,flows_usd,twr_pct,execution_costs_usd\n' + report.weeks.map(w => [w.week, w.endDate, w.nav, w.netPnl, w.netExternalFlows, w.returnPct, w.executionCosts].join(',')).join('\n'))}>Export weekly CSV</button><button className="text-button" onClick={() => exportFile(`${active.id}.json`, JSON.stringify(active, null, 2))}>Export full frozen run</button></div></> : <Panel title="Select a completed run"><p className="inline-empty">No report is invented for an empty or blocked portfolio.</p></Panel>}
        {catalog && <Panel title="Actual PAPER reporting" detail={`Implementation check ${catalog.reporting.checkedAt.replace('T', ' ').replace('Z', ' UTC')}`}><dl className="facts"><div><dt>Collection / delivery</dt><dd>{catalog.reporting.status.replaceAll('-', ' ')}<small>{catalog.reporting.delivery.replaceAll('-', ' ')}</small></dd></div><div><dt>Account metrics</dt><dd className="hub-wrap">{catalog.reporting.metrics}</dd></div><div><dt>Required evidence</dt><dd className="hub-wrap">{catalog.reporting.requirements}</dd></div></dl><p className="section-note">{catalog.reporting.nextStep}</p></Panel>}
      </>}
      {view === 'connections' && catalog && <>
        <Panel title="Capability matrix" detail="Explicit availability"><DataTable label="Connector capabilities"><thead><tr><th>Adapter</th><th>Boundary</th><th>State</th><th>Supported contract / next step</th></tr></thead><tbody>{catalog.capabilities.map(c => <tr key={c.id}><th>{c.name}</th><td>{c.type}</td><td>{c.status}</td><td className="hub-wrap">{c.products}</td></tr>)}</tbody></DataTable></Panel><Panel title="Natural gas remains an isolated strategy"><p className="section-note">{catalog.ngas.name} retains its existing NGAS inference, UNG/VOO/QQQM execution and research contracts. This candidate does not call its runtime or broker. Replaying released target ledgers is the next integration slice; futures symbols cannot route through the Alpaca boundary.</p></Panel>
      </>}
      {comparison && <div className="notice"><strong>Comparison {comparison.id.slice(-8)}</strong><span>{compatibleCompare ? 'Independent run overlay; returns are never added into the active portfolio.' : 'Different partition or data hash; overlay withheld.'}</span><button className="text-button" onClick={() => setComparison(null)}>Clear comparison</button></div>}
      <footer className="hub-footer"><span>QORE · Research candidate · {runs.length} frozen local trials</span><span>{active ? `${active.engineVersion} · ${active.codeRevision}` : 'No live execution path'} · Protected data unavailable</span></footer>
    </main>
  </div>
}
