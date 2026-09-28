#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import Papa from 'papaparse'
import { latestSupplyVintage } from './lib/qore-simplification-demand.mjs'
import { eiaStorageReleaseAt, loadEiaStorageReleaseCalendar } from './lib/eia-release-time.mjs'
import { eiaReportAvailableAtOpen } from './lib/qore-signal-availability.mjs'
import { loadResearchExecutionContract, loadExecutionCalendar, createExecutionState, targetWeightsForAllocation, applyExecutionStep } from './lib/qore-research-execution.mjs'

const mean = (rows) => rows.reduce((sum, value) => sum + value, 0) / rows.length
const sd = (rows) => { const center = mean(rows); return Math.sqrt(rows.reduce((sum, value) => sum + (value - center) ** 2, 0) / Math.max(1, rows.length - 1)) }
export function quantile(values, fraction) {
  assert.ok(values.length && values.every(Number.isFinite))
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * fraction
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1)
}
export function thresholdStorageContext(storageRows, targetDate, releaseCalendar) {
  const visible = storageRows.filter((row) => eiaReportAvailableAtOpen(eiaStorageReleaseAt(row.date, releaseCalendar), targetDate))
  const latest = visible.at(-1)
  assert.ok(latest, `Missing released storage ${targetDate}`)
  const year = Number(latest.date.slice(0, 4))
  const week = (date) => Math.floor(Math.floor((Date.parse(date) - Date.parse(`${date.slice(0, 4)}-01-01`)) / 86400000) / 7)
  const peers = visible.filter((row) => Number(row.date.slice(0, 4)) >= year - 5 && Number(row.date.slice(0, 4)) < year && week(row.date) === week(latest.date))
  assert.ok(peers.length >= 3, `Insufficient historical storage peers ${targetDate}`)
  const seasonalMeanBcf = mean(peers.map((row) => Number(row.storageBcf)))
  assert.ok(seasonalMeanBcf > 0 && Number.isFinite(Number(latest.storageBcf)))
  return { storageDate: latest.date, storageReleaseAt: eiaStorageReleaseAt(latest.date, releaseCalendar), storageBcf: Number(latest.storageBcf), seasonalMeanBcf, storageSurplusPct: (Number(latest.storageBcf) / seasonalMeanBcf - 1) * 100, storagePeerCount: peers.length }
}
export function deriveThresholdGrid(features, trainEnd = '2023-12-31') {
  const eligible = features.filter((row) => row.date >= '2021-01-01' && row.date <= trainEnd && Number(row.date.slice(5, 7)) >= 5 && Number(row.date.slice(5, 7)) <= 9)
  const uniqueStorage = [...new Map(eligible.map((row) => [row.storageDate, row])).values()]
  const uniqueSupply = [...new Map(eligible.map((row) => [row.supplyReleaseDate, row])).values()]
  for (const row of eligible) {
    assert.ok(row.storageReleaseAt.slice(0, 10) <= row.date && row.supplyReleaseDate < row.date)
    assert.ok(Number.isFinite(row.storageSurplusPct) && Number.isFinite(row.flowPressureBcfd))
  }
  const positiveStorage = uniqueStorage.map((row) => row.storageSurplusPct).filter((value) => value > 0)
  const positiveFlow = uniqueSupply.map((row) => row.flowPressureBcfd).filter((value) => value > 0)
  const storage = [0, quantile(positiveStorage, 0.5), quantile(positiveStorage, 0.75)]
  const flow = [0, quantile(positiveFlow, 0.5), quantile(positiveFlow, 0.75)]
  const seen = new Set(), candidates = []
  storage.forEach((storageThresholdPct, storageIndex) => flow.forEach((flowThresholdBcfd, flowIndex) => {
    const key = `${storageThresholdPct}|${flowThresholdBcfd}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ id: `storage-${storageIndex}-flow-${flowIndex}`, storageIndex, flowIndex, storageThresholdPct, flowThresholdBcfd })
  }))
  return { storageThresholdsPct: storage, flowThresholdsBcfd: flow, candidates, sample: { firstDate: eligible[0].date, lastDate: eligible.at(-1).date, distinctStorageReports: uniqueStorage.length, positiveStorageReports: positiveStorage.length, distinctSupplyVintages: uniqueSupply.length, positiveSupplyVintages: positiveFlow.length }, positiveStorage, positiveFlow }
}
export function thresholdAllowsLong(feature, candidate) {
  for (const value of [feature.storageSurplusPct, feature.flowPressureBcfd, candidate.storageThresholdPct, candidate.flowThresholdBcfd]) assert.ok(Number.isFinite(value), 'Missing/nonfinite threshold feature')
  return !(feature.storageSurplusPct > candidate.storageThresholdPct && feature.flowPressureBcfd > candidate.flowThresholdBcfd)
}
function seededRandom(seed) {
  let value = seed >>> 0
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
export function pairedThresholdBootstrap(seriesById, { resamples = 2000, blockLengthSessions = 10, seed = 20260927, familyConfidence = 0.90 } = {}) {
  const ids = Object.keys(seriesById), n = seriesById[ids[0]].length
  assert.ok(ids.length > 0 && n >= blockLengthSessions)
  for (const id of ids) assert.equal(seriesById[id].length, n)
  const observed = Object.fromEntries(ids.map((id) => [id, mean(seriesById[id])]))
  const bootstrapMeans = Object.fromEntries(ids.map((id) => [id, []]))
  const rng = seededRandom(seed)
  for (let replication = 0; replication < resamples; replication++) {
    const sums = Object.fromEntries(ids.map((id) => [id, 0]))
    for (let count = 0; count < n;) {
      const start = Math.floor(rng() * n)
      for (let offset = 0; offset < blockLengthSessions && count < n; offset++, count++) {
        const index = (start + offset) % n
        for (const id of ids) sums[id] += seriesById[id][index]
      }
    }
    for (const id of ids) bootstrapMeans[id].push(sums[id] / n)
  }
  const se = Object.fromEntries(ids.map((id) => [id, sd(bootstrapMeans[id])]))
  const maxAbs = [], maxPositive = []
  for (let replication = 0; replication < resamples; replication++) {
    const statistics = ids.map((id) => se[id] > 1e-14 ? (bootstrapMeans[id][replication] - observed[id]) / se[id] : 0)
    maxAbs.push(Math.max(...statistics.map(Math.abs)))
    maxPositive.push(Math.max(...statistics))
  }
  const criticalValue = quantile(maxAbs, familyConfidence)
  const rows = ids.map((id) => {
    const statistic = se[id] > 1e-14 ? observed[id] / se[id] : observed[id] > 1e-14 ? Infinity : 0
    return { id, meanDailyLogExcess: observed[id], pairedBlockStandardError: se[id], simultaneousLower: observed[id] - criticalValue * se[id], simultaneousUpper: observed[id] + criticalValue * se[id], familyAdjustedP: (1 + maxPositive.filter((value) => value >= statistic).length) / (resamples + 1), zeroVariance: se[id] <= 1e-14 }
  })
  return { criticalValue, n, resamples, blockLengthSessions, familyConfidence, rows, bootstrapMeans }
}
export function affectedEpisodes(baseRows, zeroRows, candidateRows, embargo = 10) {
  const clusters = []
  let current = null, lastActive = -Infinity
  baseRows.forEach((row, index) => {
    if (!row.gasPosition) return
    if (!current || index - lastActive - 1 >= embargo) {
      current = { start: row.date, end: row.date, affected: false, activeSessions: 0 }
      clusters.push(current)
    }
    current.end = row.date; current.activeSessions++
    current.affected ||= zeroRows[index].gasPosition !== candidateRows[index].gasPosition
    lastActive = index
  })
  return { totalIndependentBaselineEpisodes: clusters.length, affectedIndependentEpisodes: clusters.filter((row) => row.affected).length, clusters }
}
function metrics(rows) {
  let wealth = 1, peak = 1, maxDrawdownPct = 0
  for (const row of rows) { wealth *= 1 + row.netReturnPct / 100; peak = Math.max(peak, wealth); maxDrawdownPct = Math.min(maxDrawdownPct, (wealth / peak - 1) * 100) }
  return { sessions: rows.length, returnPct: (wealth - 1) * 100, maxDrawdownPct, activeSessions: rows.filter((row) => row.gasPosition).length }
}
export function selectThresholds({ candidates, rowsById, baseRows, fallbackRows, bootstrapOptions = {} }) {
  // The boundary is enforced here as well as in the CLI: later outcomes cannot enter fitting.
  const train = (rows) => rows.filter((row) => row.date >= '2021-01-01' && row.date <= '2023-12-31')
  const trainRows = Object.fromEntries(Object.entries(rowsById).map(([id, rows]) => [id, train(rows)]))
  const base = train(baseRows), fallback = train(fallbackRows), zeroId = 'storage-0-flow-0', zero = trainRows[zeroId]
  assert.ok(zero && zero.length === base.length && zero.length === fallback.length)
  const differences = {}
  for (const candidate of candidates) {
    assert.deepEqual(trainRows[candidate.id].map((row) => row.date), zero.map((row) => row.date))
    if (candidate.id !== zeroId) differences[candidate.id] = trainRows[candidate.id].map((row, index) => Math.log1p(row.netReturnPct / 100) - Math.log1p(zero[index].netReturnPct / 100))
  }
  const bootstrap = pairedThresholdBootstrap(differences, bootstrapOptions)
  const evidence = candidates.map((candidate) => {
    const rows = trainRows[candidate.id], result = metrics(rows), stat = bootstrap.rows.find((row) => row.id === candidate.id)
    const years = ['2021', '2022', '2023'].map((year) => {
      const subset = (series) => series.filter((row) => row.date.startsWith(year))
      const own = metrics(subset(rows)).returnPct, unfiltered = metrics(subset(base)).returnPct, bench = metrics(subset(fallback)).returnPct
      return { year, returnPct: own, excessVsUnfilteredPct: own - unfiltered, excessVsFallbackPct: own - bench }
    })
    const episodes = affectedEpisodes(base, zero, rows)
    const excessVsUnfilteredPct = result.returnPct - metrics(base).returnPct, excessVsFallbackPct = result.returnPct - metrics(fallback).returnPct
    const positiveYears = years.filter((row) => row.excessVsUnfilteredPct > 0 && row.excessVsFallbackPct > 0).length
    const eligible = candidate.id !== zeroId && stat.simultaneousLower > 0 && !stat.zeroVariance && excessVsUnfilteredPct > 0 && excessVsFallbackPct > 0 && positiveYears >= 2 && episodes.affectedIndependentEpisodes >= 10
    return { ...candidate, ...result, excessVsUnfilteredPct, excessVsFallbackPct, positiveYears, years, episodes, bootstrap: stat ?? null, eligible }
  })
  const eligible = evidence.filter((row) => row.eligible).sort((a, b) => b.bootstrap.meanDailyLogExcess - a.bootstrap.meanDailyLogExcess)
  let selectedCandidateId = zeroId, plateau = []
  if (eligible.length) {
    const best = eligible[0]
    plateau = eligible.filter((candidate) => {
      const pairedDifference = bootstrap.bootstrapMeans[best.id].map((value, index) => value - bootstrap.bootstrapMeans[candidate.id][index])
      return best.bootstrap.meanDailyLogExcess - candidate.bootstrap.meanDailyLogExcess <= sd(pairedDifference) + 1e-14
    }).sort((a, b) => a.storageIndex + a.flowIndex - b.storageIndex - b.flowIndex || a.storageIndex - b.storageIndex || a.flowIndex - b.flowIndex)
    selectedCandidateId = plateau[0].id
  }
  return { selectedCandidateId, bestThresholdIdentified: eligible.length > 0, selectionReason: eligible.length ? 'Simplest candidate on training-best one-paired-standard-error plateau, satisfying all frozen evidence requirements.' : 'No nonzero threshold meets all frozen identification requirements. Zero/zero retained as economic convention, not proven optimum.', selectedThresholds: candidates.find((row) => row.id === selectedCandidateId), plateauIds: plateau.map((row) => row.id), evidence, uncertainty: { ...bootstrap, bootstrapMeans: undefined } }
}

async function main() {
  const root = process.cwd(), output = '.local/qore/research/ngas-supply-thresholds', source = '.local/qore/research/ngas-simplification'
  const inputFiles = new Set(['scripts/research-ngas-supply-thresholds.mjs', 'scripts/test-qore-supply-thresholds.mjs', 'docs/research/ngas-supply-threshold-protocol.json', 'scripts/lib/qore-simplification-demand.mjs', 'scripts/lib/eia-release-time.mjs', 'scripts/lib/qore-signal-availability.mjs', 'scripts/lib/qore-research-execution.mjs', 'config/qore-research-execution.json'])
  const json = (file) => { inputFiles.add(file); return JSON.parse(fs.readFileSync(file, 'utf8')) }
  const csv = (file) => { inputFiles.add(file); const parsed = Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true }); assert.equal(parsed.errors.length, 0); return parsed.data }
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n')
  const protocol = json('docs/research/ngas-supply-threshold-protocol.json')
  fs.mkdirSync(output, { recursive: true })
  const localProtocol = path.join(output, 'preregistration.json')
  if (!fs.existsSync(localProtocol)) fs.writeFileSync(localProtocol, JSON.stringify(protocol, null, 2) + '\n', { flag: 'wx' })
  assert.deepEqual(json(localProtocol), protocol)
  const targets = csv(`${source}/targets.csv`).filter((row) => row.candidateId === 'no-summer-fade' && row.date <= protocol.splits.holdoutEnd).map((row) => ({ ...row, gasPosition: Number(row.gasPosition), indexFraction: Number(row.indexFraction), summerGasPosition: Number(row.summerGasPosition), summerIndexFraction: Number(row.summerIndexFraction) }))
  const supply = json(`${source}/supply-vintages/observations.json`).filter((row) => row.releasedAt < '2026-01-01')
  const storage = csv('data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv').filter((row) => row.date < '2026-01-01')
  const releasePath = 'data/qore/fundamentals/eia/working-gas-storage-release-calendar.json'
  inputFiles.add(releasePath)
  const calendar = loadEiaStorageReleaseCalendar(releasePath)
  const features = targets.filter((row) => row.summerGasPosition > 0 || (Number(row.date.slice(5, 7)) >= 5 && Number(row.date.slice(5, 7)) <= 9)).map((row) => {
    const vintage = latestSupplyVintage(supply, row.date)
    assert.ok(vintage && Number.isFinite(vintage.productionYoYChangeBcfd) && Number.isFinite(vintage.lngYoYChangeBcfd), `Missing supply ${row.date}`)
    return { date: row.date, ...thresholdStorageContext(storage, row.date, calendar), supplyReleaseDate: vintage.releasedAt, supplyMonth: vintage.month, flowPressureBcfd: vintage.productionYoYChangeBcfd - vintage.lngYoYChangeBcfd, productionYoYChangeBcfd: vintage.productionYoYChangeBcfd, lngYoYChangeBcfd: vintage.lngYoYChangeBcfd }
  })
  const grid = deriveThresholdGrid(features)
  // Freeze feature-derived grid before loading market return inputs.
  write('feature-grid-lock.json', { generatedAt: new Date().toISOString(), derivedFromReturns: false, trainEnd: protocol.splits.trainEnd, ...grid })
  write('features.json', features)
  console.log(JSON.stringify({ phase: 'feature-grid-locked-before-outcomes', ...grid.sample, storageThresholdsPct: grid.storageThresholdsPct, flowThresholdsBcfd: grid.flowThresholdsBcfd }))
  const featureByDate = new Map(features.map((row) => [row.date, row])), targetByDate = new Map(targets.map((row) => [row.date, row]))
  const contract = loadResearchExecutionContract(root)
  for (const symbol of ['UNG', 'VOO', 'QQQM']) inputFiles.add(`data/qore/market/yahoo/${symbol}-daily.csv`)
  const simulate = (candidate, lane, scenarioId, endDate) => {
    const days = loadExecutionCalendar(root, { startDate: targets[0].date, endDate, contract })
    let state = createExecutionState(contract), equity = 100000
    return days.map((day) => {
      const target = targetByDate.get(day.date)
      assert.ok(target)
      let gasPosition = lane === 'fallback' ? 0 : lane === 'summer-only' ? target.summerGasPosition : target.gasPosition
      let indexFraction = lane === 'fallback' ? 1 : lane === 'summer-only' ? target.summerIndexFraction : target.indexFraction
      const suppressed = candidate && target.summerGasPosition > 0 && !thresholdAllowsLong(featureByDate.get(day.date), candidate)
      if (suppressed) { gasPosition = 0; indexFraction = 1 }
      const step = applyExecutionStep({ state, day, targetWeights: targetWeightsForAllocation(contract, { gasPosition, investedIndexFraction: indexFraction }), contract, scenarioId })
      equity *= 1 + step.netReturnPct / 100; state = step.state
      return { candidateId: candidate?.id ?? (lane === 'fallback' ? 'fallback' : 'unfiltered-no-shorts'), lane, scenarioId, date: day.date, gasPosition, indexFraction, suppressed: Boolean(suppressed), netReturnPct: step.netReturnPct, costPct: step.tradingCostPct + step.borrowCostPct, equity }
    })
  }
  const baseTrain = simulate(null, 'summer-only', 'baseline', protocol.splits.trainEnd), fallbackTrain = simulate(null, 'fallback', 'baseline', protocol.splits.trainEnd)
  const trainRows = Object.fromEntries(grid.candidates.map((candidate) => [candidate.id, simulate(candidate, 'summer-only', 'baseline', protocol.splits.trainEnd)]))
  const selection = selectThresholds({ candidates: grid.candidates, rowsById: trainRows, baseRows: baseTrain, fallbackRows: fallbackTrain, bootstrapOptions: protocol.uncertainty })
  write('selection-lock.json', { lockedAt: new Date().toISOString(), validationOrHoldoutConsulted: false, ...selection })
  console.log(JSON.stringify({ phase: 'training-selection-locked', selectedThresholds: selection.selectedThresholds, bestThresholdIdentified: selection.bestThresholdIdentified, selectionReason: selection.selectionReason }))
  const daily = [], results = []
  const periods = { train: (row) => row.date <= protocol.splits.trainEnd, validation: (row) => row.date >= protocol.splits.validationStart && row.date <= protocol.splits.validationEnd, holdout2025: (row) => row.date >= protocol.splits.holdoutStart, ...Object.fromEntries(['2021', '2022', '2023'].map((year) => [year, (row) => row.date.startsWith(year)])) }
  for (const scenarioId of Object.keys(contract.scenarios)) for (const lane of ['summer-only', 'all-year']) {
    const fallback = simulate(null, 'fallback', scenarioId, protocol.splits.holdoutEnd), unfiltered = simulate(null, lane, scenarioId, protocol.splits.holdoutEnd)
    daily.push(...fallback, ...unfiltered)
    for (const candidate of grid.candidates) {
      const rows = simulate(candidate, lane, scenarioId, protocol.splits.holdoutEnd)
      daily.push(...rows)
      for (const [period, predicate] of Object.entries(periods)) {
        const m = metrics(rows.filter(predicate)), f = metrics(fallback.filter(predicate)), u = metrics(unfiltered.filter(predicate))
        results.push({ candidateId: candidate.id, lane, scenarioId, period, ...m, fallbackReturnPct: f.returnPct, excessVsFallbackPct: m.returnPct - f.returnPct, unfilteredReturnPct: u.returnPct, excessVsUnfilteredPct: m.returnPct - u.returnPct })
      }
    }
  }
  const validation = results.find((row) => row.candidateId === selection.selectedCandidateId && row.scenarioId === 'baseline' && row.lane === 'summer-only' && row.period === 'validation')
  const zeroValidation = results.find((row) => row.candidateId === 'storage-0-flow-0' && row.scenarioId === 'baseline' && row.lane === 'summer-only' && row.period === 'validation')
  const confirmedOptimization = selection.bestThresholdIdentified && validation.returnPct > zeroValidation.returnPct && validation.excessVsUnfilteredPct > 0 && validation.excessVsFallbackPct > 0
  const operationalCandidate = confirmedOptimization ? selection.selectedThresholds : grid.candidates[0]
  fs.writeFileSync(path.join(output, 'daily-returns.csv'), Papa.unparse(daily) + '\n')
  fs.writeFileSync(path.join(output, 'results.csv'), Papa.unparse(results) + '\n')
  const hashes = [...inputFiles].map((file) => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }))
  const summary = { studyId: protocol.studyId, generatedAt: new Date().toISOString(), executionEligible: false, no2026Fitting: true, protocol, grid, selection, validation, confirmedOptimization, operationalRecommendation: { ...operationalCandidate, rationale: confirmedOptimization ? 'Training statistical replacement supported and validation confirms improvement.' : 'No sufficiently supported optimized replacement. Keep economic zero/zero convention; this is not an estimated universal optimum.' }, results, inputBindings: hashes }
  write('summary.json', summary)
  fs.writeFileSync('data/qore/research/ngas-supply-threshold-audit.json', JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ phase: 'finished', operationalRecommendation: summary.operationalRecommendation, validation, holdout: results.find((row) => row.candidateId === operationalCandidate.id && row.scenarioId === 'baseline' && row.lane === 'summer-only' && row.period === 'holdout2025') }, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main()
