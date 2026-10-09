#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  EXTREME_HEAT_CANDIDATE_FAMILY,
  EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
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
import { eiaReportAvailableAtOpen } from './lib/qore-signal-availability.mjs'

const repoRoot = process.cwd()
const fileDigest = (relativePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(repoRoot, relativePath)))
  .digest('hex')
const extremeRow = {
  thesisKind: 'summer-heat-long',
  coolingDemandAnomalyF: 9,
  coolingDemandExtremeCount: 10,
  storageSeasonalDiffPct: 6,
  ungPosition: 0.35,
}
const ordinaryHeatRow = {
  ...extremeRow,
  coolingDemandAnomalyF: 7.99,
}

assert.equal(EXTREME_HEAT_SHADOW.executionEligible, false)
assert.equal(EXTREME_HEAT_SHADOW.promotionEligible, false)
assert.equal(EXTREME_HEAT_SHADOW.publicStrategy, false)
assert.equal(EXTREME_HEAT_SHADOW.activeStrategyChanged, false)
assert.equal(EXTREME_HEAT_CANDIDATE_FAMILY.length, 16)
assert.deepEqual(EXTREME_HEAT_SHADOW.focalCandidateIds, EXTREME_HEAT_FOCAL_CANDIDATE_IDS)
assert.equal(
  new Set(EXTREME_HEAT_CANDIDATE_FAMILY.map(({ candidateId }) => candidateId)).size,
  EXTREME_HEAT_CANDIDATE_FAMILY.length,
)
assert.equal(
  extremeHeatValueDigestSha256(EXTREME_HEAT_CANDIDATE_FAMILY),
  EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
)
assert.equal(
  extremeHeatValueDigestSha256(EXTREME_HEAT_SHADOW),
  EXTREME_HEAT_SHADOW_DIGEST_SHA256,
)

const flatCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-flat-v1',
)
assert.equal(isExtremeHeatRow(extremeRow, flatCandidate), true)
assert.equal(isExtremeHeatRow({
  ...extremeRow,
  coolingDemandAnomalyF: 8,
  coolingDemandExtremeCount: 8,
}, flatCandidate), true)
assert.equal(isExtremeHeatRow(ordinaryHeatRow, flatCandidate), false)
assert.equal(isExtremeHeatRow({
  ...extremeRow,
  coolingDemandExtremeCount: 7,
}, flatCandidate), false)
assert.equal(isExtremeHeatRow({
  ...extremeRow,
  thesisKind: 'reversion-short',
}, flatCandidate), false)
assert.deepEqual(
  evaluateExtremeHeatCandidate({
    row: ordinaryHeatRow,
    candidate: flatCandidate,
    priceContext: { available: true, issueSessionReturnPct: 5 },
  }),
  {
    gasPosition: 0.35,
    investedIndexFraction: 0.65,
    changed: false,
    scale: 1,
    reason: 'selected-allocation-unchanged',
  },
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: flatCandidate,
  }).gasPosition,
  0,
)

const storageCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-storage-deficit-only-v1',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: storageCandidate,
  }).gasPosition,
  0,
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: -0.01 },
    candidate: storageCandidate,
  }).gasPosition,
  0.35,
)
for (const missingStorage of ['', null, undefined]) {
  const decision = evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: missingStorage },
    candidate: storageCandidate,
  })
  assert.equal(decision.gasPosition, 0, 'missing focal storage must fail closed')
  assert.equal(decision.investedIndexFraction, 1)
  assert.equal(decision.reason, 'storage-unavailable')
}
assert.equal(
  evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: 0 },
    candidate: storageCandidate,
  }).gasPosition,
  0,
  'storage equal to its seasonal average is not below it',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: 0.000001 },
    candidate: storageCandidate,
  }).gasPosition,
  0,
)

const priceCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-issue-price-not-up-v1',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: priceCandidate,
    priceContext: { available: true, issueSessionReturnPct: 0 },
  }).gasPosition,
  0.35,
  'price equality must remain eligible',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: priceCandidate,
    priceContext: { available: true, issueSessionReturnPct: -0.000001 },
  }).gasPosition,
  0.35,
  'a negative issue-session return must remain eligible',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: priceCandidate,
    priceContext: { available: true, issueSessionReturnPct: 0.000001 },
  }).gasPosition,
  0,
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: priceCandidate,
    priceContext: { available: false },
  }).gasPosition,
  0,
  'missing focal price context must fail closed',
)
for (const malformedIssueReturn of [null, '', undefined]) {
  assert.equal(
    evaluateExtremeHeatCandidate({
      row: extremeRow,
      candidate: priceCandidate,
      priceContext: {
        available: true,
        issueSessionReturnPct: malformedIssueReturn,
      },
    }).gasPosition,
    0,
    'a malformed focal issue return must fail closed',
  )
}

const threeSessionCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-three-session-price-not-up-v1',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: threeSessionCandidate,
    priceContext: { available: true, priorReturnsPct: { 3: 0 } },
  }).gasPosition,
  0.35,
  'a flat three-session compounded return remains eligible',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: threeSessionCandidate,
    priceContext: { available: true, priorReturnsPct: { 3: -0.000001 } },
  }).gasPosition,
  0.35,
  'a negative three-session compounded return must remain eligible',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: threeSessionCandidate,
    priceContext: { available: true, priorReturnsPct: { 3: 0.000001 } },
  }).gasPosition,
  0,
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: threeSessionCandidate,
    priceContext: { available: false, priorReturnsPct: { 3: -1 } },
  }).gasPosition,
  0,
  'a numerical three-session value cannot override unavailable context',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: threeSessionCandidate,
    priceContext: { available: true, priorReturnsPct: { 3: null } },
  }).gasPosition,
  0,
)

for (const candidate of [storageCandidate, priceCandidate, threeSessionCandidate]) {
  const veto = evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate,
    priceContext: {
      available: true,
      issueSessionReturnPct: 1,
      priorReturnsPct: { 3: 1 },
    },
  })
  assert.equal(veto.gasPosition, 0)
  assert.equal(veto.investedIndexFraction, 1)
  const irrelevant = evaluateExtremeHeatCandidate({
    row: { ...extremeRow, thesisKind: 'summer-heat-long', ungPosition: 0 },
    candidate,
    priceContext: {
      available: true,
      issueSessionReturnPct: 1,
      priorReturnsPct: { 3: 1 },
    },
  })
  assert.equal(irrelevant.gasPosition, 0)
  assert.equal(irrelevant.investedIndexFraction, 1)
  assert.equal(irrelevant.changed, false)
}

