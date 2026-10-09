import assert from 'node:assert/strict'
import { budgetSlices, exposureSlices, unavailableExposureSleeves } from '../src/hub/allocationCharts.ts'
import { paperOutcomeLabel } from '../src/hub/paperLabels.ts'

const strategies = [{ id: 'first', name: 'First strategy' }, { id: 'second', name: 'Second strategy' }]
const allocations = [{ strategyId: 'first', capitalUsd: 40, enabled: true }, { strategyId: 'second', capitalUsd: 35, enabled: false }]
const slices = budgetSlices(100, allocations, strategies)
assert.equal(slices.reduce((sum, slice) => sum + slice.value, 0), 100)
assert.deepEqual(slices.map(s => [s.name, s.value, s.paused]), [['First strategy', 40, false], ['Second strategy', 35, true], ['Unassigned', 25, false]])
assert.equal(budgetSlices(100, [{ ...allocations[0], capitalUsd: 0 }], strategies)[0].name, 'Unassigned')
assert.equal(budgetSlices(50, allocations, strategies), null, 'overallocated drafts cannot be normalized into a valid pie')
for (const invalid of [0, -1, NaN, Infinity]) assert.equal(budgetSlices(invalid, allocations, strategies), null)
for (const invalid of [-1, NaN, Infinity]) assert.equal(budgetSlices(100, [{ ...allocations[0], capitalUsd: invalid }], strategies), null)
assert.ok(budgetSlices(0.3, [{ ...allocations[0], capitalUsd: 0.1 }, { ...allocations[1], capitalUsd: 0.2 }], strategies), 'cent rounding must not reject a fully allocated budget')
assert.equal(budgetSlices(100, [{ ...allocations[1], enabled: true }], strategies)[0].color, slices[1].color, 'colors survive pausing and removing other allocations')
// Two opposing sleeves can net to zero while still carrying gross instrument exposure.
const gross = exposureSlices([{ symbol: 'SPY', targetUsd: 0, sleeveGrossUsd: 80 }, { symbol: 'UNG', targetUsd: -20, sleeveGrossUsd: 20 }, { symbol: 'VOO', targetUsd: 0, sleeveGrossUsd: 0 }])
assert.deepEqual(gross.map(s => [s.name, s.value]), [['SPY', 80], ['UNG', 20]])
assert.deepEqual(exposureSlices([]), [])
assert.equal(exposureSlices([{ symbol: 'SPY', sleeveGrossUsd: NaN }]), null)
assert.equal(exposureSlices([{ symbol: 'SPY', sleeveGrossUsd: -10 }]), null)
assert.deepEqual(unavailableExposureSleeves([
  { name: 'Ready', enabled: true, capitalUsd: 50, status: 'ready' },
  { name: 'Missing', enabled: true, capitalUsd: 50, status: 'unavailable' },
  { name: 'Paused', enabled: false, capitalUsd: 50, status: 'unavailable' },
  { name: 'Unfunded', enabled: true, capitalUsd: 0, status: 'unavailable' },
]), ['Missing'])
assert.equal(paperOutcomeLabel('ORIGINAL_DEVELOPMENT_SELECTION_FAILED_PRESERVED'), 'Original selection failed')
assert.equal(paperOutcomeLabel('ORIGINAL_RETURN_AND_STABILITY_SCREENS_FAILED_PRESERVED'), 'Return and stability screens failed')
console.log('PASS: allocation percentages preserve paused budgets, unassigned capital, cent rounding, invalid drafts and gross long/short exposure')
