import { useEffect, useState } from 'react'
import { PerformanceChart } from '../components/PerformanceChart'
import { formatNumber as number, signedPercent as percent } from '../utils/format'
import { paperControlLabel, paperOutcomeLabel } from './paperLabels'

type Candidate = { id: string; name: string; family: string; historical_status: string; outcome_exposure: string; controls: string[]; source_clock_limitations: string[]; definition: { unchanged_original_rule?: { description: string }; rule?: Record<string, unknown>; execution?: Record<string, unknown>; cost_bps?: number[] }; replayStatus: string; sourceStatus: string; prospective: { first: string; last: string; review?: string; sessions?: number; decisions?: number; terminalMark?: string }; futureInputRequirements: string[] }
type Catalog = { candidates: Candidate[]; reviewedIndexSha256: string; evidence: { id: string; sha256: string }[]; startRationale: { decision_rationale: string; why_original_oct8_not_backdated: string } }
type Frame = { date: string; wealth: number; cash: number; units: Record<string, number | string>; unit: string; event: string; decisionKnownAt?: string; fees: number; feesCumulative?: boolean; impact?: number; terminal: boolean; nextTarget?: Record<string, number>; exactBalances?: Record<string, string> }
type Replay = { id: string; frames: Frame[]; cases: { id: string; name: string }[]; selectedCase: string; note: string; limitations: string[] }

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Offline evidence unavailable.')
  return value
}