const authoritativeSessionDates = [
  '2024-07-01',
  '2024-07-02',
  '2024-07-03',
  '2024-07-05',
  '2024-07-08',
]
const marketRows = [
  { date: '2024-07-01', close: 100 },
  { date: '2024-07-02', close: 99 },
  { date: '2024-07-03', close: 101 },
  { date: '2024-07-05', close: 100 },
  { date: '2024-07-08', close: 200 },
]
const fixtureContexts = buildExtremeHeatPriceContexts({
  issueDates: ['2024-07-05', '2024-07-07'],
  marketRows,
  authoritativeSessionDates,
})
for (const issueDate of ['2024-07-05', '2024-07-07']) {
  const context = fixtureContexts.get(issueDate)
  assert.equal(context.available, true)
  assert.equal(context.priceSessionDate, '2024-07-05')
  assert.ok(Math.abs(context.issueSessionReturnPct - (100 / 101 - 1) * 100) < 1e-12)
  assert.ok(Math.abs(context.priorReturnsPct[3]) < 1e-12)
}
assert.equal(
  fixtureContexts.get('2024-07-05').issueDateHasAuthoritativeSession,
  true,
)
assert.equal(
  fixtureContexts.get('2024-07-07').issueDateHasAuthoritativeSession,
  false,
)
const exactFixtureContexts = buildExtremeHeatPriceContexts({
  issueDates: ['2024-07-05', '2024-07-07'],
  marketRows,
  authoritativeSessionDates,
  requireExactIssueSession: true,
})
assert.equal(exactFixtureContexts.get('2024-07-05').available, true)
assert.equal(exactFixtureContexts.get('2024-07-07').available, false)
assert.equal(
  exactFixtureContexts.get('2024-07-07').reason,
  'no-authoritative-issue-date-session',
)
assert.throws(
  () => buildExtremeHeatPriceContexts({
    issueDates: ['2024-07-05'],
    marketRows: [...marketRows, { date: '2024-07-08', close: 201 }],
    authoritativeSessionDates,
  }),
  /strictly increasing without duplicates/,
)
const missingPriceContext = buildExtremeHeatPriceContexts({
  issueDates: ['2024-07-05'],
  marketRows: marketRows.filter(({ date }) => date !== '2024-07-05'),
  authoritativeSessionDates,
}).get('2024-07-05')
assert.equal(missingPriceContext.available, false)
assert.equal(missingPriceContext.reason, 'missing-authoritative-ng-close')
assert.equal(
  eiaReportAvailableAtOpen('2024-06-13T14:30:00.000Z', '2024-06-13'),
  false,
)
assert.equal(
  eiaReportAvailableAtOpen('2024-06-13T14:30:00.000Z', '2024-06-14'),
  true,
)
assert.equal(
  eiaReportAvailableAtOpen('2024-06-13T13:30:00.000Z', '2024-06-13'),
  true,
  'a report released exactly at the New York open is causally available',
)
const storageFixture = Array.from({ length: 6 }, (_, offset) => {
  const year = 2019 + offset
  return {
    date: `${year}-06-07`,
    storageBcf: 2_000 + offset * 100,
    releasedAt: offset === 5
      ? '2024-06-13T14:30:00.000Z'
      : `${year}-06-13T14:30:00.000Z`,
  }
})
assert.equal(extremeHeatStorageSeasonalWeek('2024-01-01'), 0)
assert.throws(
  () => extremeHeatStorageSeasonalWeek('2024-02-31'),
  /Invalid extreme-heat storage date/,
)
assert.equal(
  buildExtremeHeatCausalStorageContext(storageFixture, '2024-06-13').storageDate,
  '2023-06-07',
  'the 10:30 release must not be available at the same session open',
)
assert.equal(
  buildExtremeHeatCausalStorageContext(storageFixture, '2024-06-14').peerCount,
  5,
)
assert.equal(
  buildExtremeHeatNearestPeriodStorageContext(storageFixture, '2024-06-14').peerCount,
  5,
)
const duplicateYearStorageFixture = [
  ...storageFixture.slice(1),
  {
    date: '2020-06-08',
    storageBcf: 2_150,
    releasedAt: '2020-06-14T14:30:00.000Z',
  },
]
assert.deepEqual(
  buildExtremeHeatCausalStorageContext(duplicateYearStorageFixture, '2024-06-14'),
  {
    available: false,
    reason: 'requires-one-seasonal-peer-in-each-prior-year',
    storageDate: '2024-06-07',
    peerCount: 5,
  },
  'five rows cannot substitute for one peer from each of the five prior years',
)
const fivePeerContext = {
  available: true,
  peerCount: 5,
  storageDate: '2024-06-07',
  storageDeviationPct: -1,
  peerDates: [
    '2019-06-07',
    '2020-06-07',
    '2021-06-07',
    '2022-06-07',
    '2023-06-07',
  ],
}
assert.equal(
  requireExtremeHeatFiveYearStorageContext(fivePeerContext),
  fivePeerContext,
)
assert.deepEqual(
  requireExtremeHeatFiveYearStorageContext({
    ...fivePeerContext,
    peerCount: 4,
  }),
  {
    available: false,
    reason: 'requires-exactly-five-seasonal-peers',
    storageDate: '2024-06-07',
    storageReleaseAt: null,
    peerCount: 4,
  },
)

const unexpectedProxyCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-unexpected-proxy-v1',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: 0 },
    candidate: unexpectedProxyCandidate,
    priceContext: { available: true, issueSessionReturnPct: -1 },
  }).gasPosition,
  0,
  'storage equal to average must fail the combined deficit proxy',
)

