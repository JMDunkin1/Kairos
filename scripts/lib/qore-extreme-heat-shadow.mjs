import crypto from 'node:crypto'
import { eiaReportAvailableAtOpen } from './qore-signal-availability.mjs'

export const EXTREME_HEAT_SHADOW_SCHEMA_VERSION = 2
export const EXTREME_HEAT_EVALUATION_SCHEMA_VERSION = 2
export const EXTREME_HEAT_DEFAULT_CDD_ANOMALY_F = 8
export const EXTREME_HEAT_DEFAULT_LOCATION_COUNT = 8
export const EXTREME_HEAT_LOCATION_COUNT_THRESHOLD_F = 8
export const EXTREME_HEAT_STORAGE_PEER_YEARS = 5
export const EXTREME_HEAT_FOCAL_CANDIDATE_IDS = Object.freeze([
  'extreme-heat-storage-deficit-only-v1',
  'extreme-heat-issue-price-not-up-v1',
  'extreme-heat-three-session-price-not-up-v1',
])

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy))
  if (!value || typeof value !== 'object') return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, freezeCopy(nested)]),
  ))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])]),
  )
}

export function extremeHeatValueDigestSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function candidate(candidateId, treatment, options = {}) {
  return {
    candidateId,
    treatment,
    extremeCddAnomalyF: EXTREME_HEAT_DEFAULT_CDD_ANOMALY_F,
    extremeLocationCount: EXTREME_HEAT_DEFAULT_LOCATION_COUNT,
    locationCountCddAnomalyThresholdF: EXTREME_HEAT_LOCATION_COUNT_THRESHOLD_F,
    ...options,
  }
}

export const EXTREME_HEAT_CANDIDATE_FAMILY = freezeCopy([
  candidate('extreme-heat-flat-v1', 'constant-scale', { extremeScale: 0 }),
  candidate('extreme-heat-quarter-v1', 'constant-scale', { extremeScale: 0.25 }),
  candidate('extreme-heat-half-v1', 'constant-scale', { extremeScale: 0.5 }),
  candidate('extreme-heat-fresh-session-only-v1', 'maximum-event-age', {
    maximumEventAgeSessions: 0,
  }),
  candidate('extreme-heat-skip-first-session-v1', 'minimum-event-age', {
    minimumEventAgeSessions: 1,
  }),
  candidate('extreme-heat-storage-deficit-only-v1', 'storage-threshold', {
    maximumStorageSeasonalDiffPct: 0,
    comparisonOperator: 'strictly-below',
    contradictedScale: 0,
    missingObservationScale: 0,
  }),
  candidate('extreme-heat-storage-deficit-half-surplus-v1', 'storage-threshold', {
    maximumStorageSeasonalDiffPct: 0,
    comparisonOperator: 'strictly-below',
    contradictedScale: 0.5,
    missingObservationScale: 1,
  }),
  candidate('extreme-heat-issue-price-not-up-v1', 'issue-price-threshold', {
    maximumIssueSessionNgReturnPct: 0,
    contradictedScale: 0,
    missingObservationScale: 0,
  }),
  candidate('extreme-heat-issue-price-half-after-rally-v1', 'issue-price-threshold', {
    maximumIssueSessionNgReturnPct: 0,
    contradictedScale: 0.5,
    missingObservationScale: 1,
  }),
  candidate('extreme-heat-three-session-price-not-up-v1', 'prior-price-threshold', {
    priceLookbackSessions: 3,
    maximumPriorNgReturnPct: 0,
    contradictedScale: 0,
    missingObservationScale: 0,
  }),
  candidate('extreme-heat-three-session-price-under-two-v1', 'prior-price-threshold', {
    priceLookbackSessions: 3,
    maximumPriorNgReturnPct: 2,
    contradictedScale: 0,
    missingObservationScale: 1,
  }),
  candidate('extreme-heat-unexpected-proxy-v1', 'unexpected-proxy', {
    maximumStorageSeasonalDiffPct: 0,
    maximumIssueSessionNgReturnPct: 0,
    contradictedScale: 0,
  }),
  candidate('extreme-heat-priced-surplus-fade-10-v1', 'priced-surplus-fade', {
    minimumStorageSeasonalDiffPct: 0,
    minimumIssueSessionNgReturnPct: 0,
    fadeGasPosition: -0.1,
  }),
  candidate('extreme-heat-priced-surplus-fade-20-v1', 'priced-surplus-fade', {
    minimumStorageSeasonalDiffPct: 0,
    minimumIssueSessionNgReturnPct: 0,
    fadeGasPosition: -0.2,
  }),
  candidate('very-extreme-heat-flat-v1', 'constant-scale', {
    extremeCddAnomalyF: 10,
    extremeLocationCount: 10,
    extremeScale: 0,
  }),
  candidate('broad-extreme-heat-flat-v1', 'constant-scale', {
    extremeCddAnomalyF: 6,
    extremeLocationCount: 6,
    extremeScale: 0,
  }),
])

