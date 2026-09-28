#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { enrichForecastRows } from './research-fixtures/ngas-simplification-baseline/qore-live-all-year-inference.mjs'
import { loadEiaStorageReleaseCalendar } from './lib/eia-release-time.mjs'
import { loadExecutionCalendar, loadResearchExecutionContract, createExecutionState, applyExecutionStep, targetWeightsForAllocation, loadAdjustedYahooBars } from './lib/qore-research-execution.mjs'
import { loadSimplificationResearchEngine, simplificationSummerTargets } from './lib/qore-simplification-research.mjs'
const root = process.cwd()
const dir = path.join(root, '.local/qore/research/ngas-simplification')
const csv = (file) => { const parsed = Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true }); assert.equal(parsed.errors.length, 0, file); return parsed.data }
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + '\n')
const protocolPath = path.join(root, 'docs/research/ngas-simplification-protocol.json')
const protocol = read(protocolPath)
fs.mkdirSync(dir, { recursive: true })
const localProtocolPath = path.join(dir, 'preregistration.json')
if (!fs.existsSync(localProtocolPath)) fs.writeFileSync(localProtocolPath, JSON.stringify(protocol, null, 2) + '\n', { flag: 'wx' })
const spec = read(localProtocolPath)
assert.deepEqual(spec, protocol, 'Local preregistration differs from the frozen versioned protocol')
assert.equal(spec.studyId, 'ngas-simplification-v1')
assert.deepEqual(spec.candidates.map((x) => x.id), ['baseline', 'no-summer-fade', 'ung-price', 'ung-price-no-summer-fade', 'all-year-long-only'])
const inputPaths = [protocolPath, path.join(root, 'scripts/test-qore-simplification.mjs'), path.join(root, 'scripts/research-ngas-simplification.mjs'), path.join(root, 'scripts/lib/qore-simplification-research.mjs'), path.join(root, 'scripts/lib/qore-research-execution.mjs'), path.join(root, 'scripts/lib/qore-rebalance-deadband.mjs'), path.join(dir, 'preregistration.json'), path.join(root, 'scripts/research-fixtures/ngas-simplification-baseline/qore-live-all-year-inference.mjs'), path.join(root, 'scripts/research-fixtures/ngas-simplification-baseline/qore-live-contract.mjs'), path.join(root, 'scripts/research-fixtures/ngas-simplification-baseline/qore-live-target-lattice.mjs')]
const data = path.join(root, 'data/qore')
const scores = [], locations = []
for (const [sourceId, subdir] of [['gfs', 'noaa-gfs'], ['gefs-mean', 'noaa-gefs']]) {
  const prefix = `${sourceId}-00z-daily-forecast-calendar-2021-05-01-2025-09-30-leads-7-hours-0`
  const scorePath = path.join(data, 'research', `${prefix}-signal-scores.csv`)
  const locationPath = path.join(data, 'weather', subdir, `${prefix}-location-anomalies.csv`)
  inputPaths.push(scorePath, locationPath)
  scores.push(...csv(scorePath).map((row) => ({ ...row, sourceId })))
  locations.push(...csv(locationPath).map((row) => ({ ...row, sourceId })))
}
const forecasts = enrichForecastRows(scores, locations, 'summer', { temperatureQualityMode: 'quarantine' })
const storagePath = path.join(data, 'fundamentals/eia/working-gas-storage-lower48-weekly.csv')
const releasePath = path.join(data, 'fundamentals/eia/working-gas-storage-release-calendar.json')
const ngPath = path.join(data, 'market/yahoo/NG-F-qore-market.csv')
const ungPath = path.join(data, 'market/yahoo/UNG-daily.csv')
const expectedPath = path.join(data, 'research/ngas-simplification-baseline/summer-targets.csv')
const compositePath = path.join(data, 'research/ngas-simplification-baseline/all-year-targets.csv')
inputPaths.push(storagePath, releasePath, ngPath, ungPath, expectedPath, compositePath, path.join(root, 'config/qore-research-execution.json'), path.join(data, 'market/yahoo/VOO-daily.csv'), path.join(data, 'market/yahoo/QQQM-daily.csv'))
const storageRows = csv(storagePath), storageReleaseCalendar = loadEiaStorageReleaseCalendar(releasePath)
const ngDays = csv(ngPath).map((row) => ({ date: row.date, gasClose: Number(row.close) })).filter((row) => row.gasClose > 0)
const ungPrices = new Map(loadAdjustedYahooBars(ungPath).map((row) => [row.date, row.close]))
// Keep the reviewed NG session grid identical, changing only the summer price input.
// NG includes a few exchange-closed days. Carry the last completed UNG close
// on those days so the price-only variant cannot also change holding-day counts.
// Execution remains restricted to common UNG/VOO/QQQM sessions.
const relevantNgDays = ngDays.filter((row) => row.date >= '2020-12-01')
const missingUng = relevantNgDays.filter((row) => row.date <= '2026-03-31' && !ungPrices.has(row.date))
let priorUngClose = null
const ungDays = relevantNgDays.map((row) => {
  if (ungPrices.has(row.date)) priorUngClose = ungPrices.get(row.date)
  assert.ok(priorUngClose > 0, `UNG price unavailable on ${row.date}`)
  return { date: row.date, gasClose: priorUngClose }
})
const engine = await loadSimplificationResearchEngine(root)
const targets = new Map()
for (const candidate of spec.candidates) {
  targets.set(candidate.id, simplificationSummerTargets({ engine, forecasts, marketDays: candidate.summerSignalInstrument === 'UNG' ? ungDays : ngDays, storageRows, storageReleaseCalendar, candidate }))
}
const expected = csv(expectedPath).filter((row) => ['05', '06', '07', '08', '09'].includes(row.targetDate.slice(5, 7)))
const parityMismatches = expected.filter((row) => Number(row.ungPosition) !== targets.get('baseline').get(row.entryTradeDate)?.gasPosition || Number(row.indexFraction) !== targets.get('baseline').get(row.entryTradeDate)?.indexFraction)
assert.equal(parityMismatches.length, 0, `Baseline parity mismatches: ${JSON.stringify(parityMismatches.slice(0, 2))}`)
// Do not mistake absent summer 2026 forecast coverage for an intentional flat signal.
const composite = csv(compositePath).filter((row) => row.entryTradeDate <= '2026-03-31')
const compositeMap = new Map(composite.map((row) => [row.entryTradeDate, row]))
const start = composite[0].entryTradeDate, end = composite.at(-1).entryTradeDate
const contract = loadResearchExecutionContract(root)
const days = loadExecutionCalendar(root, { startDate: start, endDate: end, contract })
assert.equal(days.length, composite.length, 'Complete all-year date grid')
const targetRows = []
for (const candidate of spec.candidates) for (const day of days) {
  const summer = targets.get(candidate.id).get(day.date) ?? { date: day.date, gasPosition: 0, indexFraction: 1, signalDate: day.date, thesisKind: 'index-fallback' }
  const original = compositeMap.get(day.date)
  const winter = original.componentStrategyId === 'ngas-winter-alpha'
  let gasPosition = winter ? Number(original.ungPosition) : summer.gasPosition
  let indexFraction = winter ? Number(original.indexFraction) : summer.indexFraction
  if (candidate.suppressWinterShorts && gasPosition < 0) { gasPosition = 0; indexFraction = 1 }
  targetRows.push({ candidateId: candidate.id, ...summer, gasPosition, indexFraction, signalDate: winter ? original.signalDate : summer.signalDate, thesisKind: winter && gasPosition ? original.thesisKind : summer.thesisKind, summerGasPosition: summer.gasPosition, summerIndexFraction: summer.indexFraction, component: winter && gasPosition ? 'winter' : summer.gasPosition ? 'summer' : 'fallback' })
}
for (const row of targetRows.filter((row) => row.candidateId === 'baseline')) {
  assert.equal(row.gasPosition, Number(compositeMap.get(row.date).ungPosition), `Composite gas parity ${row.date}`)
  assert.equal(row.indexFraction, Number(compositeMap.get(row.date).indexFraction), `Composite index parity ${row.date}`)
}
fs.writeFileSync(path.join(dir, 'targets.csv'), Papa.unparse(targetRows) + '\n')
write('summer-enriched-forecasts.json', forecasts)
write('input-audit.json', { generatedAt: new Date().toISOString(), baselineParity: { compared: expected.length, mismatches: parityMismatches.length, fullCompositeCompared: days.length, fullCompositeMismatches: 0 }, missingUngOnNgSessions: missingUng.map((row) => row.date), forecastCoverage: { first: forecasts[0].issueDate, last: forecasts.at(-1).issueDate, rows: forecasts.length }, files: [...new Set(inputPaths)].map((file) => ({ path: path.relative(root, file), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })) })
console.log(`Targets saved; ${expected.length} baseline targets matched; ${days.length} execution sessions.`)
const targetMap = new Map(spec.candidates.map((candidate) => [candidate.id, new Map(targetRows.filter((row) => row.candidateId === candidate.id).map((row) => [row.date, row]))]))
function simulate(candidateId, lane, scenarioId, endDate) {
  let state = createExecutionState(contract), equity = 100000
  const rows = []
  for (const day of days.filter((day) => day.date <= endDate)) {
    const target = targetMap.get(candidateId)?.get(day.date)
    const gasPosition = lane === 'fallback' ? 0 : lane === 'summer-only' ? target.summerGasPosition : target.gasPosition
    const indexFraction = lane === 'fallback' ? 1 : lane === 'summer-only' ? target.summerIndexFraction : target.indexFraction
    const step = applyExecutionStep({ state, day, targetWeights: targetWeightsForAllocation(contract, { gasPosition, investedIndexFraction: indexFraction }), contract, scenarioId })
    equity *= 1 + step.netReturnPct / 100
    rows.push({ candidateId, lane, scenarioId, date: day.date, gasPosition, indexFraction, netReturnPct: step.netReturnPct, costPct: step.tradingCostPct + step.borrowCostPct, equity })
    state = step.state
  }
  return rows
}
function metrics(rows) {
  let equity = 1, peak = 1, maxDrawdownPct = 0, episodes = 0, previous = 0
  for (const row of rows) { equity *= 1 + row.netReturnPct / 100; peak = Math.max(peak, equity); maxDrawdownPct = Math.min(maxDrawdownPct, (equity / peak - 1) * 100); if (row.gasPosition && Math.sign(row.gasPosition) !== Math.sign(previous)) episodes++; previous = row.gasPosition }
  const avg = rows.reduce((s, r) => s + r.netReturnPct, 0) / rows.length
  const sd = Math.sqrt(rows.reduce((s, r) => s + (r.netReturnPct - avg) ** 2, 0) / Math.max(1, rows.length - 1))
  return { sessions: rows.length, returnPct: (equity - 1) * 100, cagrPct: (equity ** (252 / rows.length) - 1) * 100, sharpe: sd ? avg / sd * Math.sqrt(252) : 0, maxDrawdownPct, gasActiveSessions: rows.filter((r) => r.gasPosition).length, episodes }
}
const trainFallback = metrics(simulate('baseline', 'fallback', 'baseline', spec.splits.trainEnd))
const trainRank = spec.candidates.filter((candidate) => candidate.selectionEligible).map((candidate, ordinal) => {
  const result = metrics(simulate(candidate.id, 'summer-only', 'baseline', spec.splits.trainEnd))
  return { candidateId: candidate.id, ordinal, ...result, fallbackReturnPct: trainFallback.returnPct, edgePct: result.returnPct - trainFallback.returnPct }
}).sort((a, b) => Math.abs(b.edgePct - a.edgePct) < 1e-9 ? a.ordinal - b.ordinal : b.edgePct - a.edgePct)
const selection = { lockedAt: new Date().toISOString(), selectedCandidateId: trainRank[0].candidateId, trainRank, heldoutMetricsConsulted: false }
write('selection-lock.json', selection)
console.log(`Selection locked on training only: ${selection.selectedCandidateId}. Now calculating validation and report-only holdout.`)
const allRows = [], results = []
for (const scenarioId of Object.keys(contract.scenarios)) {
  const fallback = simulate('baseline', 'fallback', scenarioId, end)
  const periods = { train: (r) => r.date <= spec.splits.trainEnd, validation: (r) => r.date > spec.splits.trainEnd && r.date <= spec.splits.validationEnd, holdout: (r) => r.date >= spec.splits.holdoutStart, ...Object.fromEntries([...new Set(days.map((d) => d.date.slice(0, 4)))].map((year) => [year, (r) => r.date.startsWith(year)])) }
  allRows.push(...fallback)
  for (const candidate of spec.candidates) for (const lane of ['summer-only', 'all-year']) {
    const rows = simulate(candidate.id, lane, scenarioId, end)
    allRows.push(...rows)
    for (const [period, filter] of Object.entries(periods)) {
      const selected = rows.filter(filter), bench = fallback.filter(filter)
      if (!selected.length) continue
      const result = metrics(selected), fallbackResult = metrics(bench)
      results.push({ candidateId: candidate.id, lane, scenarioId, period, ...result, fallbackReturnPct: fallbackResult.returnPct, edgePct: result.returnPct - fallbackResult.returnPct })
    }
  }
}
const val = results.find((r) => r.candidateId === selection.selectedCandidateId && r.lane === 'summer-only' && r.scenarioId === 'baseline' && r.period === 'validation')
const nominationAccepted = trainRank[0].edgePct > 0 && val.edgePct > 0 && val.gasActiveSessions >= 20
write('summary.json', { studyId: spec.studyId, completedAt: new Date().toISOString(), selection, nominationAccepted, validation: val, data: { start, end, days: days.length, inputContract: 'legacy summer hours-0; unchanged selected winter ledger; research only' }, limitations: spec.limitations, results })
fs.writeFileSync(path.join(dir, 'daily-returns.csv'), Papa.unparse(allRows) + '\n')
fs.writeFileSync(path.join(dir, 'results.csv'), Papa.unparse(results) + '\n')
console.log(JSON.stringify({ nominationAccepted, trainRank, validation: val, holdout: results.filter((r) => r.scenarioId === 'baseline' && r.period === 'holdout') }, null, 2))

