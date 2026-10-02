import type { DecisionContext, Decision, StrategyAdapter, StrategyDefinition } from './types.ts'

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
function decide({ asOf, history, definition: d }: DecisionContext): Decision {
  if (d.status === 'paused') return { weights: {}, reason: 'Paused: target cash at the next open.', observedAt: null, status: 'paused' }
  if (d.kind === 'ngas-all-year') return { weights: {}, reason: 'Existing NGAS engine preserved. Approved released target feed is not connected to this simulation.', observedAt: null, status: 'unsupported' }
  const cut = Date.parse(asOf)
  const series = d.instruments.map(id => history.filter(b => b.instrument === id && Date.parse(b.availableAt) <= cut && Date.parse(b.closeAt) <= cut).sort((a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt)).slice(-d.parameters.lookback))
  const observedAt = series.flat().map(b => b.closeAt).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null
  if (series.some(rows => rows.length < d.parameters.lookback)) return { weights: {}, reason: `Warm-up: need ${d.parameters.lookback} completed sessions per leg.`, observedAt, status: 'warming' }
  const [a, b] = series.map(rows => rows.map(row => row.close))
  let signal: number
  let reason: string
  if (d.kind === 'trend') {
    const change = a.at(-1)! / a[0] - 1
    signal = change > d.parameters.threshold ? 1 : 0
    reason = `Completed-session momentum ${(change * 100).toFixed(2)}%; ${signal ? 'long' : 'cash'}.`
  } else if (d.kind === 'reversion') {
    const deviation = a.at(-1)! / mean(a) - 1
    signal = Math.abs(deviation) > d.parameters.threshold ? -Math.sign(deviation) : 0
    reason = `Deviation from mean ${(deviation * 100).toFixed(2)}%; ${signal > 0 ? 'long' : signal < 0 ? 'short' : 'cash'}.`
  } else {
    // Align dates before ratios. Two latest bars from different sessions are not a spread.
    if (series[0].some((row, i) => row.date !== series[1][i].date)) throw new Error('Spread legs have different session calendars.')
    const ratios = a.map((value, i) => value / b[i])
    const deviation = ratios.at(-1)! / mean(ratios) - 1
    signal = Math.abs(deviation) > d.parameters.threshold ? -Math.sign(deviation) : 0
    reason = `Relative price deviation ${(deviation * 100).toFixed(2)}%; ${signal ? 'opposing legs, 50/50 gross' : 'cash'}.`
  }
  const size = signal * d.parameters.exposure
  return { weights: d.kind === 'spread' ? { [d.instruments[0]]: size / 2, [d.instruments[1]]: size ? -size / 2 : 0 } : { [d.instruments[0]]: size || 0 }, reason, observedAt, status: 'ready' }
}

export const adapters: StrategyAdapter[] = (['trend', 'reversion', 'spread', 'ngas-all-year'] as const).map(id => ({ id, version: '1', decide }))
export const defaultDefinitions: StrategyDefinition[] = [
  { id: 'trend-core', name: 'Trend / broad market', kind: 'trend', status: 'research', instruments: ['MKT'], allocation: .4, parameters: { lookback: 12, threshold: .01, exposure: .9 } },
  { id: 'reversion-core', name: 'Mean reversion / broad market', kind: 'reversion', status: 'research', instruments: ['MKT'], allocation: .3, parameters: { lookback: 6, threshold: .008, exposure: .8 } },
  { id: 'relative-value', name: 'Relative value / paired assets', kind: 'spread', status: 'research', instruments: ['MKT', 'ALT'], allocation: .3, parameters: { lookback: 10, threshold: .012, exposure: .8 } },
]
export const ngasDefinition: StrategyDefinition = { id: 'ngas-all-year-beta', name: 'Natural gas / All-Year Beta', kind: 'ngas-all-year', status: 'paused', instruments: ['UNG', 'VOO', 'QQQM'], allocation: 0, parameters: { lookback: 1, threshold: 0, exposure: 1 } }
export const defaultAssumptions = { feeBps: 2, slippageBps: 3, borrowAprPct: 3, lagSessions: 1, maxAgeDays: 5 }
