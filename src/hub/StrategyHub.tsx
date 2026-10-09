import { useEffect, useState } from 'react'
import type { Experiment } from './types'
import { HistoricalReplay } from './HistoricalReplay'
import { PaperCandidates } from './PaperCandidates'
import { PortfolioControl } from './PortfolioControl'
import { NgasPerformance } from './NgasPerformance'
import './hub.css'

type Strategy = { id: string; name: string; stage: string; label: string; description: string; view: 'ngas' | 'leverage' | 'paper' | 'unconfigured' }
type Catalog = { strategies: Strategy[]; brokerSubmissionEnabled: false }
type Ledger = { status: string; error?: string; experiments: Experiment[]; historyCount: number; pendingAppend: boolean }
type View = 'strategies' | 'portfolio' | 'experiments' | 'connections'
const views: View[] = ['strategies', 'portfolio', 'experiments', 'connections']
const initialView = (): View => views.includes(window.location.hash.slice(1) as View) ? window.location.hash.slice(1) as View : 'strategies'

async function read<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/hub/${endpoint}`, { signal })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Kairos evidence is unavailable.')
  return value
}

export function StrategyHub() {
  const [view, setView] = useState<View>(initialView)
  const [portfolioVisited, setPortfolioVisited] = useState(() => initialView() === 'portfolio')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selectedId, setSelectedId] = useState('ngas-all-year-beta')
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('study')
  const [experimentId, setExperimentId] = useState('')
  const [error, setError] = useState('')
  const [ledgerRefresh, setLedgerRefresh] = useState(0)
  const [strategyQuery, setStrategyQuery] = useState('')
  const [strategyTab, setStrategyTab] = useState<'performance' | 'details'>('performance')

  useEffect(() => {
    const controller = new AbortController()
    read<Catalog>('catalog', controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    const change = () => { const next = initialView(); setView(next); if (next === 'portfolio') setPortfolioVisited(true) }
    window.addEventListener('hashchange', change)
    return () => { controller.abort(); window.removeEventListener('hashchange', change) }
  }, [])

  useEffect(() => {
    if (view !== 'experiments') return
    const controller = new AbortController()
    read<Ledger>('experiments', controller.signal).then(value => { if (!controller.signal.aborted) { setLedger(value); setError('') } }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [view, ledgerRefresh])

  const navigate = (next: View) => { window.location.hash = next; setView(next); if (next === 'portfolio') setPortfolioVisited(true); setError('') }
  const selected = catalog?.strategies.find(s => s.id === selectedId) ?? catalog?.strategies[0]
  const registeredStrategies = catalog?.strategies.filter(s => `${s.name} ${s.label} ${s.description}`.toLowerCase().includes(strategyQuery.toLowerCase())) ?? []
  const experiments = ledger?.experiments.filter(e => (!kind || e.kind === kind) && `${e.title} ${e.id} ${e.status} ${e.theory} ${e.retry}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const experiment = ledger?.experiments.find(e => e.id === experimentId)

  return <div className="app-shell hub-shell">
    <header className="topbar">
      <a className="wordmark" href="#strategies" onClick={() => navigate('strategies')}><span>Kairos</span></a>
      <nav aria-label="Primary">{views.map(v => <button key={v} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => navigate(v)}>{v === 'experiments' ? 'Ledger' : v[0].toUpperCase() + v.slice(1)}</button>)}</nav>
    </header>
    <main className="workspace">
      <div className="workspace-heading"><h1>{view === 'strategies' ? 'Strategies' : view === 'portfolio' ? 'Portfolio' : view === 'experiments' ? 'Research ledger' : 'Connections'}</h1><span className="hub-status">Research &amp; paper · No orders</span></div>
      {error && <div className="notice warning" role="alert">{error}</div>}
      {portfolioVisited && catalog && <div hidden={view !== 'portfolio'}><PortfolioControl strategies={catalog.strategies} active={view === 'portfolio'} /></div>}
      {view === 'portfolio' && !catalog && <p role="status">Loading the strategy catalogue…</p>}
      {view === 'strategies' && <>
        {!catalog ? <p role="status">Loading the strategy catalogue…</p> : <>
          <section className="data-section strategy-selector" aria-label="Choose a strategy">
            {catalog.strategies.length > 10 && <div className="hub-search"><label>Find a strategy<input type="search" value={strategyQuery} onChange={e => setStrategyQuery(e.target.value)} placeholder="Name, mechanism or stage…" /></label></div>}
            <div className="hub-strategy-list">{registeredStrategies.map(strategy => <button key={strategy.id} className={strategy.id === selected?.id ? 'selected' : ''} aria-pressed={strategy.id === selected?.id} onClick={() => { setSelectedId(strategy.id); setStrategyTab('performance') }}><span>{strategy.name}</span><small>{strategy.view === 'ngas' ? 'Paper runtime' : strategy.view === 'leverage' ? 'Historical research' : strategy.view === 'paper' ? 'Paper candidate' : strategy.label}</small></button>)}</div>
          </section>
          {selected && <><div className="strategy-heading"><h2>{selected.name}</h2>{selected.view === 'ngas' && <a className="text-button" href="/ngas.html#command">View account →</a>}</div><nav className="section-tabs strategy-tabs" aria-label="Strategy view"><button className={strategyTab === 'performance' ? 'active' : ''} aria-current={strategyTab === 'performance' ? 'page' : undefined} onClick={() => setStrategyTab('performance')}>Performance</button><button className={strategyTab === 'details' ? 'active' : ''} aria-current={strategyTab === 'details' ? 'page' : undefined} onClick={() => setStrategyTab('details')}>Details &amp; evidence</button></nav></>}
          {selected?.view === 'ngas' && (strategyTab === 'performance' ? <NgasPerformance /> : <section className="data-section"><header className="section-header"><h2>Strategy details</h2><span>UNG execution · NG=F signal</span></header><p className="section-note">{selected.description}</p><p className="section-note">Summer and winter are internal components. Account shows current telemetry; backtests show historical simulation.</p><div className="hub-panel-action"><a className="text-button" href="/ngas.html#backtest">Backtest diagnostics →</a></div></section>)}
          {selected?.view === 'leverage' && <HistoricalReplay view={strategyTab} />}
          {selected?.view === 'paper' && <PaperCandidates key={selected.id} candidateId={selected.id} view={strategyTab} />}
          {selected?.view === 'unconfigured' && <section className="data-section"><header className="section-header"><h2>Evidence adapter pending</h2><span>{selected.label}</span></header><p className="section-note">This registered strategy has no connected evidence adapter yet. Its registration does not authorize trading or establish performance.</p></section>}
        </>}
      </>}
      {view === 'experiments' && <>
        <p className="hub-caption">{ledger ? `${ledger.experiments.length} records · ${ledger.historyCount} history events · ${ledger.status}` : 'Loading history…'}</p>
        <div className="hub-search"><label>Search evidence<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Strategy, result or retry condition…" /></label><label>Record kind<select value={kind} onChange={e => setKind(e.target.value)}><option value="study">Studies</option><option value="design">Designs</option><option value="configuration">Configurations</option><option value="history_group">History groups</option><option value="">All records</option></select></label><button className="text-button" onClick={() => setLedgerRefresh(value => value + 1)}>Refresh ledger</button></div>
        {ledger?.error ? <div className="notice warning">{ledger.error}</div> : <section className="data-section"><header className="section-header"><h2>Research evidence</h2><span>{experiments.length} matches · first 100 shown</span></header><div className="table-scroll" role="region" aria-label="Research experiments" tabIndex={0}><table><thead><tr><th>Experiment / mechanism</th><th>Kind</th><th>Revision</th><th>Outcome / state</th><th>Details</th></tr></thead><tbody>{experiments.slice(0, 100).map(e => <tr key={e.id}><th className="hub-wrap">{e.title}<small>{e.id}</small></th><td>{e.kind}</td><td>{e.revision === null ? 'Append-only' : e.revision}</td><td className="hub-wrap">{e.status.replaceAll('_', ' ')}</td><td><button className="link-button" onClick={() => setExperimentId(e.id)}>Read evidence</button></td></tr>)}</tbody></table></div></section>}
        {experiment && <section className="data-section"><header className="section-header"><h2>{experiment.title}</h2><span>{experiment.revision === null ? 'Append-only research record' : `Revision ${experiment.revision}`}</span></header><p className="section-note">{experiment.theory}</p><dl className="facts"><div><dt>Inheritance</dt><dd>{experiment.inheritedFrom.join(' → ') || 'Study-owned evidence'}{experiment.studyGroup && <small>Study group: {experiment.studyGroup}</small>}</dd></div><div><dt>Retry conditions</dt><dd className="hub-wrap">{experiment.retry}</dd></div><div><dt>Source bindings</dt><dd>{experiment.sources.map((source, i) => <p key={i}>{source.name}<small><code>{source.sha256}</code></small></p>)}</dd></div></dl><details className="hub-details"><summary>Frozen protocol</summary><pre>{experiment.protocol}</pre></details><details className="hub-details"><summary>Released metrics and audit gaps</summary><pre>{experiment.metrics}</pre></details></section>}
      </>}
      {view === 'connections' && <>
        <section className="data-section"><header className="section-header"><h2>Current boundaries</h2><span>No submission endpoint</span></header><dl className="facts"><div><dt>Natural gas</dt><dd>Read-only M1 telemetry<small>The existing NGAS runtime owns Alpaca execution and risk checks.</small></dd></div><div><dt>Historical and paper strategies</dt><dd>Reviewed bundled evidence<small>Each strategy keeps its own evidence and activation requirements.</small></dd></div><div><dt>Research ledger</dt><dd>Canonical local experiment history<small>Read in place; the research owner controls appends.</small></dd></div></dl></section>
        <p className="section-note">Historical curves are research results. Paper candidates retain their fixed prospective windows and input requirements. Only the NGAS account surface displays actual account telemetry.</p>
      </>}
    </main>
  </div>
}
