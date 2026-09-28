#!/usr/bin/env node
import fs from 'node:fs'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { loadSimplificationResearchEngine, simplificationSummerTargets } from './lib/qore-simplification-research.mjs'
import { loadEiaStorageReleaseCalendar } from './lib/eia-release-time.mjs'
const csv = (p) => Papa.parse(fs.readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true }).data
const dir = '.local/qore/research/ngas-simplification'
const forecasts = JSON.parse(fs.readFileSync(`${dir}/summer-enriched-forecasts.json`))
const storageRows = csv('data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv')
const storageReleaseCalendar = loadEiaStorageReleaseCalendar()
const marketDays = csv('data/qore/market/yahoo/NG-F-qore-market.csv').map((r) => ({ date: r.date, gasClose: Number(r.close) }))
const engine = await loadSimplificationResearchEngine()
const args = { engine, forecasts, storageRows, storageReleaseCalendar, marketDays, candidate: { disableSummerFade: false } }
const targets = simplificationSummerTargets(args)
const changedFuturePrices = marketDays.map((r) => r.date > '2023-12-31' ? { ...r, gasClose: r.gasClose * 9 } : r)
const changedFutureForecasts = forecasts.map((r) => r.issueDate > '2023-12-31' ? { ...r, weightedAnomalyF: -70 } : r)
const mutated = simplificationSummerTargets({ ...args, marketDays: changedFuturePrices, forecasts: changedFutureForecasts, storageRows: storageRows.map((r) => r.date > '2023-12-31' ? { ...r, storageBcf: 1 } : r) })
for (const [date, row] of targets) if (date <= '2023-12-31') assert.deepEqual(mutated.get(date), row, `Future data altered training target ${date}`)
const noFade = simplificationSummerTargets({ ...args, candidate: { disableSummerFade: true } })
assert.ok([...targets.values()].some((r) => r.gasPosition < 0), 'Control should include shorts')
assert.ok([...noFade.values()].every((r) => r.gasPosition >= 0), 'No-fade has no summer shorts')
for (const [date, row] of noFade) {
  assert.equal(row.indexFraction, Number((1 - Math.abs(row.gasPosition)).toFixed(4)))
  if (row.gasPosition) assert.ok(row.signalDate < date, `Same-day forecast entry ${date}`)
}
// Poison each target session close and every later close: pre-open target must agree.
const sampleDates = [...targets.values()].filter((r) => r.gasPosition && ['2022', '2024', '2025'].includes(r.date.slice(0, 4))).filter((_, i) => i % 9 === 0).map((r) => r.date)
for (const date of sampleDates) {
  const poisoned = simplificationSummerTargets({ ...args, marketDays: marketDays.map((r) => r.date >= date ? { ...r, gasClose: r.gasClose * 77 } : r) })
  assert.deepEqual(poisoned.get(date), targets.get(date), `Target used its own/future close ${date}`)
}
for (const date of sampleDates.filter((_, index) => index % 4 === 0)) {
  const completed = marketDays.filter((r) => r.date < date)
  const prefix = simplificationSummerTargets({ ...args, forecasts: forecasts.filter((r) => r.issueDate <= date), marketDays: [...completed, { date, gasClose: completed.at(-1).gasClose }] })
  assert.deepEqual(prefix.get(date), targets.get(date), `Removing future rows altered pre-open target ${date}`)
}
console.log(`PASS: future-data mutation, same-day/future-close mutation on ${sampleDates.length} dates, future-row removal on ${sampleDates.filter((_, index) => index % 4 === 0).length} dates, no-fade direction, strictly later entry, full fallback allocation.`)
