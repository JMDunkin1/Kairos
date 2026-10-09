// Synthetic packets exclusively for portfolio-control regression tests. Never packaged.
export const controlStrategies = [
  { id: 'ngas-all-year-beta', name: 'Natural gas', stage: 'paper-runtime', label: 'Alpaca paper runtime' },
  { id: 'rv_xle_brent_residual', name: 'Energy residual rotation', stage: 'exploratory-paper', label: 'Offline paper candidate' },
]
export const controlTime = Date.parse('2026-10-09T15:00:00Z')
export function controlTelemetry(now = controlTime) {
  const at = new Date(now).toISOString(), target = { targetDate: '2026-10-09', gasPosition: 0, indexFraction: 1, cashFraction: 0 }
  return { generatedAt: at, sourceGeneratedAt: at, mode: 'paper', brokerConnected: true, stale: false, staleAfterSeconds: 900,
    account: { equityUsd: 100_000, cashUsd: 100_000, dayPnlPct: 0, trailingDrawdownPct: 0, shortingEnabled: true, status: 'ACTIVE' }, positions: [], openOrders: [],
    marketClock: { isOpen: true, timestamp: at }, execution: { state: 'running', lastInferenceAt: at }, risk: { killSwitchEngaged: false, blockedReasons: [] },
    strategy: { intent: { strategyId: 'ngas-all-year-beta', generatedAt: at, ...target }, inference: { strategyId: 'ngas-all-year-beta', generatedAt: at, validated: true, liveForecastAppliedToTarget: true, target } } }
}
export function controlInput(strategyId = controlStrategies[0].id, weights = { VOO: 1 }, now = controlTime) {
  return { strategyId, version: 'test-only', generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(), weights, reason: 'Synthetic target packet for regression tests.' }
}
export function controlQuotes(now = controlTime, price = 100, quoteAt = now) {
  return { schemaVersion: 1, source: 'alpaca-latest-quotes', recordedAt: new Date(now).toISOString(), quotes: Object.fromEntries(['UNG', 'VOO', 'QQQM'].map(symbol => [symbol, { observedAt: new Date(quoteAt).toISOString(), bid: price - 0.01, ask: price + 0.01, bidSize: 1000, askSize: 1000 }])) }
}
export function expandedControlStrategies(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `test-registration-${i}`, name: `Test registration ${i}`, stage: 'research', label: 'Adapter pending' }))
}