export const EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256 =
  extremeHeatValueDigestSha256(EXTREME_HEAT_CANDIDATE_FAMILY)

export const EXTREME_HEAT_SHADOW = freezeCopy({
  schemaVersion: EXTREME_HEAT_SHADOW_SCHEMA_VERSION,
  contractId: 'ngas-all-year-extreme-heat-shadow-v1',
  strategyId: 'ngas-all-year-beta',
  role: 'focused-historical-research-shadow',
  executionEligible: false,
  promotionEligible: false,
  publicStrategy: false,
  activeStrategyChanged: false,
  historicalEvidenceStatus: 'development-contaminated',
  hypothesis:
    'Extreme heat should not receive ordinary demand-follow treatment unless the forecast information is fresh and supply and price state do not show that the demand shock is already absorbed.',
  comparator: {
    selectedTradesPath:
      'data/qore/research/strategy-agent-runs/ngas-all-year-beta/selected-trades.csv',
    selectedTradesDigestSha256:
      'ff39c0755c4777550113419e32a000e41a625612b30cedefa6103f2f8c2f04ea',
    runSummaryPath:
      'data/qore/research/strategy-agent-runs/ngas-all-year-beta/run-summary.json',
    runSummaryDigestSha256:
      'c1542dd264c8e3e342d4a63d5e4973864ac1e4bb0bf4109fd22bb2fdf4d1d7b8',
    ngSignalMarketPath: 'data/qore/market/yahoo/NG-F-qore-market.csv',
    ngSignalMarketDigestSha256:
      '303ff0b9ef9264862b945372506a53a83572f736ae6a4d2dcdd0899ce6a09fb9',
    executionContractPath: 'config/qore-research-execution.json',
    executionContractDigestSha256:
      'c18dea27526796dd6ad06ecffaa5cb1a32ac34fc587bc0cf79e0a007626e106d',
    sealedStrategyContractDigestSha256:
      '07ae468c936b65c141ae2d52d0088c13e185495bcfe9a9b897892d3b83c99285',
  },
  storageContext: {
    sourcePath: 'data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv',
    sourceDigestSha256:
      '25681096bb9a2e76cb74fd80ce41ff0e4b0987f16d068e9d16dc1fb5f237d6ed',
    releaseCalendarPath:
      'data/qore/fundamentals/eia/working-gas-storage-release-calendar.json',
    releaseCalendarDigestSha256:
      '29e0bead968edcadb20e3ca90d337ff74a2e1f00983c6e449a93dc13b809c3e7',
    availabilityRule: 'released-at-or-before-09:30-America/New_York-on-each-held-session',
    seasonalPeerRule: 'same-Jan-1-anchored-seven-day-bucket-in-the-five-prior-years',
    valueVintagePolicy:
      'Release timing is historical-calendar-causal, but values come from the current checked-in EIA series; release-vintage revisions are not excluded.',
  },
  featureContract: {
    selectedRows:
      'only selected summer-heat-long rows can be changed; Winter, Summer reversion, and index-fallback rows remain unchanged',
    extremeDefinition:
      'aggregate coolingDemandAnomalyF must meet the candidate threshold and coolingDemandExtremeCount must contain at least the candidate count; that retained count was computed once at the fixed 8F per-location cooling-demand threshold',
    freshnessProxy:
      'zero-based session age within the exact selected issueDate and targetDate heat episode',
    storage:
      'latest EIA report released by 09:30 New York on each held session, strictly below the mean of the same Jan-1-anchored seasonal week in the five prior years',
    issuePrice:
      'close-to-close return for an exact authoritative issueDate session; weekend and holiday issues have no issue-session observation and the focal gate fails closed',
    priorPrice:
      'three compounded authoritative completed NG=F sessions ending with the latest session on or before issueDate; weekend and holiday issues therefore use a preceding-session anticipatory-pricing window',
    authoritativePriceSessions:
      'the complete selected VOO/QQQM execution-session grid; duplicate or missing NG=F closes invalidate the observation',
    targetSessionPricePolicy: 'forbidden',
    focalMissingObservationPolicy:
      'fail closed to the index basket for the three requested full-veto gates',
    productionVintageStatus:
      'unavailable historically; production gates are not represented by a synthetic or revised series',
    exactForecastRevisionStatus:
      'unavailable in the retained historical Summer calendar; lead-8-to-lead-7 demand revision remains prospective-only',
  },
  allocationRule:
    'candidate changes only the selected gas target and returns released absolute exposure to the unchanged index basket',
  focalCandidateIds: EXTREME_HEAT_FOCAL_CANDIDATE_IDS,
  candidateFamily: EXTREME_HEAT_CANDIDATE_FAMILY,
  candidateFamilyDigestSha256: EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
  evaluation: {
    selectionPrefixEnd: '2024-12-31',
    reportOnlyStart: '2025-01-01',
    rankingUse: 'descriptive-only; no member may be promoted from this contaminated family',
    inclusionScaleReference: {
      minimumIndependentChangedEpisodes: 15,
      minimumChangedSeasons: 2,
      maximumFamilyAdjustedBlock10PValue: 0.2,
      maximumTopEpisodePositiveContributionFraction: 0.5,
      requirePositiveReportOnly2025: true,
      requirePositiveSelectionLeaveOneChangedYear: true,
      requirePositiveAfterRemovingBestThreeEpisodes: true,
      requirePriceTimingSpecificity: true,
      requireCorrectedSummerTemporalContract: true,
      requireNonNegativeStressIncrement: true,
      directHistoricalPromotionAllowed: false,
    },
    july2026Policy:
      'the checked comparator ends 2026-07-14, so the supplied July 15-24 incident is context only and not backfilled',
    prospectiveExactHypothesis:
      'spatial-demand-revision-breadth-price-gate-v1',
  },
})

