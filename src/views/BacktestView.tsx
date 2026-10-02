import { useState } from 'react'
import { BacktestValidation, MonteCarloChart, OvernightRiskHeatmap } from '../components/BacktestValidation'
import { MetricRail } from '../components/MetricRail'
import { PerformanceChart } from '../components/PerformanceChart'
import { SourceDialog } from '../components/SourceDialog'
import { allYearBacktest, backtestPoints, sleeveStats, weatherQuality, type BacktestMetrics, type BacktestPoint } from '../data/allYearBacktest'
import provenance from '../data/uiProvenance.json'
import type { SmoothChartRange, SmoothChartSeries } from '../components/SmoothZoomChart'
import { classForSigned, formatNumber, signedPercent } from '../utils/format'

type Section = 'Performance' | 'Research diagnostics' | 'Run details'
const summary = allYearBacktest
const selection = summary.validation.selectionMetrics
const execution = summary.contract.execution
const cost = execution.scenarios[execution.scenarioId]
const returnSeries: SmoothChartSeries<BacktestPoint>[] = [
  { axis: 'left', color: '#1767a6', dataKey: 'equityPct', id: 'strategy', label: 'Strategy · net simulated return', mode: 'line', strokeWidth: 2.1, valueFormatter: signedPercent },
  { axis: 'left', color: '#8795a5', dataKey: 'benchmarkPct', id: 'benchmark', label: '80/20 VOO/QQQM · gross benchmark', mode: 'line', strokeWidth: 1.5, valueFormatter: signedPercent },
]
const drawdownSeries: SmoothChartSeries<BacktestPoint>[] = [{ axis: 'left', color: '#a86255', dataKey: 'drawdownPct', id: 'drawdown', label: 'Strategy drawdown', mode: 'line', valueFormatter: signedPercent }]

function SplitRow({ label, metrics, benchmark, difference }: { label: string; metrics: BacktestMetrics; benchmark: BacktestMetrics; difference: number }) {
  return <tr><th scope="row">{label}</th><td>{metrics.firstEntry} – {metrics.lastExit}</td><td>{signedPercent(metrics.totalReturnPct)}</td><td>{signedPercent(benchmark.totalReturnPct)}</td><td>{signedPercent(difference)}<small>percentage points</small></td><td>{signedPercent(metrics.maxDrawdownPct)}</td><td>{formatNumber(metrics.tradeCount, 0)}<small>active target rows</small></td></tr>
}

