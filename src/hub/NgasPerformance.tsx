import { PerformanceChart } from '../components/PerformanceChart'
import { MetricRail } from '../components/MetricRail'
import { allYearBacktest, backtestPoints } from '../data/allYearBacktest'
import { formatNumber, signedPercent } from '../utils/format'

export function NgasPerformance() {
  const selection = allYearBacktest.validation.selectionMetrics
  const points = backtestPoints.filter(point => point.date <= selection.throughDate)
  return <>
    <p className="hub-caption">Historical simulation · train + validation · net strategy vs. gross benchmark</p>
    <PerformanceChart title="Strategy vs. market" meta={`${points[0]?.date ?? 'Unavailable'} — ${selection.throughDate}`} data={points} empty="Historical curve unavailable." series={[
      { axis: 'left', color: '#1767a6', dataKey: 'equityPct', id: 'strategy', label: 'Natural gas · net', valueFormatter: signedPercent },
      { axis: 'left', color: '#8795a5', dataKey: 'benchmarkPct', id: 'benchmark', label: '80/20 VOO/QQQM · gross', valueFormatter: signedPercent },
    ]} actions={<a className="text-button" href="/ngas.html#backtest">Full backtest →</a>} />
    <MetricRail ariaLabel="Historical train and validation metrics" metrics={[
      { label: 'Strategy return', value: signedPercent(selection.strategy.all.totalReturnPct), detail: 'Net simulated' },
      { label: 'Market return', value: signedPercent(selection.index.all.totalReturnPct), detail: '80/20 VOO/QQQM · gross' },
      { label: 'Difference', value: `${formatNumber(selection.splitEdges.all)} pp`, detail: 'Not risk-adjusted' },
      { label: 'Max drawdown', value: signedPercent(selection.strategy.all.maxDrawdownPct), detail: 'Simulated strategy wealth' },
    ]} />
    <details className="hub-details"><summary>Drawdown</summary><div className="research-drawdown"><PerformanceChart title="Strategy drawdown" data={points} empty="Drawdown unavailable." series={[{ axis: 'left', color: '#a86255', dataKey: 'drawdownPct', id: 'drawdown', label: 'Drawdown', valueFormatter: signedPercent }]} /></div></details>
  </>
}
