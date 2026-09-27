#!/usr/bin/env node
import assert from 'node:assert/strict'
import { inferAllYearTarget } from './lib/qore-live-all-year-inference.mjs'
import { loadNoSummerReversionEngine, causalSimplificationMarketDays } from './lib/qore-simplification-replay.mjs'

const { engine } = await loadNoSummerReversionEngine()
const dates = ['2026-07-24', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']
const prices = dates.map((date, i) => ({ date, gasClose: [10, 10.1, 10.2, 10.5, 10.8, 10.9][i] }))
const forecastRows = ['gfs', 'gefs-mean'].map((sourceId) => ({
  sourceId, sourceFamily: sourceId === 'gfs' ? 'gfs' : 'gefs', sourceGroup: 'ncep',
  issueDate: '2026-07-24', targetDate: '2026-07-31', leadDays: 7,
  weightedAnomalyF: 10, coolingDemandAnomalyF: 10, heatingDemandAnomalyF: 0,
  warmCoveragePct: 1, warmExtremeCount: 2, coldCoveragePct: 0, coldExtremeCount: 0, sampledWeight: 1.06,
}))
const storageRows = [{ date: '2026-07-17', storageBcf: 3000 }]
for (const targetDate of dates.slice(1, 4)) {
  const marketDays = causalSimplificationMarketDays({ rows: prices, targetDate })
  const input = { forecastRows, storageRows, marketDays, targetDate }
  const active = inferAllYearTarget(input), ablated = engine.inferAllYearTarget(input)
  assert.equal(active.gasPosition, 0.35)
  assert.deepEqual(ablated, active, `Long entry and scheduling must not change on ${targetDate}`)
}
const targetDate = '2026-07-30'
const marketDays = causalSimplificationMarketDays({ rows: prices, targetDate })
const input = { forecastRows, storageRows, marketDays, targetDate }
assert.equal(inferAllYearTarget(input).gasPosition, -0.5)
const noFade = engine.inferAllYearTarget(input)
assert.equal(noFade.gasPosition, 0)
assert.equal(noFade.indexFraction, 1)
assert.equal(noFade.thesisKind, 'index-fallback')
// Neither target-day prices nor any future prices may enter a pre-open target.
const poisoned = prices.map((row) => row.date >= targetDate ? { ...row, gasClose: 999999 } : row)
assert.deepEqual(causalSimplificationMarketDays({ rows: poisoned, targetDate }), marketDays)
assert.deepEqual(engine.inferAllYearTarget({ ...input, marketDays: causalSimplificationMarketDays({ rows: poisoned, targetDate }) }), noFade)
// A storage report published after the July30 open cannot affect that target.
assert.deepEqual(engine.inferAllYearTarget({ ...input, storageRows: [...storageRows, { date: '2026-07-24', storageBcf: 1 }] }), noFade)
assert.deepEqual(inferAllYearTarget({ ...input, storageRows: [...storageRows, { date: '2026-07-24', storageBcf: 1 }] }), inferAllYearTarget(input))
assert.throws(() => causalSimplificationMarketDays({ rows: prices, targetDate: '2026-01-01' }), /prior-session/)
console.log('Simplification replay: unchanged long schedule, removed fade, future prices/storage excluded.')
