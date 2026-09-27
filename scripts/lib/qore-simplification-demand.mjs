import assert from 'node:assert/strict'
import { SUMMER_FORECAST_LOCATIONS } from './qore-summer-location-universe.mjs'

export const DEMAND_OVERLAY_IDS = ['revision', 'storage', 'revision-storage', 'supply-balance']
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const sources = ['gfs', 'gefs-mean']
const totalWeight = SUMMER_FORECAST_LOCATIONS.reduce((s, x) => s + x.weight, 0)

// Fixed diagnostic rules, independent of returns; no fitting or production routing.
export function revisionFeature(signalDate, currentRows, previousRows, offsets) {
  const targetDate = addDays(signalDate, 7), priorDate = addDays(signalDate, -1)
  const modelRows = sources.map((sourceId) => {
    const current = currentRows.filter(r => r.sourceId === sourceId && r.issueDate === signalDate && r.targetDate === targetDate && Number(r.leadDays) === 7)
    const previous = previousRows.filter(r => r.sourceId === sourceId && r.issueDate === priorDate && r.targetDate === targetDate && Number(r.leadDays) === 8)
    const c = new Map(current.map(r => [r.locationId, r])), p = new Map(previous.map(r => [r.locationId, r]))
    assert.equal(current.length, 18, `${sourceId} current atom ${signalDate}`)
    assert.equal(previous.length, 18, `${sourceId} prior atom ${signalDate}`)
    assert.equal(c.size, 18); assert.equal(p.size, 18)
    const deltas = SUMMER_FORECAST_LOCATIONS.map(({ id, weight }) => {
      const a = c.get(id), b = p.get(id)
      assert.ok(a && b, `Missing location ${id}`)
      for (const r of [a, b]) {
        assert.ok(Math.abs(Number(r.weight) - weight) < 1e-8)
        assert.ok(Number.isFinite(Number(r.forecastMeanF)) && Number(r.forecastMeanF) >= -150 && Number(r.forecastMeanF) <= 160)
        const actualOffsets = r.sampledValidTimeOffsetsHours || r.sampledValidHoursUtc || '0'
        assert.equal(actualOffsets, offsets, `Temporal statistic mismatch ${signalDate}`)
      }
      return { id, weight, deltaF: Math.max(0, Number(a.forecastMeanF) - 65) - Math.max(0, Number(b.forecastMeanF) - 65) }
    })
    return { sourceId, deltas, revisionF: deltas.reduce((s, r) => s + r.weight * r.deltaF, 0) / totalWeight }
  })
  const consensusRevisionF = modelRows.reduce((s, r) => s + r.revisionF, 0) / 2
  const breadth = SUMMER_FORECAST_LOCATIONS.reduce((s, { id, weight }) => s + (modelRows.reduce((sum, r) => sum + r.deltas.find(x => x.id === id).deltaF, 0) / 2 >= 0.25 ? weight : 0), 0) / totalWeight
  return { signalDate, targetDate, priorDate, modelRevisions: modelRows.map(({ sourceId, revisionF }) => ({ sourceId, revisionF })), consensusRevisionF, breadth, passes: consensusRevisionF >= 1 && breadth >= 2 / 3 && modelRows.every(r => r.revisionF > 0), offsets }
}

export function latestSupplyVintage(rows, targetDate) {
  // Release time is not known to be pre-open: admit on a later calendar day.
  return rows.filter(r => (r.releasedAt ?? r.releaseDate) < targetDate).sort((a, b) => (a.originalReleaseDate ?? a.releasedAt ?? a.releaseDate).localeCompare(b.originalReleaseDate ?? b.releasedAt ?? b.releaseDate)).at(-1) ?? null
}

export function demandDecision({ variant, revision, storageDeficit, supply }) {
  assert.ok(DEMAND_OVERLAY_IDS.includes(variant))
  assert.equal(typeof storageDeficit, 'boolean', 'Storage context must be known')
  const storageSurplus = !storageDeficit
  if (variant === 'revision') return revision.passes
  if (variant === 'storage') return !storageSurplus
  if (variant === 'revision-storage') return revision.passes && !storageSurplus
  assert.ok(supply, 'Missing released supply vintage; cannot represent missing as a neutral/pass signal')
  assert.ok(Number.isFinite(supply.productionYoYChangeBcfd) && Number.isFinite(supply.lngYoYChangeBcfd))
  return !(storageSurplus && supply.productionYoYChangeBcfd > supply.lngYoYChangeBcfd)
}