export const EXTREME_HEAT_SHADOW_DIGEST_SHA256 =
  extremeHeatValueDigestSha256(EXTREME_HEAT_SHADOW)

function numberFrom(value, fallback = Number.NaN) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function strictlyOrderedUniqueDates(values, label) {
  if (!Array.isArray(values) || !values.length) {
    throw new Error(`${label} must contain at least one session date.`)
  }
  let previous = ''
  const result = values.map((value) => {
    const date = String(value ?? '')
    if (!validIsoDate(date)) throw new Error(`${label} contains an invalid date: ${date || 'missing'}.`)
    if (previous && date <= previous) {
      throw new Error(`${label} must be strictly increasing without duplicate dates.`)
    }
    previous = date
    return date
  })
  return result
}

function compoundedCloseReturnPct(closes) {
  return (closes.at(-1) / closes[0] - 1) * 100
}

export function buildExtremeHeatPriceContexts({
  issueDates,
  marketRows,
  authoritativeSessionDates,
  lagSessions = 0,
  requireExactIssueSession = false,
}) {
  if (!Array.isArray(issueDates) || !Array.isArray(marketRows)) {
    throw new Error('Extreme-heat price contexts require issue dates and NG=F market rows.')
  }
  if (!Number.isInteger(lagSessions) || lagSessions < 0) {
    throw new Error('Extreme-heat price context lagSessions must be a non-negative integer.')
  }
  const sessions = strictlyOrderedUniqueDates(
    authoritativeSessionDates,
    'Extreme-heat authoritative price sessions',
  )
  const pricesByDate = new Map()
  let previousMarketDate = ''
  for (const row of marketRows) {
    const date = String(row?.date ?? '')
    const close = numberFrom(row?.close)
    if (!validIsoDate(date) || !(close > 0)) {
      throw new Error(`Extreme-heat NG=F market row ${date || 'missing'} is invalid.`)
    }
    if (previousMarketDate && date <= previousMarketDate) {
      throw new Error('Extreme-heat NG=F market rows must be strictly increasing without duplicates.')
    }
    previousMarketDate = date
    pricesByDate.set(date, close)
  }
  const uniqueIssues = [...new Set(issueDates)]
  if (uniqueIssues.some((issueDate) => !validIsoDate(issueDate))) {
    throw new Error('Extreme-heat issue dates must be valid YYYY-MM-DD values.')
  }
  return new Map(uniqueIssues.toSorted().map((issueDate) => {
    const associationIndex = sessions.findLastIndex((date) => date <= issueDate)
    const associationSessionDate = sessions[associationIndex]
    if (requireExactIssueSession && associationSessionDate !== issueDate) {
      return [issueDate, {
        available: false,
        issueDate,
        associationSessionDate: associationSessionDate ?? null,
        reason: 'no-authoritative-issue-date-session',
      }]
    }
    const latestIndex = associationIndex - lagSessions
    if (latestIndex < 1) {
      return [issueDate, {
        available: false,
        issueDate,
        reason: 'insufficient-authoritative-completed-sessions',
      }]
    }
    const priceSessionDate = sessions[latestIndex]
    const priorSessionDate = sessions[latestIndex - 1]
    const issueClose = pricesByDate.get(priceSessionDate)
    const priorClose = pricesByDate.get(priorSessionDate)
    if (!(issueClose > 0) || !(priorClose > 0)) {
      return [issueDate, {
        available: false,
        issueDate,
        priceSessionDate,
        reason: 'missing-authoritative-ng-close',
      }]
    }
    const priorReturnsPct = Object.fromEntries([2, 3, 5].map((lookback) => {
      const firstIndex = latestIndex - lookback
      if (firstIndex < 0) return [lookback, null]
      const dates = sessions.slice(firstIndex, latestIndex + 1)
      const closes = dates.map((date) => pricesByDate.get(date))
      return [
        lookback,
        closes.every((close) => close > 0) ? compoundedCloseReturnPct(closes) : null,
      ]
    }))
    return [issueDate, {
      available: true,
      issueDate,
      associationSessionDate,
      priceSessionDate,
      priorSessionDate,
      issueDateHasAuthoritativeSession: associationSessionDate === issueDate,
      issueSessionReturnPct: (issueClose / priorClose - 1) * 100,
      priorReturnsPct,
    }]
  }))
}

