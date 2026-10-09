#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import {
  applyExecutionStep,
  createExecutionState,
  loadExecutionCalendar,
  loadResearchExecutionContract,
  targetWeightsForAllocation,
} from './lib/qore-research-execution.mjs'
import {
  eiaStorageReleaseAt,
  loadEiaStorageReleaseCalendar,
} from './lib/eia-release-time.mjs'
import {
  EXTREME_HEAT_CANDIDATE_FAMILY,
  EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
  EXTREME_HEAT_EVALUATION_SCHEMA_VERSION,
  EXTREME_HEAT_FOCAL_CANDIDATE_IDS,
  EXTREME_HEAT_SHADOW,
  EXTREME_HEAT_SHADOW_DIGEST_SHA256,
  buildExtremeHeatCausalStorageContext,
  buildExtremeHeatNearestPeriodStorageContext,
  buildExtremeHeatPriceContexts,
  evaluateExtremeHeatCandidate,
  extremeHeatStorageSeasonalWeek,
  extremeHeatValueDigestSha256,
  isExtremeHeatRow,
  requireExtremeHeatFiveYearStorageContext,
} from './lib/qore-extreme-heat-shadow.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const SELECTED_TRADES_PATH = path.join(
  REPO_ROOT,
  EXTREME_HEAT_SHADOW.comparator.selectedTradesPath,
)
const NG_SIGNAL_MARKET_PATH = path.join(
  REPO_ROOT,
  EXTREME_HEAT_SHADOW.comparator.ngSignalMarketPath,
)
const RUN_SUMMARY_PATH = path.join(
  REPO_ROOT,
  EXTREME_HEAT_SHADOW.comparator.runSummaryPath,
)
const STORAGE_PATH = path.join(REPO_ROOT, EXTREME_HEAT_SHADOW.storageContext.sourcePath)
const RELEASE_CALENDAR_PATH = path.join(
  REPO_ROOT,
  EXTREME_HEAT_SHADOW.storageContext.releaseCalendarPath,
)
const SELECTION_PREFIX_END = EXTREME_HEAT_SHADOW.evaluation.selectionPrefixEnd
const DEFAULT_BOOTSTRAP_ITERATIONS = 10_000
const BOOTSTRAP_BLOCK_LENGTHS = Object.freeze([1, 5, 10, 20, 60])
const EPISODE_EMBARGO_SESSIONS = 10

function argumentValue(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function outputPathFromArguments() {
  const raw = argumentValue('output')
  if (!raw) return null
  const outputPath = path.resolve(REPO_ROOT, raw)
  const allowedRoots = [
    path.join(REPO_ROOT, 'data/qore/research'),
    path.join(REPO_ROOT, '.local/qore/research'),
  ]
  if (!allowedRoots.some((root) => outputPath === root || outputPath.startsWith(`${root}${path.sep}`))) {
    throw new Error('--output must stay under data/qore/research or .local/qore/research.')
  }
  return outputPath
}

function bootstrapIterationsFromArguments() {
  const raw = argumentValue('bootstrap-iterations')
  if (raw === undefined) return DEFAULT_BOOTSTRAP_ITERATIONS
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 100 || value > 1_000_000) {
    throw new Error('--bootstrap-iterations must be an integer from 100 through 1000000.')
  }
  return value
}

function parseCsv(filePath) {
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })
  if (parsed.errors.length) {
    throw new Error(`${path.relative(REPO_ROOT, filePath)}: ${parsed.errors[0].message}`)
  }
  return parsed.data
}

function numberFrom(value, fallback = Number.NaN) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  )
}

function metrics(rows, comparatorByDate = null) {
  if (!rows.length) {
    return {
      sessions: 0,
      totalReturnPct: 0,
      cagrPct: 0,
      annualVolPct: 0,
      sharpe: 0,
      maxDrawdownPct: 0,
      turnover: 0,
      incrementalDailySumPct: 0,
    }
  }
  const returns = rows.map((row) => row.netReturnPct / 100)
  const dailyAverage = mean(returns)
  const annualVolatility = sampleStandardDeviation(returns) * Math.sqrt(252)
  let equity = 1
  let peak = 1
  let maximumDrawdownPct = 0
  for (const value of returns) {
    equity *= 1 + value
    peak = Math.max(peak, equity)
    maximumDrawdownPct = Math.min(maximumDrawdownPct, (equity / peak - 1) * 100)
  }
  return {
    sessions: rows.length,
    totalReturnPct: round((equity - 1) * 100),
    cagrPct: round((equity ** (252 / rows.length) - 1) * 100),
    annualVolPct: round(annualVolatility * 100),
    sharpe: round(annualVolatility ? dailyAverage * 252 / annualVolatility : 0),
    maxDrawdownPct: round(maximumDrawdownPct),
    turnover: round(rows.reduce((sum, row) => sum + row.turnover, 0)),
    incrementalDailySumPct: comparatorByDate
      ? round(rows.reduce(
        (sum, row) => sum + row.netReturnPct - comparatorByDate.get(row.date).netReturnPct,
        0,
      ))
      : 0,
  }
}

function periodRows(rows, startDate = '', endDate = '9999-12-31') {
  return rows.filter((row) => (!startDate || row.date >= startDate) && row.date <= endDate)
}

function summarizePeriods(rows, comparatorByDate = null) {
  return {
    development2021To2023: metrics(
      periodRows(rows, '2021-01-01', '2023-12-31'),
      comparatorByDate,
    ),
    selectionAndTuning2024: metrics(
      periodRows(rows, '2024-01-01', '2024-12-31'),
      comparatorByDate,
    ),
    reportOnly2025: metrics(
      periodRows(rows, '2025-01-01', '2025-12-31'),
      comparatorByDate,
    ),
    observed2026ThroughComparatorEnd: metrics(
      periodRows(rows, '2026-01-01'),
      comparatorByDate,
    ),
    selectionPrefix: metrics(
      periodRows(rows, '', SELECTION_PREFIX_END),
      comparatorByDate,
    ),
    full: metrics(rows, comparatorByDate),
  }
}