const rowsForReport = results.filter((row) => row.lane === 'summer-only' && row.scenarioId === 'baseline' && ['train', 'validation', '2025'].includes(row.period) && row.candidateId !== 'all-year-long-only')
const report = [
  '# Natural-gas simplification: frozen historical comparison',
  '',
  `Completed ${new Date().toISOString()}. Research only; no production setting, target, or broker route changed.`,
  '',
  'The original baseline won training selection. Removing the automatic summer short did not improve these legacy historical tests: it underperformed the fallback during 2024 validation. UNG-based price confirmation also trailed the original baseline. This does not prove the original strategy works prospectively: the historical weather statistic differs from the current corrected live input.',
  '',
  'Training: 2021–2023. Validation: 2024. Reporting-only held-out-from-this-fit summer: 2025. Original winter targets remain unchanged in the all-year comparison, with their original later fitting boundaries; therefore do not call full all-year 2025 untouched. The table below isolates summer decisions by holding fallback throughout winter. Returns include the index fallback and modeled gas costs; they are not standalone gas returns.',
  '',
  '| Candidate | Period | Portfolio return | Fallback return | Difference (pp) | Max drawdown | Gas sessions |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...rowsForReport.map((row) => `| ${row.candidateId} | ${row.period} | ${row.returnPct.toFixed(2)}% | ${row.fallbackReturnPct.toFixed(2)}% | ${row.edgePct.toFixed(2)} | ${row.maxDrawdownPct.toFixed(2)}% | ${row.gasActiveSessions} |`),
  '',
  `Training-selected candidate: ${selection.selectedCandidateId}. Frozen validation requirements satisfied: ${nominationAccepted}. This is a research nomination only. No alternative replaces a failed training winner, and no later-period result enters selection.`,
  '',
  'The no-fade and UNG-price-plus-no-fade rows coincide because this selected summer contract uses the price measurement only for the fade gate (its volatility-target parameter is zero). Turning off that leg makes the price substitution immaterial.',
  '',
  'All three frozen cost scenarios are in results.csv. Daily returns, positions and fallback comparison are in daily-returns.csv; forecast issue dates and targets are in targets.csv. The baseline reproduces all 585 checked summer target rows and every compared all-year allocation. Three NG-market dates are UNG exchange holidays; the price-only challenger carries the previous completed UNG close on those dates, preserving the legacy scheduling grid, and never executes an ETF trade on them.',
  '',
  ...spec.limitations.map((item) => `- ${item}`),
  '- Historical reporting stops March 31, 2026. Dedicated summer weather ends September 30, 2025; missing summer 2026 forecasts must not be interpreted as deliberate fallback positions. The separately collected corrected-weather July 27–September 25, 2026 replay is a different diagnostic.',
  '- Daily adjusted-open execution cannot recreate intraday supervisor decisions, quotes, partial fills, market impact, or short borrow availability. No earnings on idle cash or taxes are added.',
  '',
  'Reproduction: node scripts/research-ngas-simplification.mjs; node scripts/test-qore-simplification.mjs. The preregistration was written before the first result calculation; selection-lock.json is written using training returns before validation/holdout metrics are calculated. Local timestamps are not an external chronology attestation.',
]
fs.writeFileSync(path.join(dir, 'report.md'), report.join('\n') + '\n')

