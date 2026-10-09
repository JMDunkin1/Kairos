import { useEffect, useState } from 'react'
import { PerformanceChart } from '../components/PerformanceChart'
import { formatNumber as number } from '../utils/format'

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

export function PaperCandidates({ candidateId }: { candidateId: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const selectedId = candidateId
  const [replay, setReplay] = useState<Replay | null>(null)
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
    read<Replay>(`/api/hub/paper-candidates/${encodeURIComponent(selectedId)}/replay${caseId ? `?case=${encodeURIComponent(caseId)}` : ''}`, controller.signal).then(value => { if (!controller.signal.aborted) { setReplay(value); setPosition(0); setError('') } }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
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
  const selected = catalog.candidates.find(c => c.id === selectedId)!
  const currentReplay = replay?.id === selectedId ? replay : null
  const frame = currentReplay?.frames[position]
  return <>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <section className="data-section"><header className="section-header"><h2>{selected.name}</h2><span>Exploratory paper evaluation</span></header><p>{selected.definition.unchanged_original_rule?.description ?? 'Use the immediately preceding complete UTC month’s last BTC close divided by its first open. A ratio below one targets USDT cash; otherwise retain BTC. Execute at the third UTC day’s open under the frozen lot, cost and capacity rules.'}</p><dl className="facts"><div><dt>Original evidence</dt><dd>{selected.historical_status.replaceAll('_', ' ')}<small>{selected.outcome_exposure.replaceAll('_', ' ')}</small></dd></div><div><dt>Actual current ownership / prospective observations</dt><dd>Unavailable / 0<small>Actual owned state is null. Historical modeled balances below do not populate an account.</small></dd></div><div><dt>Costs and funding</dt><dd>{selected.id.startsWith('rv_') ? '$100,000 fractional total-NAV reference units · 5 / 10 / 20bp each side; primary 5bp playback only.' : '1,000 USDT per whole account · 10bp fee + 20 / 40bp impact; BTC lot 0.000001 and minimum 10 USDT.'}<small>Zero cash yield or borrow; disclosed mark/fill assumptions remain.</small></dd></div><div><dt>Comparison controls</dt><dd>{selected.controls.join(' · ')}</dd></div></dl><details className="hub-details"><summary>Exact compact tested definition</summary><pre>{JSON.stringify(selected.definition, null, 2)}</pre></details></section>
    <section className="data-section"><header className="section-header"><h2>Play retained familiar output</h2><span>{selected.replayStatus}</span></header><p className="section-note">Playback reads completed audited results. It creates no trial and supplies no new validation.</p>{currentReplay && frame ? <>
      <div className="hub-trace-controls"><label>Retained account / costs<select aria-label="Paper playback account" value={currentReplay.selectedCase} onChange={e => { setCaseId(e.target.value); setPlaying(false); setReplay(null) }}>{currentReplay.cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Retained date<select aria-label="Paper playback date" value={position} onChange={e => { setPlaying(false); setPosition(Number(e.target.value)) }}>{currentReplay.frames.map((f, i) => <option key={f.date} value={i}>{f.date}</option>)}</select></label></div>
      <div className="hub-panel-action"><button className="text-button" onClick={() => { setPlaying(false); setPosition(0) }}>Restart playback</button><button className="text-button primary" disabled={position === currentReplay.frames.length - 1 && !playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play saved replay'}</button><button className="text-button" disabled={position === currentReplay.frames.length - 1} onClick={() => { setPlaying(false); setPosition(Math.min(position + 1, currentReplay.frames.length - 1)) }}>Next retained observation</button></div>
      <PerformanceChart title="Familiar modeled wealth" meta={`${frame.unit} · saved output · no actual account`} data={currentReplay.frames.slice(0, position + 1).map((f, chartIndex) => ({ chartIndex, date: f.date, wealth: f.wealth }))} empty="No retained observations." series={[{ axis: 'left', color: '#1767a6', dataKey: 'wealth', id: 'wealth', label: 'Modeled reference wealth', valueFormatter: value => number(value, 2) }]} />
      <dl className="facts"><div><dt>Historical mark / event</dt><dd>{frame.date} · {frame.event}<small>{frame.terminal ? 'Audited endpoint liquidation; owned reference units zero.' : 'Retained reference state; no observed exchange fill.'}</small></dd></div><div><dt>Modeled wealth / spendable cash</dt><dd>{number(frame.wealth, 8)} / {number(frame.cash, 8)} {frame.unit}<small>{frame.feesCumulative ? 'Cumulative fee' : 'Session fee'} {number(frame.fees, 8)}{frame.impact !== undefined ? ` · cumulative impact ${number(frame.impact, 8)}` : ''}</small></dd></div><div><dt>Modeled owned units</dt><dd>{Object.entries(frame.units).map(([symbol, units]) => `${symbol} ${units}`).join(' · ')}</dd></div><div><dt>Decision clock</dt><dd>{frame.decisionKnownAt ?? 'Daily retained mark; exact monthly rule in compact definition'}<small>Historical declared clocks remain uncertified point-in-time observations.</small></dd></div></dl><details className="hub-details"><summary>Saved observation detail</summary><pre>{JSON.stringify(frame, null, 2)}</pre></details><p className="section-note">{currentReplay.note}</p>
    </> : <p role="status">Checking saved replay…</p>}</section>
    <section className="data-section"><header className="section-header"><h2>Registered future window</h2><span>Inputs absent · unstarted</span></header><dl className="facts"><div><dt>First / final decision or reference</dt><dd>{selected.prospective.first} → {selected.prospective.last}<small>{selected.prospective.sessions ? `${selected.prospective.sessions} planned sessions; implementation-only review ${selected.prospective.review}.` : `${selected.prospective.decisions} scheduled decisions; terminal inventory mark ${selected.prospective.terminalMark}.`}</small></dd></div><div><dt>Required inputs</dt><dd>{selected.sourceStatus}</dd></div></dl><ul>{selected.futureInputRequirements.map(text => <li key={text}>{text}</li>)}</ul><button className="text-button" disabled title="No qualified prospective packet has been supplied or root released">Future paper launch unavailable</button>{selected.id.startsWith('rv_') && <details className="hub-details"><summary>Why November 2?</summary><p>{catalog.startRationale.decision_rationale}</p><p>{catalog.startRationale.why_original_oct8_not_backdated}</p><p>Browsing and familiar playback work now. The registered date stays fixed; missing inputs leave it blocked.</p></details>}</section>
    <section className="data-section"><header className="section-header"><h2>Evidence and limits</h2><span>Hash checked · read-only</span></header><ul>{selected.source_clock_limitations.map(text => <li key={text}>{text}</li>)}</ul><label>Reviewed document<select aria-label="Paper evidence document" value={evidenceId} onChange={e => { setError(''); setEvidence(null); setEvidenceId(e.target.value) }}><option value="">Choose source contract or audit</option>{catalog.evidence.map(e => <option key={e.id} value={e.id}>{e.id.replaceAll('-', ' ')}</option>)}</select></label>{evidence && <details className="hub-details" open><summary>{evidence.id} · sanitized provenance view</summary><p><code>{evidence.sha256}</code></p><pre>{JSON.stringify(evidence.document, null, 2)}</pre></details>}<p className="section-note">Reviewed index SHA-256 <code>{catalog.reviewedIndexSha256}</code>. Local provenance paths are withheld from browser responses; original source bytes remain in the reviewed private bundle. No adapter or account is executed.</p></section>
  </>
}