function eventAgesByDate(rows) {
  const groups = new Map()
  for (const row of rows.filter(({ thesisKind }) => thesisKind === 'summer-heat-long')) {
    const key = `${row.issueDate}|${row.targetDate}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const result = new Map()
  for (const eventRows of groups.values()) {
    eventRows
      .toSorted((left, right) => left.entryTradeDate.localeCompare(right.entryTradeDate))
      .forEach((row, index) => result.set(row.entryTradeDate, index))
  }
  return result
}

function simulate({
  executionDays,
  selectedByDate,
  executionContract,
  candidate = null,
  priceContextByIssue,
  eventAgeByDate,
  storageContextByDate,
  scenarioId = executionContract.selectionScenarioId,
}) {
  let state = createExecutionState(executionContract)
  const daily = []
  for (const day of executionDays) {
    const selected = selectedByDate.get(day.date)
    const selectedGasPosition = numberFrom(selected.ungPosition, 0)
    const storageContext = storageContextByDate.get(day.date)
    const candidateRow = {
      ...selected,
      storageSeasonalDiffPct: storageContext?.available
        ? storageContext.storageDeviationPct
        : null,
    }
    const priceContext = priceContextByIssue.get(selected.issueDate)
    const decision = candidate
      ? evaluateExtremeHeatCandidate({
        row: candidateRow,
        candidate,
        eventAgeSessions: eventAgeByDate.get(day.date) ?? 0,
        priceContext,
      })
      : {
        gasPosition: selectedGasPosition,
        investedIndexFraction: 1 - Math.abs(selectedGasPosition),
        changed: false,
        scale: 1,
        reason: 'active-all-year-comparator',
      }
    const step = applyExecutionStep({
      state,
      day,
      targetWeights: targetWeightsForAllocation(executionContract, decision),
      contract: executionContract,
      scenarioId,
    })
    state = step.state
    daily.push({
      date: day.date,
      year: day.date.slice(0, 4),
      componentStrategyId: selected.componentStrategyId,
      thesisKind: selected.thesisKind,
      issueDate: selected.issueDate,
      targetDate: selected.targetDate,
      selectedGasPosition,
      shadowGasPosition: decision.gasPosition,
      extremeHeat: candidate ? isExtremeHeatRow(candidateRow, candidate) : false,
      eventAgeSessions: eventAgeByDate.get(day.date) ?? null,
      storageSeasonalDiffPct: storageContext?.storageDeviationPct ?? null,
      storagePeerCount: storageContext?.peerCount ?? 0,
      priceSessionDate: priceContext?.priceSessionDate ?? null,
      issueSessionNgReturnPct: priceContext?.issueSessionReturnPct ?? null,
      threeSessionNgReturnPct: priceContext?.priorReturnsPct?.[3] ?? null,
      changedTarget: decision.changed,
      decisionReason: decision.reason,
      netReturnPct: step.netReturnPct,
      turnover: step.totalTurnover,
    })
  }
  return daily
}

function changedForecastSummary(daily) {
  const changed = daily.filter((row) => row.changedTarget)
  const byForecast = new Map()
  for (const row of changed) {
    const key = `${row.issueDate}|${row.targetDate}`
    const current = byForecast.get(key) ?? {
      issueDate: row.issueDate,
      targetDate: row.targetDate,
      dates: [],
    }
    current.dates.push(row.date)
    byForecast.set(key, current)
  }
  const episodes = [...byForecast.values()]
    .toSorted((left, right) => left.issueDate.localeCompare(right.issueDate))
  const changedSessionReasons = Object.fromEntries(
    [...new Set(changed.map((row) => row.decisionReason))].sort().map((reason) => [
      reason,
      changed.filter((row) => row.decisionReason === reason).length,
    ]),
  )
  const forecastEpisodesByReason = Object.fromEntries(
    [...new Set(changed.map((row) => row.decisionReason))].sort().map((reason) => [
      reason,
      new Set(changed
        .filter((row) => row.decisionReason === reason)
        .map((row) => `${row.issueDate}|${row.targetDate}`)).size,
    ]),
  )
  return {
    changedSessionCount: changed.length,
    forecastEpisodeCount: episodes.length,
    changedSessionReasons,
    forecastEpisodesByReason,
    episodes,
  }
}

function deriveChangedEpisodes(candidateRows, baselineRows) {
  if (candidateRows.length !== baselineRows.length) {
    throw new Error('Extreme-heat episode inputs are not aligned.')
  }
  const increments = candidateRows.map(
    (row, index) => row.netReturnPct - baselineRows[index].netReturnPct,
  )
  const episodes = []
  let lastMaterialIndex = Number.NEGATIVE_INFINITY
  candidateRows.forEach((row, index) => {
    const material = row.changedTarget || Math.abs(increments[index]) > 1e-12
    if (material) {
      const separated = index - lastMaterialIndex > EPISODE_EMBARGO_SESSIONS + 1
      if (!episodes.length || separated) {
        episodes.push({ startIndex: index, endIndex: index })
      } else {
        episodes.at(-1).endIndex = index
      }
      lastMaterialIndex = index
    }
  })
  const summarized = episodes.map((episode) => ({
    startDate: candidateRows[episode.startIndex].date,
    endDate: candidateRows[episode.endIndex].date,
    changedTargetCount: candidateRows
      .slice(episode.startIndex, episode.endIndex + 1)
      .filter((row) => row.changedTarget).length,
    incrementalDailySumPct: round(
      increments
        .slice(episode.startIndex, episode.endIndex + 1)
        .reduce((sum, value) => sum + value, 0),
    ),
  }))
  const ranked = summarized.toSorted(
    (left, right) => right.incrementalDailySumPct - left.incrementalDailySumPct,
  )
  const total = increments.reduce((sum, value) => sum + value, 0)
  const attributed = summarized.reduce(
    (sum, episode) => sum + episode.incrementalDailySumPct,
    0,
  )
  const positiveTotal = summarized
    .filter((episode) => episode.incrementalDailySumPct > 0)
    .reduce((sum, episode) => sum + episode.incrementalDailySumPct, 0)
  return {
    method:
      'Every nonzero causal execution difference attributable to a changed target, clustered within the production 10-session embargo so unwind and deadband tails reconcile exactly.',
    embargoSessions: EPISODE_EMBARGO_SESSIONS,
    independentEpisodeCount: summarized.length,
    changedTargetCount: candidateRows.filter((row) => row.changedTarget).length,
    positiveEpisodes: summarized.filter((episode) => episode.incrementalDailySumPct > 0).length,
    negativeEpisodes: summarized.filter((episode) => episode.incrementalDailySumPct < 0).length,
    topEpisodePositiveContributionShare: round(
      positiveTotal > 0
        ? Math.max(0, ranked[0]?.incrementalDailySumPct ?? 0) / positiveTotal
        : 0,
    ),
    incrementalSumAfterRemovingBestEpisodePct: round(
      total - (ranked[0]?.incrementalDailySumPct ?? 0),
    ),
    incrementalSumAfterRemovingBestThreeEpisodesPct: round(
      total - ranked.slice(0, 3).reduce(
        (sum, episode) => sum + episode.incrementalDailySumPct,
        0,
      ),
    ),
    totalIncrementalDailySumPct: round(total),
    attributedIncrementalDailySumPct: round(attributed),
    unattributedIncrementalDailySumPct: round(total - attributed, 9),
    episodes: ranked,
  }
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function circularSums(values, blockLength) {
  return values.map((_, start) => {
    let sum = 0
    for (let offset = 0; offset < blockLength; offset += 1) {
      sum += values[(start + offset) % values.length]
    }
    return sum
  })
}

function fixedCandidateBootstrap(values, blockLength, iterations) {
  if (!values.length) return { blockLength, iterations, pValue: 1 }
  const observedMean = mean(values)
  const centered = values.map((value) => value - observedMean)
  const fullBlocks = Math.floor(values.length / blockLength)
  const remainder = values.length % blockLength
  const blockSums = circularSums(centered, blockLength)
  const remainderSums = remainder ? circularSums(centered, remainder) : []
  const random = seededRandom(0x9e3779b9 ^ blockLength ^ values.length)
  let exceedances = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0
    for (let block = 0; block < fullBlocks; block += 1) {
      total += blockSums[Math.floor(random() * values.length)]
    }
    if (remainder) total += remainderSums[Math.floor(random() * values.length)]
    if (total / values.length >= observedMean) exceedances += 1
  }
  return {
    blockLength,
    iterations,
    observedAverageDailyIncrementPct: round(observedMean, 8),
    pValue: round((exceedances + 1) / (iterations + 1)),
  }
}

function familyAdjustedBootstrap(matrix, blockLength, iterations) {
  const count = matrix[0]?.values.length ?? 0
  if (!count || !matrix.every(({ values }) => values.length === count)) {
    throw new Error('Extreme-heat family bootstrap inputs are empty or misaligned.')
  }
  const observed = matrix
    .map(({ candidateId, values }) => ({ candidateId, average: mean(values) }))
    .toSorted((left, right) => right.average - left.average
      || left.candidateId.localeCompare(right.candidateId))
  const winner = observed[0]
  const centered = matrix.map(({ candidateId, values }) => {
    const average = mean(values)
    const centeredValues = values.map((value) => value - average)
    return {
      candidateId,
      blockSums: circularSums(centeredValues, blockLength),
      remainderSums: count % blockLength
        ? circularSums(centeredValues, count % blockLength)
        : [],
    }
  })
  const random = seededRandom(0x7f4a7c15 ^ blockLength ^ matrix.length)
  const fullBlocks = Math.floor(count / blockLength)
  const remainder = count % blockLength
  let exceedances = 0
  const candidateExceedances = Object.fromEntries(
    observed.map(({ candidateId }) => [candidateId, 0]),
  )
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const starts = Array.from({ length: fullBlocks }, () => Math.floor(random() * count))
    const remainderStart = remainder ? Math.floor(random() * count) : 0
    let maximumNullMean = Number.NEGATIVE_INFINITY
    for (const candidate of centered) {
      let total = starts.reduce((sum, start) => sum + candidate.blockSums[start], 0)
      if (remainder) total += candidate.remainderSums[remainderStart]
      maximumNullMean = Math.max(maximumNullMean, total / count)
    }
    if (maximumNullMean >= winner.average) exceedances += 1
    for (const candidate of observed) {
      if (maximumNullMean >= candidate.average) {
        candidateExceedances[candidate.candidateId] += 1
      }
    }
  }
  return {
    candidateCount: matrix.length,
    iterations,
    blockLength,
    observedWinnerId: winner.candidateId,
    observedWinnerAverageDailyIncrementPct: round(winner.average, 8),
    pValue: round((exceedances + 1) / (iterations + 1)),
    candidatePValues: Object.fromEntries(observed.map(({ candidateId }) => [
      candidateId,
      round((candidateExceedances[candidateId] + 1) / (iterations + 1)),
    ])),
  }
}

function episodeSignFlipTest(episodeSummary) {
  const values = episodeSummary.episodes.map((episode) => episode.incrementalDailySumPct)
  if (!values.length) return { episodeCount: 0, permutations: 0, pValue: 1 }
  if (values.length > 20) {
    throw new Error('Extreme-heat exact episode sign-flip test is limited to 20 episodes.')
  }
  const observed = values.reduce((sum, value) => sum + value, 0)
  const permutations = 2 ** values.length
  let exceedances = 0
  for (let mask = 0; mask < permutations; mask += 1) {
    let total = 0
    values.forEach((value, index) => {
      total += (mask & (1 << index)) ? value : -value
    })
    if (total >= observed - 1e-12) exceedances += 1
  }
  return {
    episodeCount: values.length,
    permutations,
    observedIncrementalDailySumPct: round(observed),
    oneSidedPValue: round(exceedances / permutations),
  }
}

function leaveOneChangedYear(daily, baselineByDate) {
  const changedYears = [...new Set(
    daily.filter((row) => row.changedTarget).map((row) => row.year),
  )].sort()
  return changedYears.map((excludedYear) => ({
    excludedYear,
    remainingIncrementalDailySumPct: round(daily
      .filter((row) => row.year !== excludedYear)
      .reduce(
        (sum, row) => sum + row.netReturnPct - baselineByDate.get(row.date).netReturnPct,
        0,
      )),
  }))
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function assertDigest(filePath, expectedDigestSha256, label) {
  const actual = sha256File(filePath)
  if (actual !== expectedDigestSha256) {
    throw new Error(`${label} digest no longer matches the frozen extreme-heat comparator contract.`)
  }
}

function binding(role, relativePath) {
  const filePath = path.join(REPO_ROOT, relativePath)
  return {
    role,
    path: relativePath,
    digestSha256: sha256File(filePath),
    byteLength: fs.statSync(filePath).size,
  }
}

function storageCausalAudit(rows, contextsByDate) {
  const checked = rows.filter((row) => (
    row.thesisKind === 'summer-heat-long'
    && numberFrom(row.coolingDemandAnomalyF) >= 8
    && numberFrom(row.coolingDemandExtremeCount) >= 8
  ))
  const mismatches = []
  for (const row of checked) {
    const context = contextsByDate.get(row.entryTradeDate)
    const checks = [
      ['storageDate', row.storageDate, context?.storageDate],
      ['storageReleaseAt', row.storageReleaseAt, context?.storageReleaseAt],
      ['storageBcf', numberFrom(row.storageBcf), context?.storageBcf, 0.0051],
      [
        'storageSeasonalAverageBcf',
        numberFrom(row.storageSeasonalAverageBcf),
        context?.seasonalAverageBcf,
        0.0101,
      ],
      [
        'storageSeasonalDiffPct',
        numberFrom(row.storageSeasonalDiffPct),
        context?.storageDeviationPct,
        0.00011,
      ],
    ]
    for (const [field, embedded, recomputed, tolerance = 0] of checks) {
      const matches = typeof embedded === 'number'
        ? Number.isFinite(recomputed) && Math.abs(embedded - recomputed) <= tolerance
        : embedded === recomputed
      if (!matches) {
        mismatches.push({
          date: row.entryTradeDate,
          field,
          embedded,
          recomputed: recomputed ?? null,
        })
      }
    }
  }
  if (mismatches.length) {
    throw new Error(
      `Extreme-heat storage causal replay has ${mismatches.length} mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`,
    )
  }
  return {
    checkedExtremeHeatSessions: checked.length,
    mismatches: 0,
    minimumPeerCount: Math.min(...checked.map(
      (row) => contextsByDate.get(row.entryTradeDate)?.peerCount ?? 0,
    )),
    maximumPeerCount: Math.max(...checked.map(
      (row) => contextsByDate.get(row.entryTradeDate)?.peerCount ?? 0,
    )),
    valueVintagePolicy: EXTREME_HEAT_SHADOW.storageContext.valueVintagePolicy,
  }
}

function priceCausalAudit(rows, exactIssueContexts, priorContexts) {
  const extremeRows = rows.filter((row) => (
    row.thesisKind === 'summer-heat-long'
    && numberFrom(row.coolingDemandAnomalyF) >= 8
    && numberFrom(row.coolingDemandExtremeCount) >= 8
  ))
  const uniqueIssues = [...new Set(extremeRows.map((row) => row.issueDate))].sort()
  const exactUnavailable = uniqueIssues
    .map((issueDate) => exactIssueContexts.get(issueDate))
    .filter((context) => !context?.available)
  const missingThreeSession = uniqueIssues
    .map((issueDate) => priorContexts.get(issueDate))
    .filter((context) => !Number.isFinite(context?.priorReturnsPct?.[3]))
  const timingFailures = extremeRows.filter((row) => {
    const exactContext = exactIssueContexts.get(row.issueDate)
    const priorContext = priorContexts.get(row.issueDate)
    return row.issueDate >= row.entryTradeDate
      || !priorContext?.priceSessionDate
      || priorContext.priceSessionDate > row.issueDate
      || (
        exactContext?.available
        && exactContext.priceSessionDate !== row.issueDate
      )
  })
  if (missingThreeSession.length || timingFailures.length) {
    throw new Error('Extreme-heat price contexts failed completeness or causal timing checks.')
  }
  const priorSessionMappings = uniqueIssues
    .map((issueDate) => priorContexts.get(issueDate))
    .filter((context) => !context.issueDateHasAuthoritativeSession)
    .map((context) => ({
      issueDate: context.issueDate,
      priceSessionDate: context.priceSessionDate,
      interpretation: 'preceding-session-anticipatory-pricing-proxy',
    }))
  return {
    extremeHeldSessionCount: extremeRows.length,
    extremeForecastEpisodeCount: uniqueIssues.length,
    completeExactIssueReturnContexts: uniqueIssues.length - exactUnavailable.length,
    unavailableExactIssueReturnContexts: exactUnavailable.length,
    unavailableExactIssueDates: exactUnavailable.map((context) => context.issueDate),
    completeThreeSessionContexts: uniqueIssues.length - missingThreeSession.length,
    precedingSessionMappingCount: priorSessionMappings.length,
    precedingSessionMappings: priorSessionMappings,
    causalTimingFailures: timingFailures.length,
  }
}

function metricDeltas(candidatePeriods, comparatorPeriods) {
  return Object.fromEntries(Object.keys(candidatePeriods).map((period) => [
    period,
    {
      totalReturnPct: round(
        candidatePeriods[period].totalReturnPct - comparatorPeriods[period].totalReturnPct,
      ),
      cagrPct: round(candidatePeriods[period].cagrPct - comparatorPeriods[period].cagrPct),
      annualVolPct: round(
        candidatePeriods[period].annualVolPct - comparatorPeriods[period].annualVolPct,
      ),
      sharpe: round(candidatePeriods[period].sharpe - comparatorPeriods[period].sharpe),
      maxDrawdownPct: round(
        candidatePeriods[period].maxDrawdownPct - comparatorPeriods[period].maxDrawdownPct,
      ),
      turnover: round(
        candidatePeriods[period].turnover - comparatorPeriods[period].turnover,
      ),
    },
  ]))
}

const outputPath = outputPathFromArguments()
const bootstrapIterations = bootstrapIterationsFromArguments()
if (
  outputPath?.startsWith(`${path.join(REPO_ROOT, 'data/qore/research')}${path.sep}`)
  && bootstrapIterations !== DEFAULT_BOOTSTRAP_ITERATIONS
) {
  throw new Error('Versioned extreme-heat output requires the canonical 10000 bootstrap iterations.')
}

assertDigest(
  SELECTED_TRADES_PATH,
  EXTREME_HEAT_SHADOW.comparator.selectedTradesDigestSha256,
  'Selected-trades comparator',
)
assertDigest(
  RUN_SUMMARY_PATH,
  EXTREME_HEAT_SHADOW.comparator.runSummaryDigestSha256,
  'All-year run summary',
)
assertDigest(
  NG_SIGNAL_MARKET_PATH,
  EXTREME_HEAT_SHADOW.comparator.ngSignalMarketDigestSha256,
  'NG=F signal market input',
)
assertDigest(
  path.join(REPO_ROOT, EXTREME_HEAT_SHADOW.comparator.executionContractPath),
  EXTREME_HEAT_SHADOW.comparator.executionContractDigestSha256,
  'Research execution contract',
)
assertDigest(
  STORAGE_PATH,
  EXTREME_HEAT_SHADOW.storageContext.sourceDigestSha256,
  'EIA storage input',
)
assertDigest(
  RELEASE_CALENDAR_PATH,
  EXTREME_HEAT_SHADOW.storageContext.releaseCalendarDigestSha256,
  'EIA release calendar',
)

const runSummary = JSON.parse(fs.readFileSync(RUN_SUMMARY_PATH, 'utf8'))
if (
  runSummary.validation?.integrity?.sealedStrategyContractDigestSha256
  !== EXTREME_HEAT_SHADOW.comparator.sealedStrategyContractDigestSha256
) {
  throw new Error('The all-year sealed strategy contract no longer matches the shadow comparator.')
}
const executionContract = loadResearchExecutionContract(REPO_ROOT)
const selectedRows = parseCsv(SELECTED_TRADES_PATH)
if (!selectedRows.length) throw new Error('The extreme-heat comparator ledger is empty.')
selectedRows.forEach((row, index) => {
  if (!row.entryTradeDate || (index && row.entryTradeDate <= selectedRows[index - 1].entryTradeDate)) {
    throw new Error('The extreme-heat comparator ledger must have unique, strictly increasing dates.')
  }
})
const selectedByDate = new Map(selectedRows.map((row) => [row.entryTradeDate, row]))
const startDate = selectedRows[0]?.entryTradeDate
const endDate = selectedRows.at(-1)?.entryTradeDate
const executionDays = loadExecutionCalendar(REPO_ROOT, {
  startDate,
  endDate,
  contract: executionContract,
}).filter((day) => selectedByDate.has(day.date))
if (
  executionDays.length !== selectedRows.length
  || executionDays.some((day, index) => day.date !== selectedRows[index].entryTradeDate)
) {
  throw new Error('The extreme-heat comparator and authoritative execution session grids differ.')
}

const releaseCalendar = loadEiaStorageReleaseCalendar(new URL(`file://${RELEASE_CALENDAR_PATH}`))
const storageRows = parseCsv(STORAGE_PATH)
  .map((row) => ({
    date: row.date,
    year: Number(String(row.date).slice(0, 4)),
    seasonalWeek: extremeHeatStorageSeasonalWeek(row.date),
    storageBcf: numberFrom(row.storageBcf),
    releasedAt: eiaStorageReleaseAt(row.date, releaseCalendar),
  }))
  .filter((row) => row.releasedAt && Number.isFinite(row.storageBcf) && row.storageBcf > 0)
const heatLongDates = new Set(selectedRows
  .filter((row) => row.thesisKind === 'summer-heat-long')
  .map((row) => row.entryTradeDate))
const storageRelevantDays = executionDays.filter((day) => heatLongDates.has(day.date))
const storageContextByDate = new Map(storageRelevantDays.map((day) => [
  day.date,
  requireExtremeHeatFiveYearStorageContext(
    buildExtremeHeatCausalStorageContext(storageRows, day.date),
  ),
]))
const nearestStorageContextByDate = new Map(storageRelevantDays.map((day) => [
  day.date,
  requireExtremeHeatFiveYearStorageContext(
    buildExtremeHeatNearestPeriodStorageContext(storageRows, day.date),
  ),
]))
const issueDates = selectedRows.map((row) => row.issueDate).filter(Boolean)
const ngMarketRows = parseCsv(NG_SIGNAL_MARKET_PATH)
const authoritativeSessionDates = executionDays.map((day) => day.date)
const priorPriceContextByIssue = buildExtremeHeatPriceContexts({
  issueDates,
  marketRows: ngMarketRows,
  authoritativeSessionDates,
})
const exactIssuePriceContextByIssue = buildExtremeHeatPriceContexts({
  issueDates,
  marketRows: ngMarketRows,
  authoritativeSessionDates,
  requireExactIssueSession: true,
})
const oneSessionLagPriorPriceContextByIssue = buildExtremeHeatPriceContexts({
  issueDates,
  marketRows: ngMarketRows,
  authoritativeSessionDates,
  lagSessions: 1,
})
const oneSessionLagExactIssuePriceContextByIssue = buildExtremeHeatPriceContexts({
  issueDates,
  marketRows: ngMarketRows,
  authoritativeSessionDates,
  lagSessions: 1,
  requireExactIssueSession: true,
})
function priceContextsForCandidate(candidate, lagged = false) {
  const usesExactIssueSession = new Set([
    'issue-price-threshold',
    'unexpected-proxy',
    'priced-surplus-fade',
  ]).has(candidate?.treatment)
  if (usesExactIssueSession) {
    return lagged
      ? oneSessionLagExactIssuePriceContextByIssue
      : exactIssuePriceContextByIssue
  }
  return lagged ? oneSessionLagPriorPriceContextByIssue : priorPriceContextByIssue
}
const eventAgeByDate = eventAgesByDate(selectedRows)
const storageReplayAudit = storageCausalAudit(selectedRows, storageContextByDate)
const priceReplayAudit = priceCausalAudit(
  selectedRows,
  exactIssuePriceContextByIssue,
  priorPriceContextByIssue,
)

const baselineDaily = simulate({
  executionDays,
  selectedByDate,
  executionContract,
  priceContextByIssue: priorPriceContextByIssue,
  eventAgeByDate,
  storageContextByDate,
})
const baselineByDate = new Map(baselineDaily.map((row) => [row.date, row]))
const baselinePeriods = summarizePeriods(baselineDaily)
const maximumDailyBaselineTieOutErrorPct = Math.max(
  ...baselineDaily.map((row) => (
    Math.abs(row.netReturnPct - numberFrom(selectedByDate.get(row.date).netReturnPct))
  )),
)
if (maximumDailyBaselineTieOutErrorPct > 0.000051) {
  throw new Error(`Active all-year baseline replay failed by ${maximumDailyBaselineTieOutErrorPct} percentage points.`)
}

const candidateDaily = new Map()
const candidateSummaries = EXTREME_HEAT_CANDIDATE_FAMILY.map((candidate) => {
  const daily = simulate({
    executionDays,
    selectedByDate,
    executionContract,
    candidate,
    priceContextByIssue: priceContextsForCandidate(candidate),
    eventAgeByDate,
    storageContextByDate,
  })
  candidateDaily.set(candidate.candidateId, daily)
  const selectionDaily = periodRows(daily, '', SELECTION_PREFIX_END)
  const selectionBaseline = periodRows(baselineDaily, '', SELECTION_PREFIX_END)
  const fullEpisodeRobustness = deriveChangedEpisodes(daily, baselineDaily)
  const selectionEpisodeRobustness = deriveChangedEpisodes(selectionDaily, selectionBaseline)
  if (
    Math.abs(fullEpisodeRobustness.unattributedIncrementalDailySumPct) > 0.00001
    || Math.abs(selectionEpisodeRobustness.unattributedIncrementalDailySumPct) > 0.00001
  ) {
    throw new Error(
      `${candidate.candidateId} episode attribution does not reconcile: ${JSON.stringify({
        full: fullEpisodeRobustness.unattributedIncrementalDailySumPct,
        selection: selectionEpisodeRobustness.unattributedIncrementalDailySumPct,
      })}`,
    )
  }
  const periods = summarizePeriods(daily, baselineByDate)
  return {
    ...candidate,
    periods,
    metricDeltas: metricDeltas(periods, baselinePeriods),
    incrementalByYear: Object.fromEntries(
      [...new Set(daily.map((row) => row.year))].map((year) => [
        year,
        metrics(daily.filter((row) => row.year === year), baselineByDate)
          .incrementalDailySumPct,
      ]),
    ),
    changedForecasts: changedForecastSummary(daily),
    episodeRobustness: {
      selectionPrefix: selectionEpisodeRobustness,
      fullCalendar: fullEpisodeRobustness,
    },
    deletionRobustness: {
      selectionPrefixLeaveOneChangedYear: leaveOneChangedYear(
        selectionDaily,
        baselineByDate,
      ),
      fullLeaveOneChangedYear: leaveOneChangedYear(daily, baselineByDate),
    },
  }
}).toSorted((left, right) => (
  right.periods.selectionPrefix.incrementalDailySumPct
    - left.periods.selectionPrefix.incrementalDailySumPct
  || right.periods.selectionPrefix.sharpe - left.periods.selectionPrefix.sharpe
  || left.candidateId.localeCompare(right.candidateId)
))

const familyMatrix = EXTREME_HEAT_CANDIDATE_FAMILY.map(({ candidateId }) => ({
  candidateId,
  values: periodRows(candidateDaily.get(candidateId), '', SELECTION_PREFIX_END)
    .map((row) => row.netReturnPct - baselineByDate.get(row.date).netReturnPct),
}))
const focalFamilyMatrix = EXTREME_HEAT_FOCAL_CANDIDATE_IDS.map((candidateId) => (
  familyMatrix.find((candidate) => candidate.candidateId === candidateId)
))
const fullFamilyBootstraps = BOOTSTRAP_BLOCK_LENGTHS.map((blockLength) => (
  familyAdjustedBootstrap(familyMatrix, blockLength, bootstrapIterations)
))
const focalFamilyBootstraps = BOOTSTRAP_BLOCK_LENGTHS.map((blockLength) => (
  familyAdjustedBootstrap(focalFamilyMatrix, blockLength, bootstrapIterations)
))
const selectionLeader = candidateSummaries[0]
const crossPeriodPositiveCandidates = candidateSummaries
  .filter((candidate) => (
    candidate.periods.selectionPrefix.incrementalDailySumPct > 0
    && candidate.periods.reportOnly2025.incrementalDailySumPct > 0
  ))
  .map((candidate) => candidate.candidateId)
const crossPeriodPositiveCandidateSummaries = candidateSummaries
  .filter((candidate) => crossPeriodPositiveCandidates.includes(candidate.candidateId))

const frictionScenarios = Object.fromEntries(
  Object.keys(executionContract.scenarios).map((scenarioId) => {
    const scenarioBaseline = simulate({
      executionDays,
      selectedByDate,
      executionContract,
      priceContextByIssue: priorPriceContextByIssue,
      eventAgeByDate,
      storageContextByDate,
      scenarioId,
    })
    const scenarioBaselineByDate = new Map(scenarioBaseline.map((row) => [row.date, row]))
    return [scenarioId, {
      selectionEligible: executionContract.scenarios[scenarioId].selectionEligible,
      comparator: summarizePeriods(scenarioBaseline),
      focalCandidates: Object.fromEntries(EXTREME_HEAT_FOCAL_CANDIDATE_IDS.map(
        (candidateId) => {
          const candidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
            (row) => row.candidateId === candidateId,
          )
          const scenarioDaily = simulate({
            executionDays,
            selectedByDate,
            executionContract,
            candidate,
            priceContextByIssue: priceContextsForCandidate(candidate),
            eventAgeByDate,
            storageContextByDate,
            scenarioId,
          })
          return [candidateId, {
            periods: summarizePeriods(scenarioDaily, scenarioBaselineByDate),
            episodeRobustness: deriveChangedEpisodes(scenarioDaily, scenarioBaseline),
          }]
        },
      )),
    }]
  }),
)

const temporalNegativeControls = Object.fromEntries(
  EXTREME_HEAT_FOCAL_CANDIDATE_IDS
    .filter((candidateId) => candidateId.includes('price'))
    .map((candidateId) => {
      const candidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
        (row) => row.candidateId === candidateId,
      )
      const daily = simulate({
        executionDays,
        selectedByDate,
        executionContract,
        candidate,
        priceContextByIssue: priceContextsForCandidate(candidate, true),
        eventAgeByDate,
        storageContextByDate,
      })
      return [candidateId, {
        rule: 'same fixed gate with one additional completed authoritative-session lag',
        periods: summarizePeriods(daily, baselineByDate),
        episodeRobustness: deriveChangedEpisodes(daily, baselineDaily),
      }]
    }),
)

const issuePriceCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-issue-price-not-up-v1',
)
const issuePricePrecedingSessionProxyDaily = simulate({
  executionDays,
  selectedByDate,
  executionContract,
  candidate: issuePriceCandidate,
  priceContextByIssue: priorPriceContextByIssue,
  eventAgeByDate,
  storageContextByDate,
})
const storageCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === EXTREME_HEAT_FOCAL_CANDIDATE_IDS[0],
)
const alternativeStorageDaily = simulate({
  executionDays,
  selectedByDate,
  executionContract,
  candidate: storageCandidate,
  priceContextByIssue: priorPriceContextByIssue,
  eventAgeByDate,
  storageContextByDate: nearestStorageContextByDate,
})
const extremeDefinitionSensitivity = Object.fromEntries(
  EXTREME_HEAT_FOCAL_CANDIDATE_IDS.map((candidateId) => {
    const candidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
      (row) => row.candidateId === candidateId,
    )
    return [candidateId, Object.fromEntries([
      [
        'aggregate-6F-at-least-6-fixed-8F-extreme-locations',
        { extremeCddAnomalyF: 6, extremeLocationCount: 6 },
      ],
      [
        'aggregate-10F-at-least-10-fixed-8F-extreme-locations',
        { extremeCddAnomalyF: 10, extremeLocationCount: 10 },
      ],
    ].map(([definitionId, thresholds]) => {
      const daily = simulate({
        executionDays,
        selectedByDate,
        executionContract,
        candidate: { ...candidate, ...thresholds },
        priceContextByIssue: priceContextsForCandidate(candidate),
        eventAgeByDate,
        storageContextByDate,
      })
      return [definitionId, {
        ...thresholds,
        periods: summarizePeriods(daily, baselineByDate),
        changedForecasts: changedForecastSummary(daily),
        episodeRobustness: deriveChangedEpisodes(daily, baselineDaily),
      }]
    }))]
  }),
)