const fadeCandidate = EXTREME_HEAT_CANDIDATE_FAMILY.find(
  ({ candidateId }) => candidateId === 'extreme-heat-priced-surplus-fade-10-v1',
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: extremeRow,
    candidate: fadeCandidate,
    priceContext: { available: true, issueSessionReturnPct: 1 },
  }).gasPosition,
  -0.1,
)
assert.equal(
  evaluateExtremeHeatCandidate({
    row: { ...extremeRow, storageSeasonalDiffPct: -1 },
    candidate: fadeCandidate,
    priceContext: { available: true, issueSessionReturnPct: 1 },
  }).gasPosition,
  0.35,
)

function sourceFiles(root) {
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (new Set(['.git', '.local', 'dist', 'node_modules']).has(entry.name)) continue
      result.push(...sourceFiles(entryPath))
    } else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) {
      result.push(entryPath)
    }
  }
  return result
}

const allowedReferences = new Set([
  'scripts/evaluate-qore-extreme-heat-shadow.mjs',
  'scripts/lib/qore-extreme-heat-shadow.mjs',
  'scripts/test-qore-extreme-heat-shadow.mjs',
])
const unexpectedReferences = sourceFiles(repoRoot)
  .map((filePath) => path.relative(repoRoot, filePath))
  .filter((relativePath) => (
    fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
      .includes('qore-extreme-heat-shadow')
    && !allowedReferences.has(relativePath)
  ))
assert.deepEqual(
  unexpectedReferences,
  [],
  'no runtime source may import or expose the extreme-heat research shadow',
)