export function extremeHeatStorageSeasonalWeek(isoDate) {
  if (!validIsoDate(isoDate)) {
    throw new Error(`Invalid extreme-heat storage date: ${isoDate ?? 'missing'}.`)
  }
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const dayOfYear = Math.floor((date - yearStart) / 86_400_000) + 1
  return Math.floor((dayOfYear - 1) / 7)
}

function normalizedExtremeHeatStorageRows(storageRows, tradeDate) {
  if (!Array.isArray(storageRows) || !validIsoDate(tradeDate)) {
    throw new Error(
      'An extreme-heat causal storage context requires storage rows and a valid trade date.',
    )
  }
  const rows = storageRows
    .map((row) => ({
      date: row.date,
      year: Number(row.year ?? String(row.date ?? '').slice(0, 4)),
      seasonalWeek: Number(
        row.seasonalWeek
        ?? (validIsoDate(row.date)
          ? extremeHeatStorageSeasonalWeek(row.date)
          : Number.NaN),
      ),
      storageBcf: numberFrom(row.storageBcf),
      releasedAt: row.releasedAt,
    }))
    .filter((row) => (
      validIsoDate(row.date)
      && Number.isInteger(row.year)
      && Number.isInteger(row.seasonalWeek)
      && row.storageBcf > 0
      && Number.isFinite(Date.parse(String(row.releasedAt ?? '')))
    ))
    .toSorted((left, right) => left.date.localeCompare(right.date))
  return rows.filter((row) => eiaReportAvailableAtOpen(row.releasedAt, tradeDate))
}