export function BacktestView() {
  const [section, setSection] = useState<Section>('Performance')
  const [period, setPeriod] = useState('selection')
  const [showPosition, setShowPosition] = useState(false)
  const [chartRange, setChartRange] = useState<SmoothChartRange | undefined>()
  const points = period === 'full' ? backtestPoints : backtestPoints.filter(point => point.date <= selection.throughDate)
  const range = `${points[0]?.date ?? 'Unavailable'} – ${points.at(-1)?.date ?? 'Unavailable'}`
  const details = <>
    <dl className="facts"><div><dt>Run</dt><dd>{summary.selected.candidateId}</dd></div><div><dt>Artifact generated</dt><dd>{summary.generatedAt}</dd></div><div><dt>Selection period</dt><dd>{selection.strategy.all.firstEntry} – {selection.throughDate}</dd></div><div><dt>Train ends</dt><dd>{summary.contract.trainEnd}</dd></div><div><dt>Validation selection ends</dt><dd>{summary.contract.selectionEnd}</dd></div><div><dt>Later observations</dt><dd>Report-only · excluded from selection</dd></div><div><dt>Signal / execution</dt><dd>{summary.contract.researchInstruments.summer.signalSymbol} research signal / {summary.contract.executionInstrument.gasSymbol} ETF execution</dd></div><div><dt>Deployment</dt><dd>{formatNumber(execution.deploymentFraction * 100, 0)}% deployable / {formatNumber((1 - execution.deploymentFraction) * 100, 0)}% cash buffer</dd></div><div><dt>Fallback target weights</dt><dd>{Object.entries(execution.indexWeights).map(([symbol, weight]) => `${symbol} ${formatNumber(weight * 100, 0)}%`).join(' / ')}</dd></div><div><dt>Benchmark</dt><dd>{execution.benchmarkConvention}</dd></div><div><dt>One-way research cost</dt><dd>{Object.entries(cost.oneWayBps).map(([symbol, bps]) => `${symbol} ${bps} bps`).join(' / ')}</dd></div><div><dt>Annual borrow allowance</dt><dd>{cost.annualBorrowRatePct}% · research assumption</dd></div><div><dt>Price convention</dt><dd>{execution.priceConvention}</dd></div><div><dt>Turnover / fees</dt><dd>{execution.turnoverConvention}. All-in research cost deducted once.</dd></div></dl>
    <h3>Recorded provenance</h3><dl className="facts hash-facts"><div><dt>Code baseline</dt><dd>{provenance.sourceRevision}<small>Local source snapshot; historical run/code binding is not independently established by this UI.</small></dd></div><div><dt>Execution contract</dt><dd>{execution.contractId}<small>{execution.contractDigest}</small></dd></div><div><dt>Curve data SHA-256</dt><dd>{summary.data.displayCurveArtifact.contentDigestSha256}<small>Verified by existing artifact adapter · {summary.data.displayCurveArtifact.rowCount} rows</small></dd></div>{Object.entries(provenance.hashes).map(([file, hash]) => <div key={file}><dt>{file}</dt><dd>{hash}<small>Source snapshot SHA-256</small></dd></div>)}</dl>
    <p className="section-note">Sharpe and trade win rate are withheld here: the display contract does not identify a risk-free series or a flat-to-flat trade grouping. Artifact gates describe a historical snapshot, not current execution readiness.</p>
  </>
  return <main className="view" id="backtest-view">
    <div className="breadcrumb">QORE / Research / Backtests</div>
    <header className="view-header"><div className="view-heading"><h1>Backtests</h1><div className="header-meta"><span className="mode-label">HISTORICAL SIMULATION</span><span>{summary.strategyId}</span></div></div><SourceDialog title="Backtest run & calculations">{details}</SourceDialog></header>
    <div className="control-strip"><label><span>Research run</span><select aria-label="Research run" value={summary.selected.candidateId} onChange={() => {}}><option value={summary.selected.candidateId}>All-year beta · {summary.generatedAt.slice(0, 10)}</option></select></label><label><span>Period</span><select aria-label="Backtest period" value={period} onChange={event => { setPeriod(event.target.value); setChartRange(undefined) }}><option value="selection">Train + validation</option><option value="full">Full calendar · report-only</option></select></label><div><span>Scenario</span><strong>{execution.scenarioId} · net of research costs</strong></div><div><span>Through</span><strong>{points.at(-1)?.date ?? 'Unavailable'}</strong></div></div>
    <nav className="section-tabs" aria-label="Backtest sections">{(['Performance', 'Research diagnostics', 'Run details'] as Section[]).map(item => <button type="button" key={item} className={section === item ? 'active' : ''} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
    {section === 'Performance' && <>
      {period === 'full' && <div className="notice warning"><strong>Report-only calendar</strong><span>Rows after {selection.throughDate} do not enter selection. Summary statistics below retain the train + validation window.</span></div>}
      <MetricRail ariaLabel="Train and validation simulation metrics" metrics={[
        { label: 'Strategy return', value: signedPercent(selection.strategy.all.totalReturnPct), detail: `Net simulated · through ${selection.throughDate}` },
        { label: 'Benchmark return', value: signedPercent(selection.index.all.totalReturnPct), detail: '80/20 VOO/QQQM · gross' },
        { label: 'Return difference', value: `${formatNumber(selection.splitEdges.all)} pp`, detail: 'Strategy − benchmark · not risk-adjusted' },
        { label: 'Maximum drawdown', value: signedPercent(selection.strategy.all.maxDrawdownPct), detail: 'Simulated strategy wealth' },
      ]} />
      <PerformanceChart key={`return-${period}`} range={chartRange} onRangeChange={setChartRange} title="Cumulative performance" meta={`${range} · ${points.length} sessions`} data={points} series={[...returnSeries, { axis: 'right', color: '#9aaab4', dataKey: 'position', id: 'position', label: 'Gas target', mode: 'step', strokeOpacity: 0.3, visible: showPosition, valueFormatter: value => `${formatNumber(value)}×` }]} empty="Versioned simulation curve unavailable" actions={<button type="button" className="text-button" aria-pressed={showPosition} onClick={() => setShowPosition(current => !current)}>{showPosition ? 'Hide gas target' : 'Show gas target'}</button>} />
      <div className="research-drawdown"><PerformanceChart key={`dd-${period}`} range={chartRange} onRangeChange={setChartRange} title="Drawdown" meta={range} data={points} series={drawdownSeries} empty="Drawdown unavailable" /></div>
      <section className="data-section"><header className="section-header"><h2>Time period performance</h2><span className="plain-status">Historical simulation</span></header><div className="table-scroll" tabIndex={0} aria-label="Train and validation performance"><table><thead><tr><th>Split</th><th>Period</th><th>Strategy net</th><th>Benchmark gross</th><th>Difference</th><th>Max drawdown</th><th>Active rows</th></tr></thead><tbody><SplitRow label="Train" metrics={selection.strategy.train} benchmark={selection.index.train} difference={selection.splitEdges.train} /><SplitRow label="Validation" metrics={selection.strategy.validation} benchmark={selection.index.validation} difference={selection.splitEdges.validation} /><SplitRow label="Train + validation" metrics={selection.strategy.all} benchmark={selection.index.all} difference={selection.splitEdges.all} /></tbody></table></div></section>
    </>}
    {section === 'Research diagnostics' && <>
      <div className="notice"><strong>Recorded research diagnostics</strong><span>Artifact generated {summary.generatedAt.slice(0, 10)}. Full-calendar diagnostics are descriptive; runtime gates are in Account → Data &amp; execution.</span></div>
      <BacktestValidation /><section className="backtest-visual-stack"><MonteCarloChart /><OvernightRiskHeatmap /></section>
      <section className="data-section"><header className="section-header"><h2>Full-calendar seasonal attribution</h2><span className="plain-status">Report-only · target-day grouping</span></header><div className="table-scroll" tabIndex={0} aria-label="Research seasonal attribution"><table><thead><tr><th>Thesis</th><th>Target rows</th><th>Causal compound</th><th>Positive days</th><th>Average / day</th></tr></thead><tbody>{sleeveStats.map(sleeve => <tr key={sleeve.id}><th scope="row">{sleeve.label}</th><td>{sleeve.rowCount}</td><td className={classForSigned(sleeve.totalReturnPct)}>{signedPercent(sleeve.totalReturnPct)}</td><td>{formatNumber(sleeve.winRatePct, 1)}%</td><td>{signedPercent(sleeve.averageReturnPct, 3)}</td></tr>)}</tbody></table></div></section>
      <details className="disclosure-section"><summary>Weather diagnostics · full calendar, report-only</summary><dl className="facts"><div><dt>Directional accuracy</dt><dd>{formatNumber(weatherQuality.directionalAccuracyPct, 1)}%</dd></div><div><dt>MAE / RMSE</dt><dd>{formatNumber(weatherQuality.maeF)}°F / {formatNumber(weatherQuality.rmseF)}°F</dd></div><div><dt>Bias / R²</dt><dd>{formatNumber(weatherQuality.biasF)}°F / {formatNumber(weatherQuality.r2, 3)}</dd></div><div><dt>Cold ≤ {weatherQuality.coldEventThresholdF}°F recall</dt><dd>{formatNumber(weatherQuality.coldRecallPct, 1)}%</dd></div><div><dt>Sources / forecasts</dt><dd>{weatherQuality.sourceCount} / {weatherQuality.rowCount}</dd></div></dl></details>
      <details className="disclosure-section"><summary>Later / full-calendar performance · report-only</summary><div className="table-scroll" tabIndex={0} aria-label="Public report-only performance"><table><thead><tr><th>Split</th><th>Period</th><th>Strategy net</th><th>Benchmark gross</th><th>Difference</th><th>Max drawdown</th><th>Active rows</th></tr></thead><tbody><SplitRow label="Expanded validation" metrics={summary.selected.validationMetrics} benchmark={summary.selected.indexMetrics.validation} difference={summary.selected.splitEdges.validation} /><SplitRow label="Public retrospective holdout" metrics={summary.selected.holdoutMetrics} benchmark={summary.selected.indexMetrics.holdout} difference={summary.selected.splitEdges.holdout} /><SplitRow label="Full calendar" metrics={summary.selected.allMetrics} benchmark={summary.selected.indexMetrics.all} difference={summary.selected.splitEdges.all} /></tbody></table></div></details>
    </>}
    {section === 'Run details' && <section className="data-section"><header className="section-header"><h2>Run contract &amp; provenance</h2><span className="plain-status">Versioned artifact</span></header>{details}{summary.data.historicalCoverageWarning && <p className="notice warning">{summary.data.historicalCoverageWarning}</p>}</section>}
    <footer className="view-footer"><span>Versioned research artifacts · no paper account returns</span><span>Return differences in percentage points</span></footer>
  </main>
}