export function PaperCandidates({ candidateId, view }: { candidateId: string; view: 'performance' | 'details' }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const selectedId = candidateId
  const [replay, setReplay] = useState<Replay | null>(null)
  const [comparison, setComparison] = useState<Replay | null>(null)
  const [caseId, setCaseId] = useState('')
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [evidenceId, setEvidenceId] = useState('')
  const [evidence, setEvidence] = useState<{ id: string; sha256: string; document: unknown } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    read<Catalog>('/api/hub/paper-candidates', controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const selectedCase = caseId || (selectedId.startsWith('rv_') ? 'primary-5bp' : 'primary:strategy')
    const [cost, account] = selectedCase.split(':')
    const comparisonCase = account === 'strategy' ? `${cost}:btc_buyhold` : account === 'portfolio_strategy' ? `${cost}:portfolio_mix` : null
    const endpoint = `/api/hub/paper-candidates/${encodeURIComponent(selectedId)}/replay`
    Promise.all([
      read<Replay>(`${endpoint}?case=${encodeURIComponent(selectedCase)}`, controller.signal),
      comparisonCase ? read<Replay>(`${endpoint}?case=${encodeURIComponent(comparisonCase)}`, controller.signal) : Promise.resolve(null),
    ]).then(([value, baseline]) => {
      if (!controller.signal.aborted) { setReplay(value); setComparison(baseline); setPosition(0); setError('') }
    }).catch(e => { if (!controller.signal.aborted) { setReplay(null); setComparison(null); setError(e.message) } })
    return () => controller.abort()
  }, [selectedId, caseId])
  useEffect(() => {
    if (!playing || !replay || replay.id !== selectedId) return
    const timer = setInterval(() => setPosition(value => Math.min(value + 1, replay.frames.length - 1)), 150)
    return () => clearInterval(timer)
  }, [playing, replay, selectedId])
  useEffect(() => {
    if (!evidenceId) return
    const controller = new AbortController()
    read<{ id: string; sha256: string; document: unknown }>(`/api/hub/paper-evidence/${encodeURIComponent(evidenceId)}`, controller.signal).then(value => { if (!controller.signal.aborted) { setEvidence(value); setError('') } }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [evidenceId, selectedId])
  if (!catalog) return <div className="notice" role="status">{error || 'Checking the reviewed paper evidence…'}</div>
  const selected = catalog.candidates.find(c => c.id === selectedId)
  if (!selected) return <div className="notice warning" role="alert">This paper candidate is unavailable.</div>
  const currentReplay = replay?.id === selectedId ? replay : null
  const frame = currentReplay?.frames[position]
  const currentComparison = comparison?.id === selectedId ? comparison : null
  const comparisonFrames = new Map(currentComparison?.frames.map(f => [f.date, f]) ?? [])
  const base = currentReplay?.frames[0]?.wealth ?? 0
  const comparisonBase = currentComparison?.frames[0]?.wealth ?? 0
  const chart = currentReplay?.frames.map((f, chartIndex) => ({
    chartIndex, date: f.date,
    strategy: base > 0 ? (f.wealth / base - 1) * 100 : null,
    market: comparisonBase > 0 && comparisonFrames.has(f.date) ? (comparisonFrames.get(f.date)!.wealth / comparisonBase - 1) * 100 : null,
  })) ?? []
  return <>
    {error && <div className="notice warning" role="alert">{error}</div>}
    {view === 'performance' && <>
      <p className="hub-caption">Historical simulation · paper candidate · {paperOutcomeLabel(selected.historical_status)}</p>
      {currentReplay ? <>
        <PerformanceChart title={currentComparison ? 'Strategy vs. market' : 'Historical performance'} meta="Return since first saved mark · after modeled costs" data={chart} empty="No saved observations." series={[
          { axis: 'left', color: '#1767a6', dataKey: 'strategy', id: 'strategy', label: currentReplay.selectedCase.endsWith(':strategy') || currentReplay.selectedCase.endsWith(':portfolio_strategy') || selectedId.startsWith('rv_') ? 'Strategy' : 'Selected reference account', valueFormatter: percent },
          ...(currentComparison ? [{ axis: 'left' as const, color: '#8795a5', dataKey: 'market' as const, id: 'market', label: currentComparison.selectedCase.endsWith(':portfolio_mix') ? 'Static portfolio mix · same costs' : 'BTC buy & hold · same costs', valueFormatter: percent }] : []),
        ]} />
        {!currentComparison && <p className="hub-caption">{selectedId.startsWith('rv_') ? 'Market comparison is unavailable in the reviewed export.' : 'Choose a strategy account to compare with its retained baseline.'}</p>}
        <details className="hub-details"><summary>Replay controls &amp; saved observations</summary>
          <div className="hub-trace-controls"><label>Reference account / costs<select aria-label="Paper playback account" value={currentReplay.selectedCase} onChange={e => { setCaseId(e.target.value); setPlaying(false); setReplay(null) }}>{currentReplay.cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Observation<select aria-label="Paper playback date" value={position} onChange={e => { setPlaying(false); setPosition(Number(e.target.value)) }}>{currentReplay.frames.map((f, i) => <option key={f.date} value={i}>{f.date}</option>)}</select></label></div>
          <div className="hub-panel-action"><button className="text-button" onClick={() => { setPlaying(false); setPosition(0) }}>Restart</button><button className="text-button primary" disabled={position === currentReplay.frames.length - 1 && !playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button><button className="text-button" disabled={position === currentReplay.frames.length - 1} onClick={() => { setPlaying(false); setPosition(Math.min(position + 1, currentReplay.frames.length - 1)) }}>Next observation</button></div>
          {frame && <><dl className="facts"><div><dt>Saved observation</dt><dd>{frame.date} · {frame.event}<small>{frame.terminal ? 'Audited endpoint liquidation.' : 'Modeled reference state; no observed exchange fill.'}</small></dd></div><div><dt>Modeled wealth / cash</dt><dd>{number(frame.wealth, 8)} / {number(frame.cash, 8)} {frame.unit}<small>{frame.feesCumulative ? 'Cumulative fee' : 'Session fee'} {number(frame.fees, 8)}{frame.impact !== undefined ? ` · cumulative impact ${number(frame.impact, 8)}` : ''}</small></dd></div><div><dt>Modeled units</dt><dd>{Object.entries(frame.units).map(([symbol, units]) => `${symbol} ${units}`).join(' · ')}</dd></div><div><dt>Decision clock</dt><dd>{frame.decisionKnownAt ?? 'Daily mark; monthly rule in Details & evidence'}<small>Declared historical clocks are uncertified point-in-time observations.</small></dd></div></dl><details className="hub-details"><summary>Exact observation</summary><pre>{JSON.stringify(frame, null, 2)}</pre></details></>}
          <p className="section-note">{currentReplay.note}</p>
        </details>
      </> : <p role="status">{error ? 'Historical chart unavailable.' : 'Loading historical chart…'}</p>}
    </>}
    {view === 'details' && <>
      <section className="data-section"><header className="section-header"><h2>Rule &amp; assumptions</h2><span>Exploratory paper</span></header>
        <p className="section-note">{selected.definition.unchanged_original_rule?.description ?? 'Hold BTC after a non-losing UTC month; move to USDT cash after a losing month. Rebalance at the third UTC day’s open.'}</p>
        <dl className="facts"><div><dt>Original outcome</dt><dd>{paperOutcomeLabel(selected.historical_status)}<small>Previously reviewed historical sample</small></dd></div><div><dt>Prospective evaluation</dt><dd>Unstarted · 0 observations<small>No actual account ownership is recorded.</small></dd></div><div><dt>Funding &amp; costs</dt><dd>{selected.id.startsWith('rv_') ? '$100,000 fractional NAV reference · 5 / 10 / 20bp each side; displayed replay uses 5bp.' : '1,000 USDT per account · 10bp fee + 20 / 40bp impact; BTC lot 0.000001, minimum 10 USDT.'}<small>Zero cash yield or borrow; mark and fill assumptions apply.</small></dd></div><div><dt>Controls</dt><dd>{selected.controls.map(paperControlLabel).join(' · ')}</dd></div></dl>
        <details className="hub-details"><summary>Original research status</summary><pre>{JSON.stringify({ historical_status: selected.historical_status, outcome_exposure: selected.outcome_exposure }, null, 2)}</pre></details>
        <details className="hub-details"><summary>Exact tested definition</summary><pre>{JSON.stringify(selected.definition, null, 2)}</pre></details>
      </section>
      <section className="data-section"><header className="section-header"><h2>Future evaluation</h2><span>Inputs absent · unstarted</span></header><dl className="facts"><div><dt>First / final reference</dt><dd>{selected.prospective.first} → {selected.prospective.last}<small>{selected.prospective.sessions ? `${selected.prospective.sessions} planned sessions; implementation review ${selected.prospective.review}.` : `${selected.prospective.decisions} decisions; terminal mark ${selected.prospective.terminalMark}.`}</small></dd></div><div><dt>Inputs</dt><dd>{selected.sourceStatus}</dd></div></dl><details className="hub-details"><summary>Input requirements</summary><ul>{selected.futureInputRequirements.map(text => <li key={text}>{text}</li>)}</ul></details>{selected.id.startsWith('rv_') && <details className="hub-details"><summary>Why November 2?</summary><p className="section-note">{catalog.startRationale.decision_rationale}</p><p className="section-note">{catalog.startRationale.why_original_oct8_not_backdated}</p></details>}</section>
      <section className="data-section"><header className="section-header"><h2>Evidence &amp; limits</h2><span>Hash verified</span></header><ul>{selected.source_clock_limitations.map(text => <li key={text}>{text}</li>)}</ul><div className="hub-trace-controls"><label>Reviewed document<select aria-label="Paper evidence document" value={evidenceId} onChange={e => { setError(''); setEvidence(null); setEvidenceId(e.target.value) }}><option value="">Choose contract or audit</option>{catalog.evidence.map(e => <option key={e.id} value={e.id}>{e.id.replaceAll('-', ' ')}</option>)}</select></label></div>{evidence && <details className="hub-details" open><summary>{evidence.id}</summary><p className="section-note"><code>{evidence.sha256}</code></p><pre>{JSON.stringify(evidence.document, null, 2)}</pre></details>}<details className="hub-details"><summary>Reviewed index fingerprint</summary><p className="section-note"><code>{catalog.reviewedIndexSha256}</code></p></details></section>
    </>}
  </>
}