function unavailableExtremeHeatStorageContext(
  latest,
  peers,
  reason = 'insufficient-seasonal-peers',
) {
  return {
    available: false,
    reason,
    storageDate: latest.date,
    peerCount: peers.length,
  }
}

function hasOnePeerFromEachPriorYear(latest, peers) {
  const peerYearCounts = new Map()
  for (const peer of peers) {
    peerYearCounts.set(peer.year, (peerYearCounts.get(peer.year) ?? 0) + 1)
  }
  return peers.length === EXTREME_HEAT_STORAGE_PEER_YEARS
    && Array.from(
      { length: EXTREME_HEAT_STORAGE_PEER_YEARS },
      (_, offset) => latest.year - EXTREME_HEAT_STORAGE_PEER_YEARS + offset,
    ).every((year) => peerYearCounts.get(year) === 1)
}

function availableExtremeHeatStorageContext(latest, peers, seasonalMethod) {
  const seasonalAverageBcf =
    peers.reduce((sum, row) => sum + row.storageBcf, 0) / peers.length
  return {
    available: true,
    seasonalMethod,
    storageDate: latest.date,
    storageReleaseAt: latest.releasedAt,
    storageBcf: latest.storageBcf,
    seasonalAverageBcf,
    storageDeviationPct:
      ((latest.storageBcf - seasonalAverageBcf) / seasonalAverageBcf) * 100,
    peerCount: peers.length,
    peerDates: peers.map((row) => row.date),
  }
}

export function buildExtremeHeatCausalStorageContext(storageRows, tradeDate) {
  const availableRows = normalizedExtremeHeatStorageRows(storageRows, tradeDate)
  const latest = availableRows.at(-1)
  if (!latest) return { available: false, reason: 'missing-released-storage' }
  const peers = availableRows.filter((row) => (
    row.seasonalWeek === latest.seasonalWeek
    && row.year >= latest.year - EXTREME_HEAT_STORAGE_PEER_YEARS
    && row.year < latest.year
  ))
  if (!hasOnePeerFromEachPriorYear(latest, peers)) {
    return unavailableExtremeHeatStorageContext(
      latest,
      peers,
      'requires-one-seasonal-peer-in-each-prior-year',
    )
  }
  return availableExtremeHeatStorageContext(
    latest,
    peers,
    'jan1-anchored-seven-day-bucket',
  )
}

function extremeHeatSeasonalDayIndex(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return Math.floor(
    (Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(2000, 0, 1))
      / 86_400_000,
  )
}

function extremeHeatCircularSeasonalDayDistance(leftDate, rightDate) {
  const distance = Math.abs(
    extremeHeatSeasonalDayIndex(leftDate) - extremeHeatSeasonalDayIndex(rightDate),
  )
  return Math.min(distance, 366 - distance)
}

