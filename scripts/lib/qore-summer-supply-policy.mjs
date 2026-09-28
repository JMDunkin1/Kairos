import assert from 'node:assert/strict'

// Economic sign boundaries selected by the operator. The historical threshold
// study did not establish a statistically supported better cutoff.
export const SUMMER_SUPPLY_POLICY = Object.freeze({
  policyId: 'summer-storage-surplus-and-production-less-lng-growth-v1',
  scope: 'summer-heat-long',
  storageSurplusThresholdPct: 0,
  supplyGrowthThresholdBcfd: 0,
  comparisonOperator: 'strictly-greater-than',
  storageUnits: 'percent-above-prior-five-year-seasonal-mean',
  supplyUnits: 'Bcf/d',
  sourceContract: 'eia-steo-archived-monthly-vintages',
  archiveIndexUrl: 'https://www.eia.gov/outlooks/steo/outlook.php',
  observationPolicy: 'latest-completed-month-contemporaneous-estimate',
  comparisonPolicy: 'same-vintage-same-month-prior-year-dry-production-minus-lng-export-growth',
  availabilityPolicy: 'release-and-correction-date-strictly-before-target-session',
  vintageSelectionPolicy: 'latest-original-release-among-causally-available-vintages',
  maximumReleaseAgeDays: 45,
  maximumSnapshotAgeMs: 60 * 60 * 1000,
  missingInputPolicy: 'invalid-context-for-heat-long',
  interpretation: 'partial-supply-pressure-proxy-not-complete-gas-balance',
})

export function projectedSummerSupplyPolicy(policy) {
  if (!policy || typeof policy !== 'object') return null
  return Object.fromEntries(Object.keys(SUMMER_SUPPLY_POLICY).map(key => [key, policy[key] ?? null]))
}

function isoDate(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be an ISO date`)
  assert.equal(new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10), value, `${label} is invalid`)
  return value
}

export function latestSummerSupplyRow(supplyRows, targetDate) {
  isoDate(targetDate, 'targetDate')
  assert.ok(Array.isArray(supplyRows), 'Supply observations must be an array')
  const identities = new Set()
  const eligible = supplyRows.filter(row => {
    isoDate(row.originalReleaseDate, 'originalReleaseDate')
    isoDate(row.releasedAt, 'releasedAt')
    assert.ok(row.releasedAt >= row.originalReleaseDate, 'Supply correction cannot precede release')
    assert.ok(!identities.has(row.originalReleaseDate), 'Duplicate supply release vintage')
    identities.add(row.originalReleaseDate)
    return row.releasedAt < targetDate
  }).sort((a, b) => a.originalReleaseDate.localeCompare(b.originalReleaseDate))
  const latest = eligible.at(-1)
  assert.ok(latest, 'No causally available Summer supply context')
  const ageDays = (Date.parse(targetDate) - Date.parse(latest.originalReleaseDate)) / 86400000
  assert.ok(ageDays <= SUMMER_SUPPLY_POLICY.maximumReleaseAgeDays, 'Summer supply release is stale')
  return latest
}

export function evaluateSummerSupplyPolicy({ storageSurplusPct, supplyRow, targetDate }) {
  assert.ok(Number.isFinite(storageSurplusPct), 'A known seasonal storage surplus is required')
  const row = latestSummerSupplyRow([supplyRow], targetDate)
  assert.equal(row.units, SUMMER_SUPPLY_POLICY.supplyUnits)
  assert.match(row.month, /^\d{4}-(?:0[1-9]|1[0-2])$/)
  assert.ok(row.month < row.originalReleaseDate.slice(0, 7), 'Supply observation month must have completed before release')
  assert.ok(Number.isFinite(row.productionYoYChangeBcfd) && Number.isFinite(row.lngYoYChangeBcfd), 'Supply growth must be finite')
  const growth = row.productionYoYChangeBcfd - row.lngYoYChangeBcfd
  assert.ok(Number.isFinite(row.supplyGrowthLessLngGrowthBcfd) && Math.abs(row.supplyGrowthLessLngGrowthBcfd - growth) < 1e-9, 'Supply growth difference is incoherent')
  const veto = storageSurplusPct > SUMMER_SUPPLY_POLICY.storageSurplusThresholdPct
    && growth > SUMMER_SUPPLY_POLICY.supplyGrowthThresholdBcfd
  return {
    policyId: SUMMER_SUPPLY_POLICY.policyId,
    veto,
    storageSurplusPct,
    supplyGrowthLessLngGrowthBcfd: growth,
    storageSurplusThresholdPct: SUMMER_SUPPLY_POLICY.storageSurplusThresholdPct,
    supplyGrowthThresholdBcfd: SUMMER_SUPPLY_POLICY.supplyGrowthThresholdBcfd,
    sourceReleaseDate: row.originalReleaseDate,
    availableAfterDate: row.releasedAt,
    observationMonth: row.month,
  }
}
