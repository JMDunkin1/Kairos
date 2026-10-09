import assert from 'node:assert/strict'
import { simulate as runSimulation } from '../src/hub/simulation.ts'
import { fixtureFeed } from './test-fixtures/portfolio/fixture.ts'
import { adapters, defaultDefinitions, defaultAssumptions } from './test-fixtures/portfolio/strategies.ts'
import { createCashFlow, selectedFlowSleeve } from '../src/hub/cashFlows.ts'
const simulate = (request, feed, suppliedAdapters = adapters) => runSimulation(request, feed, suppliedAdapters)
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-7, `${msg}: ${a} != ${b}`)
const request = () => ({ definitions: structuredClone(defaultDefinitions), capital: 100000, partition: 'development', assumptions: { ...defaultAssumptions }, flows: [] })
const feed = fixtureFeed()
  const result = simulate(request(), feed)
  const afterRemoval = request()
  afterRemoval.definitions = afterRemoval.definitions.filter(d => d.id !== 'trend-core')
  const repairedTarget = selectedFlowSleeve(afterRemoval.definitions, 'trend-core')
  assert.equal(repairedTarget, afterRemoval.definitions[0].id, 'removed cash-flow target follows the displayed remaining sleeve')
  assert.equal(selectedFlowSleeve(afterRemoval.definitions, 'reserve'), 'reserve', 'unallocated cash selection survives definition changes')
  assert.equal(selectedFlowSleeve([], 'trend-core'), 'reserve', 'empty definitions retain a valid reserve selection')
  const flowDraft = { date: '2026-02-02', amount: 25000, sleeveId: repairedTarget }
  afterRemoval.flows = [createCashFlow(afterRemoval.definitions, flowDraft)]
  assert.equal(simulate(afterRemoval, feed).summary.contributed, 125000, 'flow inserted after removing its prior target produces a valid run')
  assert.throws(() => createCashFlow(afterRemoval.definitions, { ...flowDraft, sleeveId: 'trend-core' }), /Choose a current sleeve/, 'stale targets cannot be inserted')
  assert.deepEqual(result, simulate(request(), feed), 'deterministic repeat')
  const shuffled = structuredClone(feed); shuffled.bars.reverse()
  assert.deepEqual(result, simulate(request(), shuffled), 'feed row order cannot change the shared clock')
  const offsetEquivalent = structuredClone(feed)
  offsetEquivalent.bars.forEach(b => { b.openAt = `${b.date}T09:30:00-05:00`; b.closeAt = b.availableAt = `${b.date}T16:00:00-05:00` })
  assert.deepEqual(result, simulate(request(), offsetEquivalent), 'equivalent UTC and offset timestamps have identical outcomes')
  const shortRequest = { ...request(), definitions: [{ ...structuredClone(defaultDefinitions[0]), allocation: 1, parameters: { lookback: 2, threshold: 0, exposure: 1 } }] }
  const shortFeed = { ...structuredClone(feed), bars: structuredClone(feed.bars.filter(b => b.date <= '2026-01-07')) }
  const lateOffset = structuredClone(shortFeed)
  lateOffset.bars.find(b => b.instrument === 'MKT' && b.date === '2026-01-06').availableAt = '2026-01-06T21:00:00-05:00'
  assert.equal(simulate(shortRequest, shortFeed).traces.find(t => t.date === '2026-01-07').status, 'ready')
  assert.equal(simulate(shortRequest, lateOffset).traces.find(t => t.date === '2026-01-07').status, 'ready', 'prior-session release after UTC midnight is usable before execution')
  const unavailableAtOpen = structuredClone(shortFeed)
  unavailableAtOpen.bars.find(b => b.instrument === 'MKT' && b.date === '2026-01-06').availableAt = '2026-01-07T09:30:00-05:00'
  assert.equal(simulate(shortRequest, unavailableAtOpen).traces.find(t => t.date === '2026-01-07').status, 'warming', 'information arriving exactly at execution cannot satisfy warm-up')
  unavailableAtOpen.bars.find(b => b.instrument === 'MKT' && b.date === '2026-01-06').availableAt = '2026-01-07T09:30:01-05:00'
  assert.equal(simulate(shortRequest, unavailableAtOpen).traces.find(t => t.date === '2026-01-07').status, 'warming', 'information arriving after execution cannot satisfy warm-up')
  const trendAdapter = adapters.find(a => a.id === 'trend')
  assert.equal(trendAdapter.decide({ definition: shortRequest.definitions[0], asOf: '2026-01-06T23:59:59Z', history: lateOffset.bars }).status, 'warming', 'direct adapter calls preserve the instant cut')
  const validOffsetOrder = structuredClone(shortFeed)
  validOffsetOrder.bars.forEach(b => { b.closeAt = b.availableAt = `${b.date}T10:00:00-05:00` })
  assert.doesNotThrow(() => simulate(shortRequest, validOffsetOrder), 'actual close after the open is valid despite lexical ordering')
  const invalidOffsetOrder = structuredClone(shortFeed)
  invalidOffsetOrder.bars[0].openAt = '2026-01-05T09:30:00-05:00'
  invalidOffsetOrder.bars[0].closeAt = invalidOffsetOrder.bars[0].availableAt = '2026-01-05T14:00:00Z'
  assert.throws(() => simulate(shortRequest, invalidOffsetOrder), /Invalid quote timestamps/, 'actual close before the open is rejected')
  const orderedOffsets = structuredClone(shortFeed)
  orderedOffsets.bars.forEach(b => { b.closeAt = b.availableAt = b.instrument === 'MKT' ? `${b.date}T20:00:00Z` : `${b.date}T16:00:00-05:00` })
  simulate(shortRequest, orderedOffsets, [{ ...trendAdapter, decide: context => {
    if (context.asOf === '2026-01-06T14:29:59.999Z') assert.deepEqual(context.history.map(b => b.instrument), ['MKT', 'ALT'], 'history is sorted by close instant')
    return trendAdapter.decide(context)
  } }])
  const positiveOffset = structuredClone(shortFeed)
  positiveOffset.bars.forEach(b => { b.open = b.close = 100; b.openAt = `${b.date}T09:30:00+14:00`; b.closeAt = b.availableAt = `${b.date}T16:00:00+14:00` })
  const positiveBaseline = simulate(shortRequest, positiveOffset)
  const changedSessionClose = structuredClone(positiveOffset)
  changedSessionClose.bars.find(b => b.instrument === 'MKT' && b.date === '2026-01-07').close = 200
  const positiveChanged = simulate(shortRequest, changedSessionClose)
  assert.deepEqual(positiveChanged.traces.map(t => ({ date: t.date, weights: t.weights, asOf: t.asOf })), positiveBaseline.traces.map(t => ({ date: t.date, weights: t.weights, asOf: t.asOf })), '+14:00 current-session close cannot affect opening targets')
  simulate(shortRequest, positiveOffset, [{ ...trendAdapter, decide: context => {
    const session = positiveOffset.bars.find(b => b.instrument === 'MKT' && Date.parse(b.openAt) === Date.parse(context.asOf) + 1)
    if (session) assert.ok(context.history.every(b => b.date < session.date && Date.parse(b.availableAt) < Date.parse(session.openAt) && Date.parse(b.closeAt) < Date.parse(session.openAt)), 'positive-offset history precedes the execution instant and session')
    return trendAdapter.decide(context)
  } }])
  const lagged = simulate({ ...shortRequest, assumptions: { ...shortRequest.assumptions, lagSessions: 2 } }, shortFeed)
  assert.equal(lagged.traces.find(t => t.date === '2026-01-07').asOf, '2026-01-06T14:29:59.999Z', 'additional lag freezes at the preceding session open')
  assert.equal(lagged.traces.find(t => t.date === '2026-01-07').status, 'warming', 'additional lag excludes the immediately preceding close')
  const pairedRequest = { ...shortRequest, definitions: [{ ...structuredClone(defaultDefinitions[2]), allocation: 1, parameters: { lookback: 2, threshold: 0, exposure: 1 } }] }
  const asynchronous = structuredClone(shortFeed)
  asynchronous.bars = asynchronous.bars.filter(b => b.date <= '2026-01-06')
  asynchronous.bars.forEach(b => { b.open = b.close = 100; b.incomePerShare = 0; b.openAt = `${b.date}T${b.instrument === 'ALT' && b.date === '2026-01-06' ? '15:00' : '09:00'}:00Z`; b.closeAt = b.availableAt = `${b.date}T16:00:00Z` })
  const fixedSpread = [{ id: 'spread', version: 'test', decide: () => ({ weights: { MKT: .5, ALT: -.5 }, reason: 'fixed opposing legs', status: 'ready', observedAt: null }) }]
  const asynchronousRequest = { ...pairedRequest, capital: 1000, assumptions: { ...pairedRequest.assumptions, feeBps: 0, slippageBps: 0, borrowAprPct: 0 } }
  assert.throws(() => simulate(asynchronousRequest, asynchronous, fixedSpread), /simultaneous session opens/, 'later leg opening quote cannot size an earlier trade after a valid session')
  asynchronous.bars.find(b => b.instrument === 'ALT' && b.date === '2026-01-06').open *= 2
  assert.throws(() => simulate(asynchronousRequest, asynchronous, fixedSpread), /simultaneous session opens/, 'changing the later opening price remains blocked')
  const equivalentPairedOpens = structuredClone(shortFeed)
  equivalentPairedOpens.bars.filter(b => b.instrument === 'ALT').forEach(b => { b.openAt = `${b.date}T09:30:00-05:00` })
  assert.deepEqual(simulate(pairedRequest, equivalentPairedOpens), simulate(pairedRequest, shortFeed), 'different offset notation at the same opening instant remains supported')
  const observed = adapters.find(a => a.id === 'spread').decide({ definition: { ...structuredClone(defaultDefinitions[2]), parameters: { lookback: 2, threshold: 0, exposure: 1 } }, asOf: '2026-01-06T18:59:59-05:00', history: orderedOffsets.bars.toReversed() })
  assert.equal(observed.observedAt, '2026-01-06T16:00:00-05:00', 'latest observation uses its instant with offset cuts and unsorted history')
  close(result.summary.nav, result.sleeves.reduce((n, s) => n + s.nav, 0), 'NAV attribution')
  close(result.summary.pnl, result.sleeves.reduce((n, s) => n + s.pnl, 0), 'P&L attribution')
  close(result.summary.fees, result.fills.reduce((n, f) => n + f.fee, 0), 'fees once')
  assert.ok(result.summary.reconciliationError < 1e-7)
  assert.ok(result.summary.pnl < 0, 'negative trial retained')
  assert.ok(result.summary.borrow > 0 && result.summary.income !== 0)
  for (const trace of result.traces) assert.ok(trace.asOf < `${trace.date}T14:30:00Z`, 'decision before execution')
  const changed = structuredClone(feed)
  changed.bars.filter(b => b.date > '2026-02-01').forEach(b => { b.open *= 4; b.close *= 4 })
  assert.deepEqual(simulate(request(), changed).points.filter(p => p.date <= '2026-02-01'), result.points.filter(p => p.date <= '2026-02-01'), 'later prices cannot change earlier outcomes')
  const opposed = request()
  opposed.capital = 1000
  opposed.definitions = [0, 1].map(i => ({ ...structuredClone(defaultDefinitions[0]), id: `cross-${i}`, allocation: .5, parameters: { lookback: 2, threshold: 0, exposure: .5 } }))
  const adapter = { id: 'trend', version: 'test', decide: ({ definition }) => ({ weights: { MKT: definition.id === 'cross-0' ? .5 : -.5 }, reason: 'test', status: 'ready', observedAt: null }) }
  const flatFeed = structuredClone(feed)
  flatFeed.bars.forEach(b => { b.open = 100; b.close = 100; b.incomePerShare = 0 })
  const crossed = simulate(opposed, flatFeed, [adapter])
  assert.ok(crossed.fills.every(f => Math.abs(f.quantity) < 1e-10 && f.fee < 1e-10 && f.slippage < 1e-10))
  close(crossed.summary.nav, 1000, 'opposing sleeves net zero NAV change')
  close(crossed.summary.borrow, 0, 'fully offset shorts incur no account borrow')
  assert.ok(crossed.sleeves.every(s => s.borrow === 0), 'fully offset shorts incur no sleeve borrow')
  assert.ok(crossed.fills.some(f => f.internalCrossQuantity > 0))
  const changingCross = simulate(opposed, feed, [adapter])
  assert.ok(Math.abs(changingCross.sleeves[0].pnl) > 1, 'virtual sleeve keeps attribution')
  close(changingCross.summary.pnl, changingCross.sleeves.reduce((n, s) => n + s.pnl, 0), 'opposing sleeve profit reconciliation')
  const bothLong = { ...opposed, definitions: opposed.definitions.map(d => ({ ...d, id: d.id + '-long' })) }
  const shared = simulate(bothLong, feed, [{ ...adapter, decide: () => ({ weights: { MKT: .5 }, reason: 'long test', status: 'ready', observedAt: null }) }])
  close(shared.positions.MKT, shared.sleeves.reduce((n, s) => n + (s.positions.MKT ?? 0), 0), 'shared position netting')
  const twoSessions = { ...flatFeed, bars: flatFeed.bars.filter(b => ['2026-01-09', '2026-01-12'].includes(b.date)) }
  const residualShort = { ...opposed, assumptions: { ...opposed.assumptions, feeBps: 0, slippageBps: 0, borrowAprPct: 36 }, definitions: [
    { ...opposed.definitions[0], id: 'short-a', allocation: .4 },
    { ...opposed.definitions[0], id: 'short-b', allocation: .4 },
    { ...opposed.definitions[0], id: 'long', allocation: .2 },
  ] }
  const priorBorrow = simulate(residualShort, twoSessions, [{ ...adapter, decide: ({ definition, asOf }) => ({ weights: { MKT: asOf === '1900-01-01T00:00:00Z' ? ({ 'short-a': -1, 'short-b': -.5, long: 1 })[definition.id] : 0 }, reason: 'close all after weekend', status: 'ready', observedAt: null }) }])
  close(priorBorrow.positions.MKT, 0, 'shorts closed at second opening')
  close(priorBorrow.summary.borrow, 400 * .36 * 3 / 360, 'borrow on prior net short over calendar gap')
  close(priorBorrow.sleeves.find(s => s.id === 'short-a').borrow, .8, 'borrow allocated to prior short-a inventory')
  close(priorBorrow.sleeves.find(s => s.id === 'short-b').borrow, .4, 'borrow allocated to prior short-b inventory')
  close(priorBorrow.sleeves.find(s => s.id === 'long').borrow, 0, 'long sleeve has no borrow charge')
  close(priorBorrow.summary.nav, 998.8, 'actual borrow deducted once from account NAV')
  close(priorBorrow.summary.borrow, priorBorrow.sleeves.reduce((n, s) => n + s.borrow, 0), 'borrow attribution reconciles')
  const depositedBorrow = simulate({ ...residualShort, flows: [{ date: '2026-01-12', amount: 1000, sleeveId: 'reserve' }] }, twoSessions, [{ ...adapter, decide: ({ definition, asOf }) => ({ weights: { MKT: asOf === '1900-01-01T00:00:00Z' ? ({ 'short-a': -1, 'short-b': -.5, long: 1 })[definition.id] : 0 }, reason: 'close all after weekend', status: 'ready', observedAt: null }) }])
  close(depositedBorrow.summary.nav, 1998.8, 'opening deposit does not change owed overnight borrow')
  close(depositedBorrow.summary.twrPct, -.12, 'overnight borrow valued before deposit for TWR')
  const distributionFeed = structuredClone(twoSessions)
  distributionFeed.bars.forEach(b => { b.incomePerShare = b.date === '2026-01-09' ? 5 : 1 })
  const distributionRequest = { ...opposed, definitions: [{ ...opposed.definitions[0], allocation: 1 }], assumptions: { ...opposed.assumptions, feeBps: 0, slippageBps: 0, borrowAprPct: 0 }, flows: [{ date: '2026-01-12', amount: 1000, sleeveId: 'reserve' }] }
  const distribution = simulate(distributionRequest, distributionFeed, [{ ...adapter, decide: ({ asOf }) => ({ weights: { MKT: asOf === '1900-01-01T00:00:00Z' ? 1 : 0 }, reason: 'sell on distribution day', status: 'ready', observedAt: null }) }])
  close(distribution.summary.income, 10, 'opening buyer gets no prior entitlement; seller retains entering-inventory distribution')
  close(distribution.summary.twrPct, 1, 'opening distribution valued before deposit')
  const newlyFunded = { ...opposed, definitions: [{ ...opposed.definitions[0], id: 'new', allocation: 0 }], assumptions: { ...opposed.assumptions, feeBps: 0, slippageBps: 0, borrowAprPct: 0 }, flows: [{ date: '2026-01-12', amount: 100, sleeveId: 'new' }] }
  const risingFeed = structuredClone(twoSessions)
  risingFeed.bars.filter(b => b.date === '2026-01-12').forEach(b => { b.close = 110 })
  const funded = simulate(newlyFunded, risingFeed, [{ ...adapter, decide: () => ({ weights: { MKT: 1 }, reason: 'long', status: 'ready', observedAt: null }) }])
  close(funded.sleeves[0].pnl, 10, 'first funded session profit')
  close(funded.sleeves[0].twrPct, 10, 'first funded session included in sleeve TWR')
  const cash = request()
  cash.definitions.forEach(d => { d.status = 'paused' })
  cash.flows = [{ date: '2026-02-02', amount: 25000, sleeveId: 'trend-core' }, { date: '2026-02-03', amount: -5000, sleeveId: 'trend-core' }]
  const deposited = simulate(cash, feed)
  close(deposited.summary.nav, 120000, 'deposits and withdrawals')
  close(deposited.summary.pnl, 0, 'flows are not profit')
  close(deposited.summary.twrPct, 0, 'flows are not return')
  assert.ok(deposited.points.every(p => Math.abs(p.drawdownPct) < 1e-7))
  const withDeposit = request()
  withDeposit.flows = [{ date: '2026-02-02', amount: 25000, sleeveId: 'reserve' }]
  const full = simulate(withDeposit, feed)
  close(full.summary.pnl, full.summary.nav - full.summary.contributed, 'profit subtracts contributions')
  const shortWithdrawalFeed = structuredClone(feed)
  shortWithdrawalFeed.bars = shortWithdrawalFeed.bars.filter(b => b.date <= '2026-01-08').map(b => ({ ...b, open: b.date >= '2026-01-07' ? 110 : 100, close: b.date >= '2026-01-06' ? 110 : 100, incomePerShare: 0 }))
  const shortWithdrawalRequest = { ...request(), capital: 1000, definitions: [{ ...structuredClone(defaultDefinitions[1]), id: 'short-final', allocation: .5, parameters: { lookback: 2, threshold: 0, exposure: 1 } }], assumptions: { ...defaultAssumptions, borrowAprPct: 0 } }
  const beforeWithdrawal = simulate(shortWithdrawalRequest, shortWithdrawalFeed)
  assert.ok(beforeWithdrawal.traces.at(-2).positions.MKT < 0, 'withdrawal regression enters final session short')
  shortWithdrawalRequest.flows = [{ date: '2026-01-08', sleeveId: 'short-final', amount: -beforeWithdrawal.points.at(-2).sleeves['short-final'] }]
  assert.throws(() => simulate(shortWithdrawalRequest, shortWithdrawalFeed), /Insolvent sleeve short-final after costs and closing marks/, 'final-session cover costs cannot be hidden by positive reserve NAV')
  const freeWithdrawal = structuredClone(shortWithdrawalRequest)
  freeWithdrawal.assumptions.feeBps = freeWithdrawal.assumptions.slippageBps = 0
  freeWithdrawal.flows[0].amount = -500
  close(simulate(freeWithdrawal, shortWithdrawalFeed).sleeves[0].nav, 0, 'cost-free liquidation at zero sleeve NAV remains supported')
  const missing = structuredClone(feed)
  missing.bars = missing.bars.filter(b => !(b.instrument === 'MKT' && b.date === '2026-02-02'))
  assert.throws(() => simulate(request(), missing), /Missing or duplicate/)
  const stale = structuredClone(feed)
  stale.bars.filter(b => b.date >= '2026-02-02' && b.date < '2026-02-10').forEach(b => { b.availableAt = '2026-05-10T21:00:00Z' })
  assert.throws(() => simulate(request(), stale), /stale/)
  const over = request(); over.definitions[0].allocation = 1
  assert.throws(() => simulate(over, feed), /exceed/)
  const product = structuredClone(feed); product.instruments[0].kind = 'future'
  assert.throws(() => simulate(request(), product), /Unsupported execution product/)
  const test = request(); test.partition = 'test'
  assert.ok(simulate(test, feed).points.every(p => p.date >= feed.testStart))
  const invalidWarmups = [
    { pattern: /Close/, change: b => { b.close = -1 } },
    { pattern: /Open/, change: b => { b.open = NaN } },
    { pattern: /Income per share/, change: b => { b.incomePerShare = -1 } },
    { pattern: /Invalid quote timestamps/, change: b => { b.closeAt = 'invalid' } },
    { pattern: /Invalid quote timestamps/, change: b => { b.availableAt = '2026-03-27T21:00:00' } },
    { pattern: /Invalid quote timestamps/, change: b => { b.availableAt = '2026-02-30T21:00:00Z' } },
    { pattern: /Missing or duplicate/, change: (b, f) => { f.bars.push({ ...b, close: 200 }) } },
  ]
  for (const { pattern, change } of invalidWarmups) {
    const invalidHistory = structuredClone(feed)
    change(invalidHistory.bars.find(b => b.instrument === 'MKT' && b.date === '2026-03-27'), invalidHistory)
    let decisions = 0
    assert.throws(() => simulate(test, invalidHistory, adapters.map(a => ({ ...a, decide: context => { decisions++; return a.decide(context) } }))), pattern, 'test warm-up history must be validated')
    assert.equal(decisions, 0, 'invalid history is rejected before strategy execution')
  }

console.log('PASS: internal portfolio accounting, chronology, netting, flows, costs, borrow, insolvency and missing-data checks; fixtures are not app strategies')

const symphony = request()
symphony.definitions = Array.from({ length: 64 }, (_, i) => ({ ...structuredClone(defaultDefinitions[0]), id: `sleeve-${i}`, name: `Accounting sleeve ${i}`, status: 'paused', allocation: 1 / 64 }))
const multi = simulate(symphony, feed)
assert.equal(multi.sleeves.length, symphony.definitions.length + 1)
close(multi.summary.nav, symphony.capital, 'dozens of cash sleeves reconcile without a fixed sleeve-count limit')
close(multi.summary.twrPct, 0, 'dozens of unchanged cash sleeves do not invent profit')
console.log('PASS: expandable portfolio sleeve count with shared account reconciliation')
