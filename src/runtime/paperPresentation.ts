import type { LiveTelemetry } from './types'

export const calculationVersion = 'qore-ui-recorded-v1'

export const metricAvailability = [
  { name: 'Net account P&L', reason: 'External cash flows and opening valuation are not supplied.', formula: 'Closing NAV − opening NAV − net external flows' },
  { name: 'Gas-only P&L', reason: 'Tagged fills, opening positions, income and allocated fees are not supplied.', formula: 'Realized P&L + change in unrealized P&L + income − costs' },
  { name: 'Account return (TWR)', reason: 'Valuations at external cash flows are not supplied.', formula: 'Compound subperiod returns between cash flows' },
  { name: 'Drawdown', reason: 'A flow-adjusted wealth series is not supplied.', formula: 'Flow-adjusted wealth / previous peak − 1' },
  { name: 'Volatility / Sharpe', reason: 'Consistent daily flow-adjusted returns and a named risk-free series are not supplied.', formula: 'Requires adequate daily observations and a declared annualization basis' },
  { name: 'Win rate / expectancy', reason: 'Complete flat-to-flat trades and fee allocation are not supplied.', formula: 'Requires a fixed trade grouping and a disclosed closed-trade count' },
  { name: 'Fees / income', reason: 'An activity ledger and fee allocation are not supplied.', formula: 'Deduct each fee once; distinguish included and separately allocated costs' },
] as const

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function freshness(timestamp: string | null | undefined, now: number, capSeconds = 120) {
  if (!timestamp) return 'Unavailable'
  const time = Date.parse(timestamp)
  if (!Number.isFinite(time)) return 'Unavailable'
  if (time > now + 30_000) return 'Future timestamp'
  return now - time > capSeconds * 1000 ? 'Stale' : 'Fresh'
}

export function paperPresentation(telemetry: LiveTelemetry | null, now = Date.now()) {
  // The dashboard's generic source-freshness policy defaults to 15 minutes.
  // Use its declared cap for broker, signal and inference timestamps alike.
  const declaredCap = finite(telemetry?.staleAfterSeconds)
  const sourceCapSeconds = declaredCap !== null && declaredCap > 0 ? declaredCap : 900
  const timestampStatus = freshness(telemetry?.sourceGeneratedAt, now, sourceCapSeconds)
  const sourceStatus = telemetry?.stale && timestampStatus === 'Fresh' ? 'Stale' : timestampStatus
  const hasAccount = Boolean(telemetry?.account && telemetry.sourceGeneratedAt && sourceStatus !== 'Unavailable' && sourceStatus !== 'Future timestamp')
  const holdingsKnown = hasAccount && Array.isArray(telemetry?.positions)
  const positions = holdingsKnown ? telemetry!.positions : []
  const nav = hasAccount ? finite(telemetry?.account?.equityUsd) : null
  const cash = hasAccount ? finite(telemetry?.account?.cashUsd) : null
  const exposure = (symbols: string[]) => {
    if (!holdingsKnown || nav === null || nav <= 0) return null
    const selected = positions.filter(position => symbols.includes(position.symbol.toUpperCase()))
    const values = selected.map(position => finite(position.marketValueUsd))
    if (values.some(value => value === null)) return null
    return values.reduce<number>((sum, value) => sum + Math.abs(value ?? 0), 0) / nav * 100
  }
  const history = telemetry?.portfolioHistory
  const historyStatus = freshness(history?.sourceGeneratedAt, now, sourceCapSeconds)
  // Recorded NAV is not an investment return: deposits may change this series.
  const navHistory = historyStatus === 'Unavailable' || historyStatus === 'Future timestamp'
    ? []
    : (history?.points ?? []).filter(point => Number.isFinite(Date.parse(point.timestamp)) && finite(point.equityUsd) !== null && Date.parse(point.timestamp) <= now + 30_000)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .map((point, chartIndex) => ({ chartIndex, date: point.timestamp.slice(0, 10), navUsd: point.equityUsd }))
  const signalAt = telemetry?.execution?.lastSignalAt ?? telemetry?.strategy?.intent?.generatedAt
  const signalStatus = freshness(signalAt, now, sourceCapSeconds)
  const inferenceStatus = freshness(telemetry?.execution?.lastInferenceAt, now, sourceCapSeconds)
  const currentSignal = signalStatus === 'Fresh' && inferenceStatus === 'Fresh'
  return {
    hasAccount, holdingsKnown, nav, cash, positions, navHistory, historyStatus, sourceStatus, signalStatus, inferenceStatus, sourceCapSeconds,
    accountStale: Boolean(telemetry?.stale) || sourceStatus !== 'Fresh',
    executionLabel: telemetry?.execution?.state === 'blocked' ? 'Blocked' : !currentSignal ? 'Signal unavailable or stale' : sourceStatus !== 'Fresh' || telemetry?.brokerConnected !== true ? 'Broker inputs unavailable or stale' : telemetry?.execution?.state === 'running' ? 'Running' : telemetry?.execution?.state === 'waiting' ? 'Waiting' : 'Unavailable',
    gasExposurePct: exposure(['UNG']), basketExposurePct: exposure(['VOO', 'QQQM']),
    // The current API contains no verified accounting contract. Never infer profit
    // from equity changes, a single UNG holding, or the whole account basket.
    netAccountPnlUsd: null, gasPnlUsd: null, twrPct: null, drawdownPct: null,
  }
}
