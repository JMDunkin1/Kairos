import { useEffect, useState } from 'react'
import { PerformanceChart } from '../components/PerformanceChart'
import { formatCurrency as money, formatNumber as number, signedPercent as percent } from '../utils/format'

type Point = { date: string; equity: number; returnPct: number; drawdownPct: number; cash: number; fees: number; holdings: Record<string, number>; signalDate: string; traded: boolean; terminal: boolean; observationTargets: Record<string, number>; executionTargets: Record<string, number> }
type Definition = { id: string; name: string; classification: string; description: string; baseline: boolean; capital: number; points: Point[]; metrics: { returnPct: number; cagrPct: number; drawdownPct: number; fees: number; exposure: number; sharpe: number } }
type Replay = { status: string; first: string; last: string; sessions: number; independentMechanisms: number; auditUtc: string; approvalUtc: string; definitions: Definition[]; hashes: Record<string, string>; limitations: string[] }

export function HistoricalReplay({ view }: { view: 'performance' | 'details' }) {
  const [replay, setReplay] = useState<Replay | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('lev_core_relative_leverage_sleeves_v3')
  const [date, setDate] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/hub/replay', { signal: controller.signal }).then(async response => {
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? 'Approved historical replay unavailable.')
      if (!controller.signal.aborted) setReplay(value)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  if (error) return <div className="notice warning" role="alert"><strong>Historical replay unavailable</strong><span>{error}</span></div>
  if (!replay) return <div className="notice">Checking the approved historical replay…</div>
  const selected = replay.definitions.find(d => d.id === selectedId) ?? replay.definitions[0]
  const point = selected.points.find(p => p.date === date) ?? selected.points.at(-1)!
  const chart = replay.definitions[0].points.map((p, chartIndex) => ({ chartIndex, date: p.date, candidate: p.returnPct, baseline: replay.definitions[1].points[chartIndex].returnPct }))
  return <>
    {view === 'performance' && <>
    <p className="hub-caption">Historical simulation · net of costs · static exposure baseline</p>
    <PerformanceChart title="Strategy vs. exposure baseline" meta={`${replay.first} — ${replay.last}`} data={chart} empty="No approved observations." series={[{ axis: 'left', color: '#1767a6', dataKey: 'candidate', id: 'candidate', label: 'Relative leverage', valueFormatter: percent }, { axis: 'left', color: '#8795a5', dataKey: 'baseline', id: 'baseline', label: 'Static exposure baseline', valueFormatter: percent }]} />
    <section className="data-section"><header className="section-header"><h2>Candidate and exposure baseline</h2><span>Frozen $100,000 fractional NAV simulation</span></header>
      <div className="table-scroll" role="region" aria-label="Historical comparison" tabIndex={0}><table><thead><tr><th>Definition / role</th><th>Net return</th><th>Historical CAGR</th><th>Maximum drawdown</th><th>Costs</th><th>Mean contract exposure¹</th></tr></thead><tbody>{replay.definitions.map(d => <tr key={d.id}><th>{d.name}<small>{d.baseline ? 'Exposure baseline · no timing edge' : 'Research candidate · high risk'}</small></th><td>{percent(d.metrics.returnPct)}</td><td>{percent(d.metrics.cagrPct)}</td><td>{percent(d.metrics.drawdownPct)}</td><td>{money(d.metrics.fees)}</td><td>{number(d.metrics.exposure, 2)}×</td></tr>)}</tbody></table></div>
      <p className="section-note">The candidate returned less than the static baseline, with a smaller historical drawdown. ¹ Daily leverage contract proxy, not realized beta. CAGR is an annualized description of this historical window.</p>
    </section>
    </>}
    {view === 'details' && <>
    <p className="hub-caption">Audited historical export · {replay.sessions} sessions · {replay.independentMechanisms} independent mechanism</p>
    <section className="data-section"><header className="section-header"><h2>Frozen definition and session trace</h2><span>Completed monthly signal → next observed NAV session</span></header>
      <div className="hub-trace-controls"><label>Historical definition<select aria-label="Historical definition" value={selected.id} onChange={e => setSelectedId(e.target.value)}>{replay.definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Released session<select aria-label="Released session" value={point.date} onChange={e => setDate(e.target.value)}>{selected.points.map(p => <option key={p.date}>{p.date}</option>)}</select></label></div>
      <p className="section-note">{selected.description}</p><dl className="facts"><div><dt>Completed signal / observed session</dt><dd>{point.signalDate} → {point.date}<small>{point.terminal ? 'Endpoint liquidation; scheduled target ignored, ending inventory zero.' : point.traded ? 'Frozen monthly allocation executed after the prior holdings earned this session’s NAV movement.' : 'Prior holdings retained; no allocation trade.'}</small></dd></div><div><dt>Ending wealth / cash / session fee</dt><dd>{money(point.equity)} / {money(point.cash)} / {money(point.fees)}<small>Initial capital {money(selected.capital)} · drawdown {percent(point.drawdownPct)}</small></dd></div></dl>
      <div className="table-scroll" role="region" aria-label="Released session allocation" tabIndex={0}><table><thead><tr><th>Fund</th><th>Observed target²</th><th>{point.terminal ? 'Scheduled target ignored' : 'Prior completed target'}</th><th>Ending holding value</th></tr></thead><tbody>{Object.entries(point.holdings).map(([symbol, dollars]) => <tr key={symbol}><th>{symbol}</th><td>{percent(point.observationTargets[symbol] * 100)}</td><td>{percent(point.executionTargets[symbol] * 100)}</td><td>{money(dollars)}</td></tr>)}</tbody></table></div>
      <p className="section-note">² An observed target is informational until a completed monthly signal executes at the next audited NAV session. NAV proxies do not establish exchange fills.</p>
    </section>
    <section className="data-section"><header className="section-header"><h2>Evidence and limitations</h2><span>Independent export audit {replay.auditUtc.slice(0, 10)}</span></header><ul>{replay.limitations.map(text => <li key={text}>{text}</li>)}</ul><details className="hub-details"><summary>Approved export hashes</summary><dl className="facts">{Object.entries(replay.hashes).map(([name, hash]) => <div key={name}><dt>{name}</dt><dd><code>{hash}</code></dd></div>)}</dl></details></section>
    </>}
  </>
}
