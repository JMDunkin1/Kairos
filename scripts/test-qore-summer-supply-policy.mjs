#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Papa from 'papaparse'
import { SUMMER_SUPPLY_POLICY, latestSummerSupplyRow, evaluateSummerSupplyPolicy } from './lib/qore-summer-supply-policy.mjs'
import { executableLiveComponentContract, canonicalComponentLiveContractFromSummaries, executableLiveGasPositionTargetsForTarget } from './lib/qore-live-contract.mjs'
import { inferAllYearTarget } from './lib/qore-live-all-year-inference.mjs'
import { inferAllYearTarget as inferOriginalAllYearTarget } from './research-fixtures/ngas-simplification-baseline/qore-live-all-year-inference.mjs'
import { loadNoSummerReversionEngine } from './lib/qore-simplification-replay.mjs'

const row = { originalReleaseDate: '2026-07-07', releasedAt: '2026-07-07', month: '2026-06', units: 'Bcf/d', productionYoYChangeBcfd: 3, lngYoYChangeBcfd: 2, supplyGrowthLessLngGrowthBcfd: 1 }
const targetDate = '2026-07-27'
const decision = (storageSurplusPct, supplyRow = row) => evaluateSummerSupplyPolicy({ storageSurplusPct, supplyRow, targetDate })
assert.equal(decision(1).veto, true)
assert.equal(decision(0).veto, false)
assert.equal(decision(-1).veto, false)
assert.equal(decision(1, { ...row, lngYoYChangeBcfd: 3, supplyGrowthLessLngGrowthBcfd: 0 }).veto, false)
assert.throws(() => decision(Number.NaN))
assert.throws(() => decision(1, { ...row, units: 'MMcf' }))
assert.throws(() => decision(1, { ...row, supplyGrowthLessLngGrowthBcfd: 12 }))
assert.throws(() => latestSummerSupplyRow([], targetDate))
assert.throws(() => latestSummerSupplyRow([row, row], targetDate))
assert.throws(() => latestSummerSupplyRow([row], '2026-08-22'), /stale/)
assert.throws(() => latestSummerSupplyRow([row], row.releasedAt), /causally/)
const future = { ...row, originalReleaseDate: '2026-08-11', releasedAt: '2026-08-11', month: '2026-07' }
assert.deepEqual(latestSummerSupplyRow([row, future], targetDate), row)
// A late correction to an old vintage cannot displace a newer vintage.
assert.deepEqual(latestSummerSupplyRow([{ ...row, releasedAt: '2026-08-12' }, future], '2026-08-13'), future)

assert.equal(executableLiveComponentContract.summer.selected.useReversionLeg, false)
assert.equal(executableLiveComponentContract.summer.selected.reversionHoldDays, 0)
assert.deepEqual(executableLiveGasPositionTargetsForTarget({ season: 'summer', componentStrategyId: 'ngas-summer-alpha', windowId: 'weather-reversion', thesisKind: 'reversion-short' }), [])
assert.equal(executableLiveComponentContract.summer.positionCaps['weather-reversion'], undefined)
assert.deepEqual(executableLiveComponentContract.summer.implementation.supplyPolicy, SUMMER_SUPPLY_POLICY)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const summer = read('data/qore/research/strategy-agent-runs/ngas-summer-alpha/run-summary.json')
const winter = read('data/qore/research/strategy-agent-runs/ngas-winter-alpha/run-summary.json')
const priorSummer = structuredClone(summer)
delete priorSummer.contract.supplyPolicy
for (const candidate of priorSummer.candidates ?? []) delete candidate.supplyPolicy
assert.equal(canonicalComponentLiveContractFromSummaries(priorSummer, winter).summer.implementation.supplyPolicy, null, 'Old research cannot inherit current supply policy')

const dates = ['2026-07-24', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']
const marketDays = dates.map((date, index) => ({ date, gasClose: [10, 10, 10.2, 10.5, 10.8, 10.9][index] }))
const forecastRows = ['gfs', 'gefs-mean'].map(sourceId => ({ sourceId, sourceFamily: sourceId === 'gfs' ? 'gfs' : 'gefs', sourceGroup: 'ncep', issueDate: '2026-07-24', targetDate: '2026-07-31', leadDays: 7, weightedAnomalyF: 10, coolingDemandAnomalyF: 10, heatingDemandAnomalyF: 0, warmCoveragePct: 1, warmExtremeCount: 2, coldCoveragePct: 0, coldExtremeCount: 0, sampledWeight: 1.06 }))
const parsed = Papa.parse(fs.readFileSync('data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv', 'utf8'), { header: true, skipEmptyLines: true })
assert.equal(parsed.errors.length, 0)
const storageRows = [...parsed.data.filter(r => r.date < '2026-07-17'), { date: '2026-07-17', storageBcf: 6000 }]
const input = { forecastRows, marketDays, storageRows, targetDate }
const vetoed = inferAllYearTarget({ ...input, supplyRows: [row] })
assert.equal(vetoed.gasPosition, 0)
assert.equal(vetoed.indexFraction, 1)
assert.ok(inferOriginalAllYearTarget(input).gasPosition > 0, 'Frozen original comparator must remain unfiltered')
const { engine: noFadeEngine } = await loadNoSummerReversionEngine()
assert.ok(noFadeEngine.inferAllYearTarget(input).gasPosition > 0, 'Frozen no-short comparator must not inherit the production supply veto')
const favorable = { ...row, lngYoYChangeBcfd: 4, supplyGrowthLessLngGrowthBcfd: -1 }
const allowed = inferAllYearTarget({ ...input, supplyRows: [favorable] })
assert.ok(allowed.gasPosition > 0, 'Changing only supply context must change cached target')
assert.throws(() => inferAllYearTarget(input), /supply/i)
for (const date of dates.slice(1)) assert.ok(inferAllYearTarget({ ...input, targetDate: date, supplyRows: [favorable] }).gasPosition >= 0)
assert.equal(inferAllYearTarget({ ...input, targetDate: '2026-10-02' }).gasPosition, 0, 'Inactive season needs no supply context')
console.log('Summer supply policy: strict boundaries, causal vintages, stale/missing inputs, cache changes, no shorts, and explicit legacy contract separation pass.')