const focalBlock10 = focalFamilyBootstraps.find(({ blockLength }) => blockLength === 10)
const focalStrategyReviews = EXTREME_HEAT_FOCAL_CANDIDATE_IDS.map((candidateId) => {
  const summary = candidateSummaries.find((candidate) => candidate.candidateId === candidateId)
  const selectionIncrements = periodRows(
    candidateDaily.get(candidateId),
    '',
    SELECTION_PREFIX_END,
  ).map((row) => row.netReturnPct - baselineByDate.get(row.date).netReturnPct)
  const fixedCandidateBootstrapResults = BOOTSTRAP_BLOCK_LENGTHS.map((blockLength) => (
    fixedCandidateBootstrap(selectionIncrements, blockLength, bootstrapIterations)
  ))
  const leaveOne = summary.deletionRobustness.selectionPrefixLeaveOneChangedYear
  const stressIncrement = frictionScenarios.stress
    .focalCandidates[candidateId].periods.full.incrementalDailySumPct
  const temporalNegativeControl = temporalNegativeControls[candidateId]
  const inclusionChecks = {
    sufficientIndependentChangedEpisodes:
      summary.episodeRobustness.fullCalendar.independentEpisodeCount
      >= EXTREME_HEAT_SHADOW.evaluation.inclusionScaleReference
        .minimumIndependentChangedEpisodes,
    sufficientChangedSeasons:
      summary.deletionRobustness.fullLeaveOneChangedYear.length
      >= EXTREME_HEAT_SHADOW.evaluation.inclusionScaleReference.minimumChangedSeasons,
    positiveReportOnly2025:
      summary.periods.reportOnly2025.incrementalDailySumPct > 0,
    positiveSelectionLeaveOneChangedYear:
      leaveOne.length > 0
      && leaveOne.every((row) => row.remainingIncrementalDailySumPct > 0),
    positiveAfterRemovingBestThreeEpisodes:
      summary.episodeRobustness.fullCalendar
        .incrementalSumAfterRemovingBestThreeEpisodesPct > 0,
    acceptableTopEpisodeConcentration:
      summary.episodeRobustness.selectionPrefix.topEpisodePositiveContributionShare
      <= EXTREME_HEAT_SHADOW.evaluation.inclusionScaleReference
        .maximumTopEpisodePositiveContributionFraction,
    acceptableFocalFamilyBlock10PValue:
      focalBlock10.candidatePValues[candidateId]
      <= EXTREME_HEAT_SHADOW.evaluation.inclusionScaleReference
        .maximumFamilyAdjustedBlock10PValue,
    priceTimingSpecificity:
      !temporalNegativeControl
      || summary.periods.selectionPrefix.incrementalDailySumPct
        >= temporalNegativeControl.periods.selectionPrefix.incrementalDailySumPct,
    correctedSummerTemporalContractRepresented: false,
    nonNegativeStressIncrement: stressIncrement >= 0,
    directHistoricalPromotionAllowed:
      EXTREME_HEAT_SHADOW.evaluation.inclusionScaleReference
        .directHistoricalPromotionAllowed,
  }
  return {
    candidateId,
    historicalSelectionRank:
      candidateSummaries.findIndex((candidate) => candidate.candidateId === candidateId) + 1,
    verdict: Object.values(inclusionChecks).every(Boolean)
      ? 'qualifies-for-prospective-review-only'
      : 'reject-inclusion',
    inclusionChecks,
    periods: summary.periods,
    metricDeltas: summary.metricDeltas,
    incrementalByYear: summary.incrementalByYear,
    changedForecasts: summary.changedForecasts,
    episodeRobustness: summary.episodeRobustness,
    deletionRobustness: summary.deletionRobustness,
    fixedCandidateCircularBlockBootstrap: fixedCandidateBootstrapResults,
    focalFamilyAdjustedBlock10PValue: focalBlock10.candidatePValues[candidateId],
    exactEpisodeSignFlip: {
      selectionPrefix: episodeSignFlipTest(summary.episodeRobustness.selectionPrefix),
      fullCalendar: episodeSignFlipTest(summary.episodeRobustness.fullCalendar),
    },
  }
})

