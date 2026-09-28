#!/usr/bin/env node
import assert from 'node:assert/strict'
import { deriveThresholdGrid, thresholdAllowsLong, pairedThresholdBootstrap, selectThresholds, affectedEpisodes } from './research-ngas-supply-thresholds.mjs'
const features = Array.from({ length: 9 }, (_, index) => ({ date: `202${1 + index % 3}-06-${String(index + 1).padStart(2, '0')}`, storageDate: `202${1 + index % 3}-05-${String(index + 1).padStart(2, '0')}`, storageReleaseAt: `202${1 + index % 3}-05-25T14:30:00Z`, supplyReleaseDate: `202${1 + index % 3}-05-${String(index + 1).padStart(2, '0')}`, storageSurplusPct: index, flowPressureBcfd: index / 2 })).sort((a, b) => a.date.localeCompare(b.date))
const grid = deriveThresholdGrid(features)
assert.equal(grid.candidates.length, 9)
assert.deepEqual(deriveThresholdGrid([...features, { ...features[0], date: '2024-06-01', storageSurplusPct: 1e9, flowPressureBcfd: 1e9 }, { ...features[0], date: '2026-09-01', storageSurplusPct: 1e10, flowPressureBcfd: 1e10 }]), grid)
assert.deepEqual(deriveThresholdGrid(features.flatMap((row) => [row, { ...row }])), grid, 'Daily duplicates must not reweight feature quantiles')
const zero = grid.candidates[0]
assert.equal(thresholdAllowsLong({ storageSurplusPct: 0, flowPressureBcfd: 3 }, zero), true)
assert.equal(thresholdAllowsLong({ storageSurplusPct: 3, flowPressureBcfd: 0 }, zero), true)
assert.equal(thresholdAllowsLong({ storageSurplusPct: 1, flowPressureBcfd: 1 }, zero), false)
assert.throws(() => thresholdAllowsLong({ storageSurplusPct: NaN, flowPressureBcfd: 1 }, zero))
const identical = pairedThresholdBootstrap({ a: Array(50).fill(0), b: Array(50).fill(0) }, { resamples: 100 })
assert.ok(identical.rows.every((row) => row.zeroVariance && row.familyAdjustedP === 1 && row.simultaneousLower === 0))
const dates = Array.from({ length: 60 }, (_, index) => `202${1 + Math.floor(index / 20)}-06-${String(index % 20 + 1).padStart(2, '0')}`)
const base = dates.map((date, index) => ({ date, gasPosition: index % 4 ? 0.35 : 0, netReturnPct: (index % 3 - 1) / 10 }))
const rowsById = Object.fromEntries(grid.candidates.map((candidate) => [candidate.id, base.map((row) => ({ ...row }))]))
const parameters = { candidates: grid.candidates, rowsById, baseRows: base, fallbackRows: base, bootstrapOptions: { resamples: 100 } }
const selected = selectThresholds(parameters)
assert.equal(selected.selectedCandidateId, zero.id)
assert.equal(selected.bestThresholdIdentified, false)
const future = { date: '2025-06-01', gasPosition: 0.9, netReturnPct: 50000 }
assert.deepEqual(selectThresholds({ ...parameters, rowsById: Object.fromEntries(Object.entries(rowsById).map(([id, rows]) => [id, [...rows, future]])), baseRows: [...base, future], fallbackRows: [...base, future] }), selected, 'Holdout outcomes must never change selection')
const episodes = affectedEpisodes(base, base.map((row) => ({ ...row, gasPosition: 0 })), base)
assert.equal(episodes.totalIndependentBaselineEpisodes, 1)
assert.equal(episodes.affectedIndependentEpisodes, 1)
console.log('PASS threshold feature cutoffs, vintage deduplication, equality/missing boundaries, bootstrap identical cells, embargo episodes, and heldout selection invariance.')
