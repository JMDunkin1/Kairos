#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import Papa from 'papaparse'
import { loadSimplificationResearchEngine } from './lib/qore-simplification-research.mjs'
import { selectedContracts, executableLiveComponentActiveForDate } from './lib/qore-live-contract.mjs'
import { inferAllYearTarget } from './lib/qore-live-all-year-inference.mjs'
import { SUMMER_SUPPLY_POLICY, latestSummerSupplyRow, evaluateSummerSupplyPolicy } from './lib/qore-summer-supply-policy.mjs'
import { validateForecastCalendarTemperatures } from './lib/qore-weather-data-quality.mjs'
import { loadEiaStorageReleaseCalendar } from './lib/eia-release-time.mjs'
import { loadResearchExecutionContract } from './lib/qore-research-execution.mjs'
import { buildComponentSelectedTradesBinding, COMPONENT_ARTIFACT_SCHEMA_VERSION } from './lib/qore-component-artifact.mjs'

const root = process.cwd(), output = 'data/qore/research/strategy-agent-runs/ngas-summer-alpha'
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const csv = (file) => { const result = Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true }); assert.equal(result.errors.length, 0, file); return result.data }
const write = (file, value) => fs.writeFileSync(path.join(output, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n')
const legacySummary = read('data/qore/research/ngas-simplification-baseline/summer-run-summary.json')
const optimizerPath = path.join(root, 'scripts/optimize-ngas-summer-alpha.mjs')
const optimizerSource = fs.readFileSync(optimizerPath, 'utf8')
assert.equal((optimizerSource.match(/\nmain\(\)\s*$/g) ?? []).length, 1)
// Reuse existing artifact calculations, never the optimizer's search/selection entry point.
const moduleSource = optimizerSource.replace(/\nmain\(\)\s*$/, '\nexport { loadAlignedMarketDays, buildCurve, metricsFromCurve, executedEventRowsFromRows, curveForSplit, eventRowsForSplit, legCounts, sideReturnSnapshot, sideMetrics, yearMetrics, blockBootstrapRealityCheck, formatCandidateRow, indexMetricsForDays };\n')
  .replace(/from '(\.{1,2}\/[^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve(path.dirname(optimizerPath), relative)).href}'`)
const resolvedModuleSource = moduleSource.replace("from 'papaparse'", `from '${pathToFileURL(createRequire(import.meta.url).resolve('papaparse')).href}'`)
const legacy = await import(`data:text/javascript;base64,${Buffer.from(resolvedModuleSource).toString('base64')}`)
const engine = await loadSimplificationResearchEngine(root)
const scores = [], locations = [], inputFiles = []
for (const [sourceId, subdir] of [['gfs', 'noaa-gfs'], ['gefs-mean', 'noaa-gefs']]) {
  const prefix = `${sourceId}-00z-daily-forecast-calendar-2021-05-01-2025-09-30-leads-7-hours-0`
  const scorePath = `data/qore/research/${prefix}-signal-scores.csv`, locationPath = `data/qore/weather/${subdir}/${prefix}-location-anomalies.csv`
  inputFiles.push(scorePath, locationPath)
  scores.push(...csv(scorePath).map((row) => ({ ...row, sourceId })))
  locations.push(...csv(locationPath).map((row) => ({ ...row, sourceId })))
}
const weatherQuality = validateForecastCalendarTemperatures({ scoreRows: scores, locationRows: locations, mode: 'quarantine', label: 'Fixed Summer GFS/GEFS legacy calendar' })
const forecasts = engine.enrichForecastRows(scores, locations, 'summer', { temperatureQualityMode: 'quarantine' })
const marketPath = 'data/qore/market/yahoo/NG-F-qore-market.csv'
const storagePath = 'data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv'
const releasePath = 'data/qore/fundamentals/eia/working-gas-storage-release-calendar.json'
const supplyPath = 'data/qore/fundamentals/eia/steo-supply-vintages.json'
inputFiles.push(marketPath, storagePath, releasePath, supplyPath)
const marketDays = csv(marketPath).map((row) => ({ date: row.date, gasClose: Number(row.close) })).filter((row) => row.gasClose > 0)
const storageRows = csv(storagePath), supplyRows = read(supplyPath), storageReleaseCalendar = loadEiaStorageReleaseCalendar(releasePath)
const released = engine.versionedStorageRows(storageRows, storageReleaseCalendar)
const scheduleDays = marketDays.map((day) => ({ ...day, ...engine.summerStorageContext(released, day.date) }))
const definition = { ...engine.selectedContracts.summer, minRealizedMovePct: Infinity }
const signals = engine.signalsFor(forecasts.filter((row) => Number(row.targetDate.slice(5, 7)) >= 5 && Number(row.targetDate.slice(5, 7)) <= 9 && row.leadDays === 7), definition, 'summer')
const unfiltered = engine.schedule(scheduleDays, signals, definition, 'summer')
const days = legacy.loadAlignedMarketDays(), byIndex = new Map(), supplyAudit = new Map()
let compared = 0
for (const [index, day] of days.entries()) {
  const active = executableLiveComponentActiveForDate({ season: 'summer', targetDate: day.date })
  const raw = active ? unfiltered.get(day.date) : null
  let supply = null, position = raw?.position ?? 0
  if (position > 0) {
    supply = evaluateSummerSupplyPolicy({ storageSurplusPct: day.storageSeasonalDiffPct, supplyRow: latestSummerSupplyRow(supplyRows, day.date), targetDate: day.date })
    if (supply.veto) position = 0
  }
  const expected = active ? inferAllYearTarget({ forecastRows: forecasts, marketDays, storageRows, supplyRows, storageReleaseCalendar, targetDate: day.date }) : { gasPosition: 0, indexFraction: 1, thesisKind: 'index-fallback', windowId: 'index-fallback' }
  assert.equal(engine.round(position), expected.gasPosition, `Independent fixed targets disagree with executable strategy ${day.date}`)
  assert.equal(engine.round(1 - Math.abs(position)), expected.indexFraction)
  assert.equal(position ? raw.thesisKind : 'index-fallback', expected.thesisKind)
  compared++
  supplyAudit.set(day.date, { originalUnfilteredGasPosition: engine.round(raw?.position ?? 0), supplyVeto: supply?.veto ?? false, supplyOriginalReleaseDate: supply?.sourceReleaseDate ?? '', supplyAvailableAfterDate: supply?.availableAfterDate ?? '', supplyVintageMonth: supply?.observationMonth ?? '', supplyGrowthLessLngGrowthBcfd: supply?.supplyGrowthLessLngGrowthBcfd ?? '' })
  if (position > 0) byIndex.set(index, { ...raw, sourceId: raw.sourceIds.join('+'), position: expected.gasPosition, storageDate: day.storageDate, storageReleaseAt: day.storageReleaseAt, storageBcf: day.storageBcf, storageSeasonalAverageBcf: day.storageSeasonalAverageBcf, storageSeasonalDiffPct: day.storageSeasonalDiffPct, storageDeficitHeatTilt: day.storageDeficitHeatTilt, heatSizeMultiplier: day.storageDeficitHeatTilt ? 1.25 : 1 })
}
const { curve, rows } = legacy.buildCurve(days, byIndex)
for (const row of rows) Object.assign(row, supplyAudit.get(row.entryTradeDate))
assert.ok(rows.every((row) => row.ungPosition >= 0 && row.windowId !== 'weather-reversion'))
const events = legacy.executedEventRowsFromRows(rows)
const benchmark = legacy.buildCurve(days, new Map()).curve, splits = ['all', 'train', 'validation', 'holdout']
const metrics = {}, indexMetrics = {}, splitEdges = {}
for (const split of splits) {
  const part = split === 'all' ? curve : legacy.curveForSplit(curve, split)
  const count = split === 'all' ? events.length : legacy.eventRowsForSplit(events, split).length
  metrics[split] = legacy.metricsFromCurve(part, count)
  indexMetrics[split] = legacy.metricsFromCurve(split === 'all' ? benchmark : legacy.curveForSplit(benchmark, split), 0)
  splitEdges[split] = Number((metrics[split].totalReturnPct - indexMetrics[split].totalReturnPct).toFixed(2))
}
const trainYears = ['2021', '2022', '2023']
const selected = {
  ...legacySummary.selected, ...selectedContracts.summer,
  architectureLabel: 'Fresh heat long with storage and released supply-pressure filter',
  architectureDescription: 'Retain fixed weather-follow sizing and timing. No Summer automatic fade or short. Suppress heat longs only when seasonal storage is above normal and same-vintage production growth exceeds LNG-export growth.',
  eligible: false, trainValidationRank: null, selectionStatus: 'operator-selected-fixed-paper-experiment',
  allMetrics: metrics.all, trainMetrics: metrics.train, validationMetrics: metrics.validation, holdoutMetrics: metrics.holdout, indexMetrics, splitEdges,
  signalCount: signals.length, scheduledEventCount: byIndex.size, skippedHeatFollowSignals: null,
  storageDeficitHeatTiltRows: rows.filter((row) => row.ungPosition > 0 && row.storageDeficitHeatTilt).length,
  coolingDemandReversionRows: 0, weatherResolutionAdjustedRows: 0, weatherResolutionDroppedRows: 0,
  completedEventCount: events.length, overlayDayCount: byIndex.size, fallbackDayCount: rows.length - byIndex.size,
  profitableTrainYears: trainYears.filter((year) => legacy.metricsFromCurve(curve.filter((row) => row.date.startsWith(year)), 0).totalReturnPct > 0).length, trainYearCount: trainYears.length,
  legCounts: { all: legacy.legCounts(events), trainValidation: legacy.legCounts(events, (row) => row.entryTradeDate <= '2024-12-31'), train: legacy.legCounts(events, (row) => row.entryTradeDate <= '2023-12-31'), validation: legacy.legCounts(events, (row) => row.entryTradeDate >= '2024-01-01' && row.entryTradeDate <= '2024-12-31'), holdout: legacy.legCounts(events, (row) => row.entryTradeDate >= '2025-01-01') },
  sideReturns: { all: legacy.sideReturnSnapshot(rows), trainValidation: legacy.sideReturnSnapshot(rows, (row) => row.entryTradeDate <= '2024-12-31'), holdout: legacy.sideReturnSnapshot(rows, (row) => row.entryTradeDate >= '2025-01-01') },
  supplyVetoRows: [...supplyAudit.values()].filter((row) => row.supplyVeto).length,
}
const candidate = { ...legacy.formatCandidateRow(selected), useFollowLeg: true, useReversionLeg: false, supplyPolicy: SUMMER_SUPPLY_POLICY }
const contract = loadResearchExecutionContract(root)
const summary = {
  ...legacySummary, artifactSchemaVersion: COMPONENT_ARTIFACT_SCHEMA_VERSION, generatedAt: new Date().toISOString(),
  data: {
    signalGasMarketFile: marketPath,
    executionMarketFiles: legacySummary.data.executionMarketFiles,
    executionContractFile: legacySummary.data.executionContractFile,
    indexMarketFile: legacySummary.data.indexMarketFile,
    eiaStorageFile: storagePath,
    eiaStorageReleaseCalendarFile: releasePath,
    weatherTemperatureQuality: { signalCalendars: [weatherQuality.diagnostics] },
    firstSignalDate: forecasts.map(row => row.issueDate).sort()[0],
    marketStartDate: days[0].date, marketEndDate: days.at(-1).date, marketDays: days.length, forecastScoreRows: forecasts.length,
    supplyVintagesFile: supplyPath,
    inputFiles: [...new Set([...inputFiles, ...legacySummary.data.executionMarketFiles, legacySummary.data.indexMarketFile, legacySummary.data.executionContractFile])], historicalCoverageComplete: false, completeThrough: '2026-03-31', maximumCompleteSummerIssueDate: '2025-09-30', incompleteSummer2026: true, missingForecastBehavior: 'Retained common ledger grid includes fallback rows where 2026 Summer forecasts are absent; these rows are not complete strategy evidence.', currentExecutableTargetParity: { comparedRows: compared, mismatches: 0 }, sourceBindings: ['scripts/build-ngas-summer-fixed.mjs', 'scripts/lib/qore-summer-supply-policy.mjs', supplyPath].map((file) => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })) },
  sourceReliability: [],
  contract: { ...legacySummary.contract, signalInstrument: { symbol: 'NG=F', role: 'Retained schedule session grid; automatic Summer price-confirmation and reversion gates are disabled.' }, pnlInstrument: { symbol: 'UNG', role: 'All gas-sleeve P&L and reporting; no candidate ranking in the fixed builder.' }, sourceWeighting: 'Fixed equal weights across the selected GFS and GEFS source families; no reliability-weight fitting.', supplyPolicy: SUMMER_SUPPLY_POLICY, reversionTiming: 'Disabled: no automatic Summer short or fade.', weatherResolutionTiming: 'No Summer fade leg; weather-resolution fade sizing does not apply.', reversionDemandSizing: 'Disabled.', heatSignalFreshness: 'Keep the fixed three-calendar-day heat-follow freshness rule.', selectionPolicy: 'Operator-selected fixed no-shorts plus zero/zero supply filter. No parameter optimization or holdout-based selection in this builder.', thresholdResearch: 'data/qore/research/ngas-supply-threshold-audit.json' },
  selected,
  researchOnly: { evidenceStatus: 'legacy-hours-0-development-contaminated-incomplete-2026', thresholdStudy: 'data/qore/research/ngas-supply-threshold-audit.json', noPristineHoldoutClaim: true, priorArchitectureArchivedAt: 'data/qore/research/ngas-simplification-baseline/summer-run-summary.json' },
  search: { candidateCount: 1, eligibleCandidateCount: 0, selectionStatus: 'fixed-operator-selected-paper-experiment', selectionUsedHoldout: false, parametersRetuned: false },
  promotion: { eligible: false, gates: { statisticallyEligibleCandidate: false, forecastCoverageComplete: false }, reason: 'Historical weather remains legacy hours-0 and 2026 Summer coverage is incomplete. Paper routing is independent of research promotion.' },
  validation: { ...legacySummary.validation, sideMetrics: legacy.sideMetrics(rows), yearMetrics: legacy.yearMetrics(curve), realityCheck: { ...legacy.blockBootstrapRealityCheck(curve), interpretation: 'Reporting-only, development-contaminated legacy inputs; not independent evidence.' }, currentTargetParity: { compared, mismatches: 0 } },
  candidates: [candidate],
}
const text = Papa.unparse(rows, { newline: '\n' }) + '\n'
summary.data.selectedTradesArtifact = buildComponentSelectedTradesBinding({ repoRoot: root, file: summary.outputFiles.selectedTrades, raw: text, rows, executionContract: contract, label: 'Fixed Summer Alpha' })
write('selected-trades.csv', text)
write('selected-events.csv', Papa.unparse(events, { newline: '\n' }) + '\n')
write('candidate-summary.csv', Papa.unparse([Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value !== 'object'))], { newline: '\n' }) + '\n')
write('run-summary.json', summary)
write('report.md', `# Fixed Summer heat-follow with supply filter\n\nNo automatic Summer shorts. Suppress a long only when storage is above its prior five-year seasonal mean and contemporaneously released production growth exceeds LNG-export growth. Both thresholds are zero economic sign boundaries; the threshold study did not identify a statistically supported optimized replacement.\n\nThis builder performs no parameter search. ${compared} daily target allocations match the executable strategy before writing the recomputed causal UNG/VOO/QQQM ledger. Winter is unchanged.\n\n| Period | Return | Fallback | Difference |\n|---|---:|---:|---:|\n${splits.map((split) => `| ${split} | ${metrics[split].totalReturnPct}% | ${indexMetrics[split].totalReturnPct}% | ${splitEdges[split]} pp |`).join('\n')}\n\nThese are legacy hours-0, development-contaminated research results. Summer 2026 forecasts are missing; retained 2026 fallback rows are incomplete evidence. The current corrected live input contract is different. No research promotion claim; paper operation remains independent.\n`)
console.log(JSON.stringify({ selected: selected.candidateId, comparedTargets: compared, gasDays: byIndex.size, supplyVetoRows: selected.supplyVetoRows, metrics, splitEdges }, null, 2))
