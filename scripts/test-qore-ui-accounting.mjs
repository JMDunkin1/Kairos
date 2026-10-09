import assert from 'node:assert/strict'
import { freshness, metricAvailability, paperPresentation } from '../src/runtime/paperPresentation.ts'

const now = Date.parse('2026-10-02T07:00:00Z')
const fresh = new Date(now - 30_000).toISOString()
const stale = '2026-10-01T06:59:00Z'
const telemetry = {
  generatedAt: new Date(now).toISOString(), sourceGeneratedAt: fresh, mode: 'paper', brokerConnected: true,
  account: { equityUsd: 110_000, cashUsd: 2000 }, positions: [],
  portfolioHistory: { sourceGeneratedAt: fresh, baseValueUsd: 100_000, points: [
    { timestamp: '2026-10-01T20:00:00Z', equityUsd: 100_000, profitLossUsd: 0 },
    { timestamp: '2026-10-02T06:00:00Z', equityUsd: 110_000, profitLossUsd: 10_000 },
  ] },
  execution: { state: 'running', lastSignalAt: fresh, lastInferenceAt: fresh }, strategy: { intent: null },
}
// A deposit-shaped NAV jump and broker raw P&L cannot establish investment profit.
const deposit = paperPresentation(telemetry, now)
assert.equal(deposit.nav, 110_000)
assert.equal(deposit.navHistory.at(-1).navUsd, 110_000)
for (const key of ['netAccountPnlUsd', 'gasPnlUsd', 'twrPct', 'drawdownPct']) assert.equal(deposit[key], null, key)
// Whole-account basket gains and an open UNG unrealized balance are not gas-period attribution.
const basket = paperPresentation({ ...telemetry, positions: [
  { symbol: 'VOO', marketValueUsd: 50_000, unrealizedPnlUsd: 5000 },
  { symbol: 'QQQM', marketValueUsd: 10_000, unrealizedPnlUsd: 2000 },
  { symbol: 'UNG', marketValueUsd: -10_000, unrealizedPnlUsd: 1000 },
] }, now)
assert.equal(basket.gasPnlUsd, null)
assert.equal(basket.netAccountPnlUsd, null)
assert.equal(basket.gasExposurePct, 10_000 / 110_000 * 100)
assert.equal(basket.basketExposurePct, 60_000 / 110_000 * 100)
// No ledger means fee-adjusted metrics are withheld, not charged a second time.
assert.ok(metricAvailability.some(metric => metric.name === 'Fees / income'))
assert.equal(paperPresentation({ ...telemetry, feesUsd: 100, netPnlUsd: 10_000 }, now).netAccountPnlUsd, null)
assert.equal(paperPresentation(null, now).nav, null)
assert.equal(paperPresentation(null, now).gasExposurePct, null)
assert.equal(paperPresentation({ ...telemetry, positions: undefined }, now).gasExposurePct, null)
assert.equal(paperPresentation({ ...telemetry, sourceGeneratedAt: null }, now).nav, null)
assert.deepEqual(paperPresentation({ ...telemetry, portfolioHistory: null }, now).navHistory, [])
assert.deepEqual(paperPresentation({ ...telemetry, portfolioHistory: { ...telemetry.portfolioHistory, sourceGeneratedAt: null } }, now).navHistory, [])
// A fresh feed heartbeat never hides a stale source or stale signal.
const oldBroker = paperPresentation({ ...telemetry, sourceGeneratedAt: stale }, now)
assert.equal(oldBroker.sourceStatus, 'Stale')
assert.equal(oldBroker.accountStale, true)
assert.notEqual(oldBroker.executionLabel, 'Running')
const oldSignal = paperPresentation({ ...telemetry, execution: { ...telemetry.execution, lastSignalAt: stale, lastInferenceAt: stale } }, now)
assert.equal(oldSignal.signalStatus, 'Stale')
const hourOld = new Date(now - 3_600_000).toISOString()
const blockedSignal = paperPresentation({ ...telemetry, execution: { state: 'blocked', lastSignalAt: hourOld, lastInferenceAt: hourOld } }, now)
assert.equal(blockedSignal.signalStatus, 'Stale')
assert.equal(blockedSignal.inferenceStatus, 'Stale')
assert.equal(blockedSignal.executionLabel, 'Blocked')
assert.equal(paperPresentation({ ...telemetry, staleAfterSeconds: 10 }, now).sourceStatus, 'Stale')
assert.equal(oldSignal.executionLabel, 'Signal unavailable or stale')
assert.equal(paperPresentation({ ...telemetry, stale: true }, now).sourceStatus, 'Stale')
assert.equal(freshness('invalid', now), 'Unavailable')
assert.equal(freshness('2026-10-03T00:00:00Z', now), 'Future timestamp')
assert.equal(paperPresentation({ ...telemetry, sourceGeneratedAt: '2026-10-03T00:00:00Z' }, now).nav, null)
console.log('PASS: Kairos UI accounting availability, deposits, sleeve isolation, fees, missing history and source/signal freshness')