const resultWithoutDigest = {
  schemaVersion: EXTREME_HEAT_EVALUATION_SCHEMA_VERSION,
  evaluationId: 'ngas-all-year-extreme-heat-shadow-audit-v1',
  contractId: EXTREME_HEAT_SHADOW.contractId,
  contractDigestSha256: EXTREME_HEAT_SHADOW_DIGEST_SHA256,
  candidateFamilyDigestSha256: EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
  evaluatedThrough: endDate,
  historicalEvidenceStatus: EXTREME_HEAT_SHADOW.historicalEvidenceStatus,
  status: 'research-only-no-production-change',
  executionEligible: false,
  promotionEligible: false,
  publicStrategy: false,
  activeStrategyChanged: false,
  decision: {
    outcome: 'do-not-change-the-active-strategy',
    reasons: [
      'All three requested gates fail the frozen inclusion-scale review and remain execution- and promotion-ineligible.',
      'The exact demand-revision and production-vintage hypothesis cannot be reconstructed from the retained historical Summer inputs, whose legacy hours-0 temperature snapshot also predates the corrected four-sample local-day contract.',
      'All checked history was visible during development, and the full sensitivity family tests multiple related treatments.',
      `The descriptive selection-prefix leader has a full-16-family adjusted block-10 p-value of ${fullFamilyBootstraps.find(({ blockLength }) => blockLength === 10).pValue}.`,
      `The descriptive selection-prefix leader loses ${Math.abs(selectionLeader.periods.reportOnly2025.incrementalDailySumPct)} incremental daily-sum percentage points in report-only 2025.`,
      crossPeriodPositiveCandidates.length
        ? `Only ${crossPeriodPositiveCandidates.length} price/fade candidates improve both the through-2024 prefix and report-only 2025, and each changes at most ${Math.max(...crossPeriodPositiveCandidateSummaries.map((candidate) => candidate.changedForecasts.forecastEpisodeCount))} forecast episodes.`
        : 'No candidate improves both the through-2024 prefix and report-only 2025.',
      `Both requested price gates fail timing specificity: their one-extra-session-lag controls improve the selection prefix by ${temporalNegativeControls['extreme-heat-issue-price-not-up-v1'].periods.selectionPrefix.incrementalDailySumPct} and ${temporalNegativeControls['extreme-heat-three-session-price-not-up-v1'].periods.selectionPrefix.incrementalDailySumPct} points, more than the unlagged gates.`,
      `The complete historical regime contains only ${priceReplayAudit.extremeForecastEpisodeCount} extreme-heat forecast episodes; the requested gates change 9 to 11 forecast episodes and none has the 15 independent interventions used as the minimum prospective Summer scale reference.`,
      'EIA publication timing is causal, but current-vintage storage values cannot exclude later historical revisions.',
      'The supplied July 15-24, 2026 loss begins after the checked comparator ends and is not backfilled into the audit.',
      'The exact fresh lead-8-to-lead-7 revision idea remains isolated in the prospective spatial-demand-revision shadow.',
    ],
    descriptiveSelectionLeaderId: selectionLeader.candidateId,
    crossPeriodPositiveCandidateIds: crossPeriodPositiveCandidates,
  },
  hypothesisCoverage: {
    directlyTested: [
      'flat, quarter-size, and half-size extreme-heat exposure',
      'first-session-only and skip-first-session episode timing',
      'causally released storage-surplus gates',
      'completed issue-session and prior-three-session NG=F price gates',
      'combined storage-plus-issue-price unexpected-heat proxy',
      'small short fades only when both storage and issue-price state contradict the long',
      'broader and narrower extreme-heat definitions',
    ],
    notHistoricallyTestable: [
      'exact multi-model lead-8-to-lead-7 Summer demand revisions',
      'point-in-time production forecasts or production surprises',
      'a structural residual estimating what the futures curve had already priced',
    ],
    prospectiveExactCandidateId:
      EXTREME_HEAT_SHADOW.evaluation.prospectiveExactHypothesis,
  },
  july2026Incident: {
    suppliedObservationPeriod: '2026-07-15/2026-07-24',
    suppliedApproximateNetLossUsd: 440,
    auditTreatment: 'context-only-not-recomputed',
    comparatorEnd: endDate,
    reason:
      'Versioned UNG/VOO/QQQM outcomes and selected all-year rows end before the incident; no later outcome is synthesized or backfilled.',
  },
  inputBindings: {
    selectedTrades: binding(
      'legacy-active-all-year-comparator-ledger',
      EXTREME_HEAT_SHADOW.comparator.selectedTradesPath,
    ),
    runSummary: binding(
      'legacy-active-all-year-comparator-summary',
      EXTREME_HEAT_SHADOW.comparator.runSummaryPath,
    ),
    ngSignalMarket: binding(
      'completed-ng-futures-proxy-market-bars',
      EXTREME_HEAT_SHADOW.comparator.ngSignalMarketPath,
    ),
    executionContract: binding(
      'shared-research-execution-contract',
      EXTREME_HEAT_SHADOW.comparator.executionContractPath,
    ),
    storage: binding(
      'current-vintage-eia-lower-48-working-gas-history',
      EXTREME_HEAT_SHADOW.storageContext.sourcePath,
    ),
    storageReleaseCalendar: binding(
      'versioned-historical-eia-publication-calendar',
      EXTREME_HEAT_SHADOW.storageContext.releaseCalendarPath,
    ),
    executionMarketInputs: [
      binding('ung-adjusted-market-bars', 'data/qore/market/yahoo/UNG-daily.csv'),
      binding('voo-adjusted-market-bars', 'data/qore/market/yahoo/VOO-daily.csv'),
      binding('qqqm-adjusted-market-bars', 'data/qore/market/yahoo/QQQM-daily.csv'),
      binding('index-basket-weights', 'data/qore/market/index-basket-config.json'),
    ],
    researchImplementations: [
      binding(
        'extreme-heat-candidate-contract',
        'scripts/lib/qore-extreme-heat-shadow.mjs',
      ),
      binding(
        'extreme-heat-causal-evaluator',
        'scripts/evaluate-qore-extreme-heat-shadow.mjs',
      ),
      binding(
        'shared-eia-release-calendar-parser',
        'scripts/lib/eia-release-time.mjs',
      ),
      binding(
        'shared-preopen-availability-boundary',
        'scripts/lib/qore-signal-availability.mjs',
      ),
      binding(
        'shared-execution-simulator',
        'scripts/lib/qore-research-execution.mjs',
      ),
      binding(
        'shared-rebalance-deadband',
        'scripts/lib/qore-rebalance-deadband.mjs',
      ),
      binding('node-package-contract', 'package.json'),
      binding('node-dependency-lock', 'package-lock.json'),
    ],
  },
  signalAndTimingContract: EXTREME_HEAT_SHADOW.featureContract,
  causalInputAudit: {
    storage: storageReplayAudit,
    price: priceReplayAudit,
  },
  baselineTieOut: {
    sessionCount: baselineDaily.length,
    maximumDailyNetReturnDifferencePct: round(maximumDailyBaselineTieOutErrorPct, 9),
    pass: true,
  },
  comparator: baselinePeriods,
  focalStrategyReviews,
  descriptiveSelectionLeader: selectionLeader,
  multipleTesting: {
    selectionPeriod: `through-${SELECTION_PREFIX_END}`,
    bootstrapIterations,
    blockLengths: BOOTSTRAP_BLOCK_LENGTHS,
    exactObservationCount: periodRows(baselineDaily, '', SELECTION_PREFIX_END).length,
    focalRequestedFamily: {
      candidateCount: EXTREME_HEAT_FOCAL_CANDIDATE_IDS.length,
      candidateIds: EXTREME_HEAT_FOCAL_CANDIDATE_IDS,
      familyAdjustedCircularBlockBootstrap: focalFamilyBootstraps,
    },
    fullSensitivityFamily: {
      candidateCount: EXTREME_HEAT_CANDIDATE_FAMILY.length,
      familyAdjustedCircularBlockBootstrap: fullFamilyBootstraps,
    },
    caveat:
      'Both adjustments are lower bounds: neither covers the wider lifetime QORE research search, and all observations were development-visible.',
  },
  temporalNegativeControls,
  issuePricePrecedingSessionProxySensitivity: {
    status: 'separate-anticipatory-pricing-sensitivity-not-the-focal-issue-session-rule',
    periods: summarizePeriods(issuePricePrecedingSessionProxyDaily, baselineByDate),
    changedForecasts: changedForecastSummary(issuePricePrecedingSessionProxyDaily),
    episodeRobustness: deriveChangedEpisodes(
      issuePricePrecedingSessionProxyDaily,
      baselineDaily,
    ),
  },
  storageSeasonalDefinitionSensitivity: {
    selectedDefinition: 'jan1-anchored-seven-day-bucket',
    alternativeDefinition: 'nearest-period-end-within-eight-seasonal-days',
    periods: summarizePeriods(alternativeStorageDaily, baselineByDate),
    changedForecasts: changedForecastSummary(alternativeStorageDaily),
    episodeRobustness: deriveChangedEpisodes(alternativeStorageDaily, baselineDaily),
  },
  extremeDefinitionSensitivity,
  frictionScenarios,
  candidateSummaries,
}

const result = {
  ...resultWithoutDigest,
  evaluationDigestSha256: extremeHeatValueDigestSha256(resultWithoutDigest),
}

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, outputPath),
    status: result.status,
    activeStrategyChanged: result.activeStrategyChanged,
    evaluatedThrough: result.evaluatedThrough,
    descriptiveSelectionLeaderId: result.descriptiveSelectionLeader.candidateId,
    selectionPrefixIncrementalDailySumPct:
      result.descriptiveSelectionLeader.periods.selectionPrefix.incrementalDailySumPct,
    reportOnly2025IncrementalDailySumPct:
      result.descriptiveSelectionLeader.periods.reportOnly2025.incrementalDailySumPct,
    fullFamilyAdjustedBlock10PValue:
      result.multipleTesting.fullSensitivityFamily.familyAdjustedCircularBlockBootstrap
        .find(({ blockLength }) => blockLength === 10)?.pValue,
    focalVerdicts: Object.fromEntries(
      result.focalStrategyReviews.map(({ candidateId, verdict }) => [candidateId, verdict]),
    ),
    crossPeriodPositiveCandidateCount:
      result.decision.crossPeriodPositiveCandidateIds.length,
  }, null, 2))
} else {
  console.log(JSON.stringify(result, null, 2))
}