export function buildExtremeHeatNearestPeriodStorageContext(storageRows, tradeDate) {
  const availableRows = normalizedExtremeHeatStorageRows(storageRows, tradeDate)
  const latest = availableRows.at(-1)
  if (!latest) return { available: false, reason: 'missing-released-storage' }
  const peers = []
  for (
    let year = latest.year - EXTREME_HEAT_STORAGE_PEER_YEARS;
    year < latest.year;
    year += 1
  ) {
    const nearest = availableRows
      .filter((row) => row.year === year)
      .map((row) => ({
        row,
        distance: extremeHeatCircularSeasonalDayDistance(latest.date, row.date),
      }))
      .filter(({ distance }) => distance <= 8)
      .toSorted(
        (left, right) =>
          left.distance - right.distance || left.row.date.localeCompare(right.row.date),
      )[0]
    if (nearest) peers.push(nearest.row)
  }
  if (!hasOnePeerFromEachPriorYear(latest, peers)) {
    return unavailableExtremeHeatStorageContext(
      latest,
      peers,
      'requires-one-seasonal-peer-in-each-prior-year',
    )
  }
  return availableExtremeHeatStorageContext(
    latest,
    peers,
    'nearest-period-end-within-eight-seasonal-days',
  )
}

export function requireExtremeHeatFiveYearStorageContext(context) {
  const latestYear = Number(String(context?.storageDate ?? '').slice(0, 4))
  const peerYears = Array.isArray(context?.peerDates)
    ? context.peerDates.map((date) => Number(String(date).slice(0, 4)))
    : []
  const expectedPeerYears = Number.isInteger(latestYear)
    ? Array.from(
      { length: EXTREME_HEAT_STORAGE_PEER_YEARS },
      (_, offset) => latestYear - EXTREME_HEAT_STORAGE_PEER_YEARS + offset,
    )
    : []
  if (
    context?.available
    && context.peerCount === EXTREME_HEAT_STORAGE_PEER_YEARS
    && peerYears.length === EXTREME_HEAT_STORAGE_PEER_YEARS
    && new Set(peerYears).size === EXTREME_HEAT_STORAGE_PEER_YEARS
    && expectedPeerYears.every((year) => peerYears.includes(year))
  ) {
    return context
  }
  return {
    available: false,
    reason: 'requires-exactly-five-seasonal-peers',
    storageDate: context?.storageDate ?? null,
    storageReleaseAt: context?.storageReleaseAt ?? null,
    peerCount: Number.isInteger(context?.peerCount) ? context.peerCount : 0,
  }
}

export function isExtremeHeatRow(row, candidateConfig) {
  return row?.thesisKind === 'summer-heat-long'
    && numberFrom(row.coolingDemandAnomalyF) >= candidateConfig.extremeCddAnomalyF
    && numberFrom(row.coolingDemandExtremeCount) >= candidateConfig.extremeLocationCount
}

function scaledDecision(selectedGasPosition, scale, reason) {
  const gasPosition = selectedGasPosition * scale
  return {
    gasPosition,
    investedIndexFraction: 1 - Math.abs(gasPosition),
    changed: Math.abs(gasPosition - selectedGasPosition) > 1e-12,
    scale,
    reason,
  }
}