const audit = {
  schemaVersion: 1,
  studyId: spec.studyId,
  generatedAt: new Date().toISOString(),
  executionEligible: false,
  productionStrategyChanged: false,
  protocolPath: path.relative(root, protocolPath),
  originalRuleFreezeRecordedAt: spec.frozenAt,
  chronologyAttestation: 'Local freeze recorded before first results; no external or immutable timestamp attestation.',
  selection: { selectedCandidateId: selection.selectedCandidateId, trainRank, holdoutUsedForSelection: false, nominationAccepted, validation: val },
  coverage: { start, end, sessions: days.length, baselineSummerParityRows: expected.length, baselineCompositeParityRows: days.length, baselineMismatches: 0 },
  limitations: [...spec.limitations, 'Inherited summer thresholds had originally been selected with 2021–2024 data; this 2024 structural-variant validation is not fresh validation of those inherited thresholds.', 'No forecasts support summer 2026 in this historical dataset; terminate at March 31, 2026. The corrected outage replay is separate.'],
  results: results.filter((row) => ['train', 'validation', '2025', 'holdout'].includes(row.period)),
  inputBindings: read(path.join(dir, 'input-audit.json')).files,
  outputBindings: ['targets.csv', 'daily-returns.csv', 'results.csv', 'summary.json', 'summer-enriched-forecasts.json'].map((name) => ({ path: path.relative(root, path.join(dir, name)), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex') })),
}
fs.writeFileSync(path.join(data, 'research/ngas-simplification-audit.json'), JSON.stringify(audit, null, 2) + '\n')
