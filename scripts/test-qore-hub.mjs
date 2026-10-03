import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { simulate } from '../src/hub/simulation.ts'
import { fixtureFeed } from '../src/hub/fixture.ts'
import { adapters, defaultDefinitions, defaultAssumptions } from '../src/hub/strategies.ts'
import { createCashFlow, selectedFlowSleeve } from '../src/hub/cashFlows.ts'
import { createRunStore, weeklyReport } from './lib/qore-hub-store.mjs'
import { readExperimentLedger } from './lib/qore-hub-ledger.mjs'
import { hubListenerOptions, startHub, unavailableBroker } from './qore-hub-service.mjs'
import { assertHubRuntime } from './lib/qore-hub-runtime.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-hub-'))
const repo = fileURLToPath(new URL('..', import.meta.url))
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-7, `${msg}: ${a} != ${b}`)
const request = () => ({ definitions: structuredClone(defaultDefinitions), capital: 100000, partition: 'development', assumptions: { ...defaultAssumptions }, flows: [] })
const feed = fixtureFeed()
let hub
let serviceProcess
try {
  for (const version of ['20.19.0', '22.12.0', '22.17.9', '23.0.0']) assert.throws(() => assertHubRuntime(version), /requires Node 22.18/)
  for (const version of ['22.18.0', '22.22.1', '24.0.0', '25.0.0']) assert.doesNotThrow(() => assertHubRuntime(version))
  for (const script of ['qore-hub-service.mjs', 'build-qore-desktop.mjs']) {
    const url = new URL(script, import.meta.url).href
    const incompatible = spawnSync(process.execPath, ['--input-type=module', '-e', `Object.defineProperty(process.versions, 'node', { value: '22.12.0' }); await import(${JSON.stringify(url)})`], { encoding: 'utf8' })
    assert.notEqual(incompatible.status, 0)
    assert.match(incompatible.stderr, /requires Node 22.18/, 'runtime checked before TypeScript imports or packaging')
  }
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
  const withdrawalStore = createRunStore(path.join(tmp, 'short-withdrawal'), repo, 'withdrawal-regression', { status: 'available', load: () => shortWithdrawalFeed })
  const blockedWithdrawal = withdrawalStore.run(shortWithdrawalRequest)
  assert.equal(blockedWithdrawal.status, 'blocked'); assert.match(blockedWithdrawal.error, /Insolvent sleeve short-final after costs/)
  assert.deepEqual(withdrawalStore.get(blockedWithdrawal.id).request, shortWithdrawalRequest, 'insolvent trial retains its frozen protocol')
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
  assert.throws(() => unavailableBroker('live').submit([]), /disabled/)
  const store = createRunStore(path.join(tmp, 'store'), repo)
  for (const malformed of [null, [], {}, { ...request(), definitions: [null] }, { ...request(), assumptions: null }, { ...request(), flows: [null] }]) {
    assert.throws(() => store.run(malformed), /Invalid run request envelope/)
  }
  for (const field of ['date', 'sleeveId', 'amount']) {
    const values = field === 'amount' ? [{ bad: true }, [], null, '0', true, undefined, NaN, Infinity] : [{ bad: true }, [], null, 0, true, undefined]
    for (const value of values) {
      const malformed = request()
      malformed.flows = [{ date: '2026-02-02', amount: 0, sleeveId: 'trend-core', [field]: value }]
      assert.throws(() => store.run(malformed), /Invalid run request envelope/, `malformed flow ${field} cannot enter an editable trial`)
    }
  }
  for (const [section, fields] of [['parameters', ['lookback', 'threshold', 'exposure']], ['assumptions', ['feeBps', 'slippageBps', 'borrowAprPct', 'lagSessions', 'maxAgeDays']]]) {
    for (const field of fields) {
      for (const value of [{ bad: true }, [], null, '0', true, undefined, NaN, Infinity]) {
        const malformed = request()
        const target = section === 'parameters' ? malformed.definitions[0].parameters : malformed.assumptions
        target[field] = value
        assert.throws(() => store.run(malformed), /Invalid run request envelope/, `malformed ${section}.${field} cannot enter an editable trial`)
      }
    }
  }
  assert.equal(store.list().length, 0, 'malformed envelopes cannot enter the registry')
  assert.equal(fs.existsSync(path.join(tmp, 'store/experiments.jsonl')), false, 'malformed envelopes cannot freeze a protocol')
  const saved = store.run(request())
  assert.equal(saved.status, 'completed')
  assert.ok(saved.result.summary.pnl < 0, 'well-formed negative trial remains recorded')
  assert.deepEqual(store.get(saved.id), saved)
  const bad = store.run(over, saved.id)
  assert.equal(bad.status, 'blocked')
  assert.equal(store.list().length, 2)
  assert.equal(fs.readFileSync(path.join(tmp, 'store/experiments.jsonl'), 'utf8').trim().split('\n').length, 4)
  assert.equal(weeklyReport(saved).weeks.length, 12)
  close(weeklyReport(saved).weeks.reduce((n, w) => n + w.netPnl, 0), saved.result.summary.pnl, 'weekly P&L reconciles')
  close(weeklyReport(saved).weeks.reduce((n, w) => n + w.executionCosts, 0), saved.result.summary.fees + saved.result.summary.slippage, 'weekly execution costs')
  const blockedStore = createRunStore(path.join(tmp, 'blocked-store'), repo)
  const invalidParameters = request(); invalidParameters.definitions[0].parameters.lookback = 1
  const invalidAssumptions = request(); invalidAssumptions.assumptions.feeBps = -1
  const invalidFlow = request(); invalidFlow.flows = [{ date: '2026-02-01', amount: -5000, sleeveId: 'trend-core' }]
  for (const blockedRequest of [invalidParameters, invalidAssumptions, invalidFlow]) {
    const blocked = blockedStore.run(blockedRequest)
    assert.equal(blocked.status, 'blocked', 'editable semantic failures remain recorded')
    assert.deepEqual(blockedStore.get(blocked.id).request, blockedRequest, 'blocked trials retain their editable protocol')
  }
  assert.equal(blockedStore.list().length, 3)
  const atomicRoot = path.join(tmp, 'atomic-store'), atomicStore = createRunStore(atomicRoot, repo)
  const durable = atomicStore.run(request()), durableBytes = fs.readFileSync(path.join(atomicRoot, 'runs', durable.id + '.json'))
  const writeFileSync = fs.writeFileSync
  try {
    fs.writeFileSync = (file, data, ...options) => {
      if (typeof file === 'number' || typeof file === 'string' && file.startsWith(path.join(atomicRoot, 'runs')) && file.endsWith('.json')) {
        writeFileSync(file, '{"incomplete":'); throw new Error('Interrupted result write')
      }
      return writeFileSync(file, data, ...options)
    }
    assert.throws(() => atomicStore.run(request()), /Interrupted result write/)
  } finally { fs.writeFileSync = writeFileSync }
  assert.equal(atomicStore.list().length, 1, 'interrupted result write cannot poison valid history')
  assert.deepEqual(atomicStore.get(durable.id), durable, 'prior immutable trial remains readable')
  assert.ok(fs.readdirSync(path.join(atomicRoot, 'runs')).every(name => name.endsWith('.json')), 'failed temporary write is cleaned')
  fs.writeFileSync(path.join(atomicRoot, 'runs', '.interrupted-result.tmp'), '{"incomplete":')
  const recovered = atomicStore.run(request())
  assert.equal(atomicStore.list().length, 2, 'crash-left temporary file is ignored and new runs stay available')
  assert.deepEqual(atomicStore.get(recovered.id), recovered)
  const randomUUID = crypto.randomUUID
  try {
    crypto.randomUUID = () => durable.id.slice(4)
    assert.throws(() => atomicStore.run(request()), { code: 'EEXIST' }, 'atomic publication cannot replace an immutable run')
  } finally { crypto.randomUUID = randomUUID }
  assert.deepEqual(fs.readFileSync(path.join(atomicRoot, 'runs', durable.id + '.json')), durableBytes)
  const ledger = path.join(tmp, 'ledger'); fs.mkdirSync(ledger)
  const history = [
    { schema_version: 1, experiment_id: 'study', revision: 1, record_kind: 'study', status: 'failed', title: 'Study', full_frozen_protocol: { budget: 3 }, source_refs: [{ path: '/Users/example/source.csv', sha256: 'a'.repeat(64) }] },
    { schema_version: 1, experiment_id: 'child', revision: 1, record_kind: 'configuration', parent_id: 'study', status: 'nonselected', title: 'Child' },
    { schema_version: 1, experiment_id: 'study', revision: 2, record_kind: 'study', status: 'retry-registered', title: 'Study', full_frozen_protocol: { budget: 4, lookback: 10 }, retry_conditions: 'Parent retry', audit: ['parent audit'], source_refs: [] },
    ...['retry_conditions', 'retry_condition', 'retry'].map((retryField, i) => ({ schema_version: 1, experiment_id: `alias-child-${i}`, revision: 1, record_kind: 'configuration', parent_id: 'study', [retryField]: 'Child retry', [['full_frozen_protocol', 'frozen_protocol', 'protocol'][i]]: { lookback: 2 }, audit_gaps: ['child audit'] })),
  ]
  const ledgerFile = path.join(ledger, 'experiments.jsonl')
  fs.writeFileSync(ledgerFile, history.map(e => JSON.stringify(e)).join('\n') + '\n{"incomplete":')
  const imported = readExperimentLedger(ledger)
  assert.equal(imported.historyCount, history.length); assert.equal(imported.pendingAppend, true)
  assert.equal(imported.experiments.find(e => e.id === 'study').revision, 2)
  assert.match(imported.experiments.find(e => e.id === 'child').protocol, /4/)
  assert.equal(imported.experiments.find(e => e.id === 'child').retry, 'Parent retry', 'absent child aliases inherit parent evidence')
  assert.match(imported.experiments.find(e => e.id === 'child').metrics, /"released_final": null/)
  for (let i = 0; i < 3; i++) {
    const childEvidence = imported.experiments.find(e => e.id === `alias-child-${i}`)
    assert.equal(childEvidence.retry, 'Child retry', 'child retry aliases take precedence over parent aliases')
    assert.deepEqual(JSON.parse(childEvidence.protocol), { lookback: 2 }, 'child protocol aliases take precedence over parent aliases')
    assert.deepEqual(JSON.parse(childEvidence.metrics).audit, ['child audit'], 'child audit gaps take precedence over parent audit')
  }
  const conflict = { ...history[2], status: 'different' }
  fs.writeFileSync(ledgerFile, [...history, conflict].map(e => JSON.stringify(e)).join('\n') + '\n')
  assert.throws(() => readExperimentLedger(ledger), /Conflicting duplicate/)
  fs.writeFileSync(ledgerFile, history.map(e => JSON.stringify(e)).join('\n') + '\n')
  if (!process.argv.includes('--offline')) {
  hub = await startHub({ stateRoot: path.join(tmp, 'api'), ledgerRoot: ledger })
  const origin = hub.origin
  assert.equal((await fetch(origin + '/api/hub/health')).status, 200)
  const catalogResponse = await fetch(origin + '/api/hub/catalog')
  assert.equal(catalogResponse.status, 200)
  const catalog = await catalogResponse.json()
  assert.equal(catalog.reporting.status, 'real-paper-unavailable')
  assert.equal(catalog.reporting.delivery, 'scheduled-email-inactive')
  assert.deepEqual(catalog.reporting.exports, ['buildWeeklyPerformance', 'weeklyCaption', 'renderWeeklyBriefSvg'])
  assert.equal((await fetch(origin + '/api/hub/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: request() }) })).status, 403)
  assert.equal((await fetch(origin + '/api/hub/runs', { headers: { Origin: 'https://evil.example' } })).status, 403)
  const posted = await fetch(origin + '/api/hub/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Qore-Local': '1' }, body: JSON.stringify({ request: request() }) })
  assert.equal(posted.status, 201)
  const record = await posted.json()
  assert.equal(record.status, 'completed')
  assert.equal((await fetch(origin + `/api/hub/runs/${record.id}/report`)).status, 200)
  for (let i = 0; i < 5; i++) assert.equal((await (await fetch(origin + `/api/hub/runs/${record.id}`)).json()).id, record.id)
  assert.equal((await fetch(origin + '/api/broker/live')).status, 404)
  assert.equal((await fetch(origin + '/api/hub/experiments')).status, 200)
  const launcherPort = hub.server.address().port
  assert.deepEqual(hubListenerOptions(['--host', '127.0.0.1', '--port', String(launcherPort), '--strictPort'], { QORE_HUB_PORT: '1' }), { host: '127.0.0.1', port: launcherPort }, 'launcher-selected port takes precedence over the environment')
  assert.deepEqual(hubListenerOptions([], { QORE_HUB_PORT: '4321' }), { host: '127.0.0.1', port: 4321 }, 'native environment port remains supported')
  assert.deepEqual(hubListenerOptions(['--port=4321', '--host=localhost', '--strictPort'], {}), { host: 'localhost', port: 4321 }, 'inline loopback listener flags are supported')
  for (const args of [['--port', '70000'], ['--port', 'invalid'], ['--port=123=456'], ['--port'], ['--host', '0.0.0.0']]) assert.throws(() => hubListenerOptions(args, {}), /Hub port|Missing value|Hub host/, 'invalid or non-loopback listeners are blocked')
  const cliArgs = ['scripts/qore-hub-service.mjs', '--host', '127.0.0.1', '--port', String(launcherPort), '--strictPort']
  const cliEnv = { ...process.env, QORE_HUB_PORT: '1', QORE_HUB_STATE: path.join(tmp, 'launcher'), QORE_HUB_LEDGER_ROOT: ledger, QORE_HUB_PARENT_PID: String(process.pid) }
  const occupied = spawnSync(process.execPath, cliArgs, { cwd: repo, env: cliEnv, encoding: 'utf8', timeout: 10000 })
  assert.notEqual(occupied.status, 0, 'occupied launcher port fails instead of silently choosing another')
  assert.match(occupied.stderr, /EADDRINUSE/, 'strict launcher listener reports the occupied port')
  await new Promise(resolve => hub.server.close(resolve)); hub = null
  serviceProcess = spawn(process.execPath, cliArgs, { cwd: repo, env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let serviceError = ''
  serviceProcess.stderr.on('data', data => { serviceError += data })
  const launcherOrigin = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`CLI service readiness timed out: ${serviceError}`)), 10000)
    serviceProcess.once('error', error => { clearTimeout(timer); reject(error) })
    serviceProcess.once('exit', code => { clearTimeout(timer); reject(new Error(`CLI service exited ${code}: ${serviceError}`)) })
    serviceProcess.stdout.on('data', data => { output += data; if (output.includes('\n')) { clearTimeout(timer); resolve(output.trim().split('\n')[0]) } })
  })
  assert.equal(launcherOrigin, `http://127.0.0.1:${launcherPort}`, 'CLI service binds the port selected by bin/qore')
  assert.equal((await fetch(launcherOrigin + '/api/hub/health')).status, 200, 'launcher-selected port serves the hub')
  assert.match(await (await fetch(launcherOrigin + '/')).text(), /<title>QORE/, 'launcher dashboard readiness probe succeeds on its selected port')
  }
  if (process.argv.includes('--offline')) console.log('PASS: offline hub accounting, causality, reconciliation, immutable persistence, and ledger checks. NOT RUN: API security, HTTP reads and CLI listener coverage.')
  else console.log('PASS: compatible runtime enforcement, deterministic clock, execution-bounded offset cuts/order, simultaneous opening quotes, validated test warm-up history, causality, shared/opposing positions, fees, income, net prior-short borrow attribution, newly funded sleeve TWR, flows/TWR, stale/missing data, unsupported products, frozen negative/blocked trials, report reconciliation, ledger inheritance/revisions/partial append, local API security, repeated reads and launcher-selected CLI port')
} finally {
  if (serviceProcess && serviceProcess.exitCode === null && serviceProcess.signalCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => serviceProcess.kill('SIGKILL'), 5000)
    serviceProcess.once('close', () => { clearTimeout(timer); resolve() })
    serviceProcess.kill('SIGTERM')
  })
  if (hub) await new Promise(resolve => hub.server.close(resolve))
  fs.rmSync(tmp, { recursive: true, force: true })
}