const resultPath = path.join(
  repoRoot,
  'data/qore/research/extreme-heat-shadow-audit.json',
)
assert.ok(fs.existsSync(resultPath), 'the versioned extreme-heat audit must be generated')
const replayRelativePath = `.local/qore/research/extreme-heat-shadow-test-${process.pid}.json`
const replayPath = path.join(repoRoot, replayRelativePath)
fs.mkdirSync(path.dirname(replayPath), { recursive: true })
try {
  execFileSync(process.execPath, [
    'scripts/evaluate-qore-extreme-heat-shadow.mjs',
    `--output=${replayRelativePath}`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert.deepEqual(
    fs.readFileSync(replayPath),
    fs.readFileSync(resultPath),
    'the versioned extreme-heat audit must byte-match a fresh deterministic replay',
  )
} finally {
  fs.rmSync(replayPath, { force: true })
}

const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
const { evaluationDigestSha256, ...resultWithoutDigest } = result
assert.equal(
  extremeHeatValueDigestSha256(resultWithoutDigest),
  evaluationDigestSha256,
)
assert.equal(
  evaluationDigestSha256,
  '2867dbee3e427b87e3ab58c5c684086bb4273f4d6ecb987063c630e09182321f',
)
assert.equal(result.contractDigestSha256, EXTREME_HEAT_SHADOW_DIGEST_SHA256)
assert.equal(
  result.candidateFamilyDigestSha256,
  EXTREME_HEAT_CANDIDATE_FAMILY_DIGEST_SHA256,
)
assert.equal(result.executionEligible, false)
assert.equal(result.promotionEligible, false)
assert.equal(result.activeStrategyChanged, false)
assert.equal(result.baselineTieOut.pass, true)
assert.equal(result.evaluatedThrough, '2026-07-14')
assert.equal(result.candidateSummaries.length, 16)
assert.equal(result.multipleTesting.bootstrapIterations, 10_000)
assert.deepEqual(result.multipleTesting.blockLengths, [1, 5, 10, 20, 60])
assert.equal(result.multipleTesting.exactObservationCount, 1_005)
assert.equal(result.multipleTesting.focalRequestedFamily.candidateCount, 3)
assert.equal(result.multipleTesting.fullSensitivityFamily.candidateCount, 16)
for (const family of [
  result.multipleTesting.focalRequestedFamily,
  result.multipleTesting.fullSensitivityFamily,
]) {
  assert.deepEqual(
    family.familyAdjustedCircularBlockBootstrap.map(({ blockLength }) => blockLength),
    [1, 5, 10, 20, 60],
  )
  assert.ok(
    family.familyAdjustedCircularBlockBootstrap.every(
      ({ iterations }) => iterations === 10_000,
    ),
  )
}
assert.equal(result.causalInputAudit.storage.checkedExtremeHeatSessions, 48)
assert.equal(result.causalInputAudit.storage.mismatches, 0)
assert.equal(result.causalInputAudit.storage.minimumPeerCount, 5)
assert.equal(result.causalInputAudit.storage.maximumPeerCount, 5)
assert.equal(result.causalInputAudit.price.extremeForecastEpisodeCount, 16)
assert.equal(result.causalInputAudit.price.completeExactIssueReturnContexts, 11)
assert.equal(result.causalInputAudit.price.unavailableExactIssueReturnContexts, 5)
assert.deepEqual(
  result.causalInputAudit.price.unavailableExactIssueDates,
  [
    '2021-05-30',
    '2021-09-06',
    '2023-06-19',
    '2023-08-27',
    '2024-07-07',
  ],
)
assert.equal(result.causalInputAudit.price.completeThreeSessionContexts, 16)
assert.equal(result.causalInputAudit.price.precedingSessionMappingCount, 5)
assert.equal(result.causalInputAudit.price.causalTimingFailures, 0)
assert.deepEqual(
  result.inputBindings.executionMarketInputs.map(({ role, path: bindingPath }) => [
    role,
    bindingPath,
  ]),
  [
    ['ung-adjusted-market-bars', 'data/qore/market/yahoo/UNG-daily.csv'],
    ['voo-adjusted-market-bars', 'data/qore/market/yahoo/VOO-daily.csv'],
    ['qqqm-adjusted-market-bars', 'data/qore/market/yahoo/QQQM-daily.csv'],
    ['index-basket-weights', 'data/qore/market/index-basket-config.json'],
  ],
)
assert.deepEqual(
  result.inputBindings.researchImplementations.map(({ role, path: bindingPath }) => [
    role,
    bindingPath,
  ]),
  [
    ['extreme-heat-candidate-contract', 'scripts/lib/qore-extreme-heat-shadow.mjs'],
    ['extreme-heat-causal-evaluator', 'scripts/evaluate-qore-extreme-heat-shadow.mjs'],
    ['shared-eia-release-calendar-parser', 'scripts/lib/eia-release-time.mjs'],
    ['shared-preopen-availability-boundary', 'scripts/lib/qore-signal-availability.mjs'],
    ['shared-execution-simulator', 'scripts/lib/qore-research-execution.mjs'],
    ['shared-rebalance-deadband', 'scripts/lib/qore-rebalance-deadband.mjs'],
    ['node-package-contract', 'package.json'],
    ['node-dependency-lock', 'package-lock.json'],
  ],
)
for (const binding of [
  result.inputBindings.selectedTrades,
  result.inputBindings.runSummary,
  result.inputBindings.ngSignalMarket,
  result.inputBindings.executionContract,
  result.inputBindings.storage,
  result.inputBindings.storageReleaseCalendar,
  ...result.inputBindings.executionMarketInputs,
  ...result.inputBindings.researchImplementations,
]) {
  assert.equal(fileDigest(binding.path), binding.digestSha256)
}

const focalReviews = new Map(
  result.focalStrategyReviews.map((review) => [review.candidateId, review]),
)
assert.deepEqual([...focalReviews.keys()], EXTREME_HEAT_FOCAL_CANDIDATE_IDS)
const expectedFocalResults = {
  'extreme-heat-storage-deficit-only-v1': {
    changedSessions: 27,
    forecastEpisodes: 9,
    independentEpisodes: 4,
    selectionPrefix: 8.671668,
    reportOnly2025: -2.417878,
    full: 6.25379,
  },
  'extreme-heat-issue-price-not-up-v1': {
    changedSessions: 33,
    forecastEpisodes: 11,
    independentEpisodes: 8,
    selectionPrefix: 1.948531,
    reportOnly2025: 3.756614,
    full: 5.705144,
  },
  'extreme-heat-three-session-price-not-up-v1': {
    changedSessions: 33,
    forecastEpisodes: 11,
    independentEpisodes: 9,
    selectionPrefix: 0.598154,
    reportOnly2025: 3.756614,
    full: 4.354768,
  },
}
for (const [candidateId, expected] of Object.entries(expectedFocalResults)) {
  const review = focalReviews.get(candidateId)
  assert.equal(review.verdict, 'reject-inclusion')
  assert.equal(review.changedForecasts.changedSessionCount, expected.changedSessions)
  assert.equal(review.changedForecasts.forecastEpisodeCount, expected.forecastEpisodes)
  assert.equal(
    review.episodeRobustness.fullCalendar.independentEpisodeCount,
    expected.independentEpisodes,
  )
  assert.ok(
    Math.abs(review.episodeRobustness.fullCalendar.unattributedIncrementalDailySumPct)
      < 0.00001,
  )
  assert.equal(
    review.periods.selectionPrefix.incrementalDailySumPct,
    expected.selectionPrefix,
  )
  assert.equal(
    review.periods.reportOnly2025.incrementalDailySumPct,
    expected.reportOnly2025,
  )
  assert.equal(review.periods.full.incrementalDailySumPct, expected.full)
  assert.equal(review.inclusionChecks.sufficientIndependentChangedEpisodes, false)
  assert.equal(review.inclusionChecks.positiveAfterRemovingBestThreeEpisodes, false)
  assert.equal(review.inclusionChecks.correctedSummerTemporalContractRepresented, false)
  assert.equal(review.inclusionChecks.directHistoricalPromotionAllowed, false)
  assert.deepEqual(
    review.fixedCandidateCircularBlockBootstrap.map(({ blockLength }) => blockLength),
    [1, 5, 10, 20, 60],
  )
}
assert.equal(
  focalReviews.get('extreme-heat-storage-deficit-only-v1')
    .inclusionChecks.positiveReportOnly2025,
  false,
)
assert.deepEqual(
  focalReviews.get('extreme-heat-issue-price-not-up-v1')
    .changedForecasts.forecastEpisodesByReason,
  {
    'issue-price-already-up': 6,
    'issue-price-unavailable': 5,
  },
)
assert.equal(
  result.issuePricePrecedingSessionProxySensitivity.changedForecasts.forecastEpisodeCount,
  10,
)
assert.equal(
  result.issuePricePrecedingSessionProxySensitivity.periods.selectionPrefix
    .incrementalDailySumPct,
  0.444387,
)
assert.equal(
  result.issuePricePrecedingSessionProxySensitivity.periods.full.incrementalDailySumPct,
  4.201001,
)
for (const candidateId of EXTREME_HEAT_FOCAL_CANDIDATE_IDS.slice(1)) {
  assert.equal(
    focalReviews.get(candidateId)
      .inclusionChecks.positiveSelectionLeaveOneChangedYear,
    false,
  )
  assert.equal(
    focalReviews.get(candidateId).inclusionChecks.priceTimingSpecificity,
    false,
  )
  assert.ok(result.temporalNegativeControls[candidateId])
}
for (const scenario of ['baseline', 'elevated', 'stress']) {
  assert.deepEqual(
    Object.keys(result.frictionScenarios[scenario].focalCandidates),
    EXTREME_HEAT_FOCAL_CANDIDATE_IDS,
  )
}
assert.ok(result.storageSeasonalDefinitionSensitivity.periods.full)
for (const candidateId of EXTREME_HEAT_FOCAL_CANDIDATE_IDS) {
  assert.ok(
    result.extremeDefinitionSensitivity[candidateId][
      'aggregate-6F-at-least-6-fixed-8F-extreme-locations'
    ],
  )
  assert.ok(
    result.extremeDefinitionSensitivity[candidateId][
      'aggregate-10F-at-least-10-fixed-8F-extreme-locations'
    ],
  )
}
assert.equal(result.july2026Incident.auditTreatment, 'context-only-not-recomputed')
assert.match(
  result.decision.reasons.join(' '),
  /exact demand-revision and production-vintage hypothesis cannot be reconstructed/,
)

console.log('QORE extreme-heat shadow tests passed.')