export function evaluateExtremeHeatCandidate({
  row,
  candidate: candidateConfig,
  eventAgeSessions = 0,
  priceContext,
}) {
  const selectedGasPosition = numberFrom(row?.ungPosition, 0)
  if (!isExtremeHeatRow(row, candidateConfig) || selectedGasPosition <= 0) {
    return scaledDecision(selectedGasPosition, 1, 'selected-allocation-unchanged')
  }

  if (candidateConfig.treatment === 'constant-scale') {
    return scaledDecision(selectedGasPosition, candidateConfig.extremeScale, 'extreme-heat-constant-scale')
  }
  if (candidateConfig.treatment === 'maximum-event-age') {
    const pass = eventAgeSessions <= candidateConfig.maximumEventAgeSessions
    return scaledDecision(selectedGasPosition, pass ? 1 : 0, pass ? 'fresh-session-kept' : 'stale-episode-veto')
  }
  if (candidateConfig.treatment === 'minimum-event-age') {
    const pass = eventAgeSessions >= candidateConfig.minimumEventAgeSessions
    return scaledDecision(selectedGasPosition, pass ? 1 : 0, pass ? 'later-session-kept' : 'first-session-veto')
  }
  if (candidateConfig.treatment === 'storage-threshold') {
    const storage = numberFrom(row.storageSeasonalDiffPct)
    if (!Number.isFinite(storage)) {
      return scaledDecision(
        selectedGasPosition,
        candidateConfig.missingObservationScale ?? 1,
        'storage-unavailable',
      )
    }
    const pass = candidateConfig.comparisonOperator === 'strictly-below'
      ? storage < candidateConfig.maximumStorageSeasonalDiffPct
      : storage <= candidateConfig.maximumStorageSeasonalDiffPct
    return scaledDecision(
      selectedGasPosition,
      pass ? 1 : candidateConfig.contradictedScale,
      pass ? 'storage-supports-heat' : 'storage-absorbs-heat',
    )
  }
  if (candidateConfig.treatment === 'issue-price-threshold') {
    const issueReturn = numberFrom(priceContext?.issueSessionReturnPct)
    if (!priceContext?.available || !Number.isFinite(issueReturn)) {
      return scaledDecision(
        selectedGasPosition,
        candidateConfig.missingObservationScale ?? 1,
        'issue-price-unavailable',
      )
    }
    const pass = issueReturn <= candidateConfig.maximumIssueSessionNgReturnPct
    return scaledDecision(
      selectedGasPosition,
      pass ? 1 : candidateConfig.contradictedScale,
      pass ? 'issue-price-not-up' : 'issue-price-already-up',
    )
  }
  if (candidateConfig.treatment === 'prior-price-threshold') {
    const priorReturn = numberFrom(
      priceContext?.priorReturnsPct?.[candidateConfig.priceLookbackSessions],
    )
    if (!priceContext?.available || !Number.isFinite(priorReturn)) {
      return scaledDecision(
        selectedGasPosition,
        candidateConfig.missingObservationScale ?? 1,
        'prior-price-unavailable',
      )
    }
    const pass = priorReturn <= candidateConfig.maximumPriorNgReturnPct
    return scaledDecision(
      selectedGasPosition,
      pass ? 1 : candidateConfig.contradictedScale,
      pass ? 'prior-price-under-threshold' : 'prior-price-already-up',
    )
  }
  if (candidateConfig.treatment === 'unexpected-proxy') {
    const storage = numberFrom(row.storageSeasonalDiffPct)
    const issueReturn = numberFrom(priceContext?.issueSessionReturnPct)
    if (
      !Number.isFinite(storage)
      || !priceContext?.available
      || !Number.isFinite(issueReturn)
    ) {
      return scaledDecision(selectedGasPosition, 1, 'unexpected-proxy-unavailable')
    }
    const pass = storage < candidateConfig.maximumStorageSeasonalDiffPct
      && issueReturn <= candidateConfig.maximumIssueSessionNgReturnPct
    return scaledDecision(
      selectedGasPosition,
      pass ? 1 : candidateConfig.contradictedScale,
      pass ? 'unexpected-proxy-passed' : 'unexpected-proxy-veto',
    )
  }
  if (candidateConfig.treatment === 'priced-surplus-fade') {
    const storage = numberFrom(row.storageSeasonalDiffPct)
    const issueReturn = numberFrom(priceContext?.issueSessionReturnPct)
    if (
      !Number.isFinite(storage)
      || !priceContext?.available
      || !Number.isFinite(issueReturn)
    ) {
      return scaledDecision(selectedGasPosition, 1, 'fade-context-unavailable')
    }
    const fade = storage > candidateConfig.minimumStorageSeasonalDiffPct
      && issueReturn > candidateConfig.minimumIssueSessionNgReturnPct
    if (!fade) return scaledDecision(selectedGasPosition, 1, 'priced-surplus-fade-not-triggered')
    return {
      gasPosition: candidateConfig.fadeGasPosition,
      investedIndexFraction: 1 - Math.abs(candidateConfig.fadeGasPosition),
      changed: true,
      scale: null,
      reason: 'priced-surplus-extreme-heat-fade',
    }
  }
  throw new Error(`Unsupported extreme-heat treatment: ${candidateConfig.treatment}.`)
}
