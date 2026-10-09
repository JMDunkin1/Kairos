import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { defaultPortfolio, validatePortfolio, planPortfolio, ngasTargetInput, targetInputReady } from './lib/qore-portfolio-plan.mjs'
import { portfolioStore, portfolioSnapshot, portfolioTelemetry } from './lib/qore-portfolio-control.mjs'
import { observeShadow, shadowSummary, shadowPolicy, validateQuotes } from './lib/qore-portfolio-shadow.mjs'
import { startHub, desktopCatalog } from './qore-hub-service.mjs'
import { controlStrategies as strategies, controlTime as now, controlTelemetry, controlInput, controlQuotes, expandedControlStrategies } from './test-fixtures/portfolio/control.mjs'

const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'qore-control-'))
const root = process.cwd(), policy = shadowPolicy(root)
const configured = () => { const c = defaultPortfolio(strategies); c.limits.maxSymbolPct = 100; c.allocations[0].capitalUsd = 100_000; c.allocations[0].enabled = true; return c }
const telemetry = controlTelemetry(), inputs = [controlInput()]
let hub
try {
  const config = configured(), plan = planPortfolio(config, strategies, inputs, telemetry, now)
  assert.equal(plan.status, 'ready'); assert.equal(plan.ordersEnabled, false); assert.equal(plan.grossUsd, 95_000); assert.equal(plan.modeledCashUsd, 5000)
  assert.equal(plan.targets.find(t => t.symbol === 'VOO').deltaUsd, 95_000)
  assert.throws(() => validatePortfolio({ ...config, capitalUsd: '100000' }, strategies), /capital/)
  assert.throws(() => validatePortfolio({ ...config, apiKey: 'never-forward-test' }, strategies), /fields/)
  assert.throws(() => validatePortfolio({ ...config, allocations: [...config.allocations, config.allocations[0]] }, strategies), /allocation/)
  const over = structuredClone(config); over.allocations[1].capitalUsd = 1
  assert.throws(() => validatePortfolio(over, strategies), /exceed/)
  const expanded = validatePortfolio(config, [...strategies, ...expandedControlStrategies(64)])
  assert.equal(expanded.allocations.length, 66); assert.ok(expanded.allocations.slice(2).every(a => !a.enabled && a.capitalUsd === 0))

  const opposing = structuredClone(config)
  opposing.allocations.forEach(a => { a.enabled = true; a.capitalUsd = 50_000; a.maxGrossPct = 300; a.riskScale = 3 })
  opposing.limits.maxSymbolPct = 20
  const netted = planPortfolio(opposing, strategies, [controlInput(strategies[0].id, { UNG: 1 }), controlInput(strategies[1].id, { UNG: -1 })], telemetry, now)
  assert.equal(netted.grossUsd, 20_000); assert.equal(netted.netUsd, 0); assert.equal(netted.targets[0].sleeveGrossUsd, 20_000)
  const cashAccount = { ...telemetry, account: { ...telemetry.account, shortingEnabled: false } }
  const blockedShort = planPortfolio(opposing, strategies, [controlInput(strategies[0].id, { UNG: 1 }), controlInput(strategies[1].id, { UNG: -1 })], cashAccount, now)
  assert.equal(blockedShort.status, 'blocked'); assert.ok(blockedShort.reasons.some(reason => reason.includes('short-capable')))
  assert.ok(blockedShort.targets.every(target => target.deltaUsd === null))
  const heldTelemetry = { ...telemetry, positions: [{ symbol: 'VOO', marketValueUsd: 50_000, currentPriceUsd: 100 }] }
  for (const allocationPatch of [{ enabled: false }, { riskScale: 0 }, { capitalUsd: 0 }, { maxGrossPct: 0 }]) {
    const cashConfig = structuredClone(config); Object.assign(cashConfig.allocations[0], allocationPatch)
    const cashPlan = planPortfolio(cashConfig, strategies, [], heldTelemetry, now)
    assert.equal(cashPlan.status, 'ready'); assert.equal(cashPlan.grossUsd, 0)
    assert.equal(cashPlan.targets.find(target => target.symbol === 'VOO').deltaUsd, -50_000)
  }
  const unavailable = planPortfolio(opposing, strategies, inputs, telemetry, now)
  assert.equal(unavailable.status, 'blocked'); assert.ok(unavailable.targets.every(t => t.deltaUsd === null)); assert.equal(unavailable.turnoverUsd, null)
  const stopped = planPortfolio({ ...config, paused: true }, strategies, inputs, telemetry, now)
  assert.equal(stopped.status, 'paused'); assert.ok(stopped.targets.every(t => t.deltaUsd === null))
  for (const patch of [
    { sourceGeneratedAt: new Date(now - 901_000).toISOString() }, { sourceGeneratedAt: new Date(now + 60_000).toISOString() }, { brokerConnected: false }, { mode: 'live' }, { account: { ...telemetry.account, status: 'BLOCKED' } },
    { risk: null }, { risk: { killSwitchEngaged: true, blockedReasons: [] } }, { openOrders: [{}] }, { openOrders: null }, { positions: [{ symbol: 'NG', marketValueUsd: 1 }] },
    { account: { ...telemetry.account, dayPnlPct: -12 } }, { account: { ...telemetry.account, trailingDrawdownPct: 25 } }, { account: { ...telemetry.account, dayPnlPct: null } }, { marketClock: { isOpen: true, timestamp: new Date(now - 31_000).toISOString() } },
  ]) { const blocked = planPortfolio(config, strategies, inputs, { ...telemetry, ...patch }, now); assert.equal(blocked.status, 'blocked'); assert.ok(blocked.targets.every(t => t.deltaUsd === null)) }
  assert.equal(planPortfolio({ ...config, limits: { ...config.limits, maxTurnoverPct: 1 } }, strategies, inputs, telemetry, now).status, 'blocked')
  assert.equal(ngasTargetInput(telemetry, { VOO: 0.8, QQQM: 0.2 }, now).weights.VOO, 0.8)
  const wrongDate = structuredClone(telemetry); wrongDate.strategy.intent.targetDate = '2026-10-08'
  assert.equal(ngasTargetInput(wrongDate, { VOO: 0.8, QQQM: 0.2 }, now).weights, null)
  const foreignInference = structuredClone(telemetry); foreignInference.strategy.inference.strategyId = strategies[1].id
  assert.equal(ngasTargetInput(foreignInference, { VOO: 0.8, QQQM: 0.2 }, now).weights, null)
  assert.equal(targetInputReady({ ...inputs[0], weights: { NG: 1 } }, now), false)
  assert.equal(targetInputReady({ ...inputs[0], expiresAt: 'invalid' }, now), false)
  assert.equal(targetInputReady({ ...inputs[0], generatedAt: new Date(now + 5000).toISOString(), expiresAt: new Date(now + 1000).toISOString() }, now), false)
  assert.equal(targetInputReady({ ...inputs[0], generatedAt: new Date(now + 1000).toISOString() }, now), false)
  const privateTelemetry = portfolioTelemetry({ ...telemetry, accountId: 'never-forward-test', strategy: { ...telemetry.strategy, inference: { ...telemetry.strategy.inference, secret: 'never-forward-test' } } })
  assert.ok(!JSON.stringify(privateTelemetry).includes('never-forward-test'))

  const storeDirectory = path.join(temporary, 'control'), store = portfolioStore(storeDirectory, strategies)
  assert.equal(store.read().revision, 0); assert.equal(fs.existsSync(storeDirectory), false)
  const first = store.save(config, 0); assert.equal(first.revision, 1)
  assert.throws(() => store.save(config, 0), /another session/)
  const changed = structuredClone(config); changed.paused = true
  store.save(changed, 1); const restored = store.restore(1, 2)
  assert.equal(restored.revision, 3); assert.equal(restored.config.paused, false); assert.equal(store.read().history.length, 3)
  fs.writeFileSync(path.join(storeDirectory, 'operation.lock'), 'test-only-lock')
  assert.throws(() => store.save(config, 3), /busy/); fs.unlinkSync(path.join(storeDirectory, 'operation.lock'))
  const tamperDirectory = path.join(temporary, 'tamper'), tamperStore = portfolioStore(tamperDirectory, strategies)
  tamperStore.save(config, 0)
  const filename = path.join(tamperDirectory, 'revisions/000000000001.json'), tampered = JSON.parse(fs.readFileSync(filename)); tampered.config.capitalUsd += 1; fs.writeFileSync(filename, JSON.stringify(tampered))
  assert.throws(() => tamperStore.read(), /integrity/)
  const chainDirectory = path.join(temporary, 'revision-chain'), chainStore = portfolioStore(chainDirectory, strategies)
  chainStore.save(config, 0); chainStore.save(changed, 1); chainStore.save(config, 2)
  assert.equal(chainStore.read().revision, 3)
  const oldestRevision = path.join(chainDirectory, 'revisions/000000000001.json')
  const { sha256: oldDigest, ...oldPayload } = JSON.parse(fs.readFileSync(oldestRevision))
  assert.equal(typeof oldDigest, 'string'); oldPayload.updatedAt = new Date(now).toISOString()
  fs.writeFileSync(oldestRevision, JSON.stringify({ ...oldPayload, sha256: crypto.createHash('sha256').update(JSON.stringify(oldPayload)).digest('hex') }))
  assert.throws(() => chainStore.read(), /chain/)
  assert.throws(() => chainStore.save(config, 3), /chain/)
  assert.equal(fs.existsSync(path.join(chainDirectory, 'revisions/000000000004.json')), false)
  const linked = path.join(temporary, 'linked'); fs.symlinkSync(storeDirectory, linked)
  assert.throws(() => portfolioStore(linked, strategies).save(config, 3), /directory|symbolic/)
  const savedBytes = fs.readFileSync(path.join(storeDirectory, 'revisions/000000000001.json'), 'utf8')
  assert.equal(portfolioSnapshot({ root, stateDirectory: storeDirectory, strategies, telemetry, now }).inputs[1].weights, null)
  assert.equal(fs.readFileSync(path.join(storeDirectory, 'revisions/000000000001.json'), 'utf8'), savedBytes)

  const shadowDirectory = path.join(temporary, 'shadow'), shadowStore = portfolioStore(shadowDirectory, strategies)
  shadowStore.save(config, 0)
  const snap = (time, context = controlTelemetry(time)) => { const saved = shadowStore.read(); return { ...saved, strategies, inputs, plan: planPortfolio(saved.config, strategies, inputs, context, time), ordersEnabled: false } }
  const observe = (time, price = 100, context) => observeShadow({ stateDirectory: shadowDirectory, snapshot: snap(time, context), quotePacket: controlQuotes(time, price), policy, now: time })
  assert.equal(observe(now).status, 'waiting-for-next-quote'); assert.equal(shadowSummary(shadowDirectory).pnlUsd, 0)
  const sameQuote = observeShadow({ stateDirectory: shadowDirectory, snapshot: snap(now + 1000), quotePacket: controlQuotes(now + 1000, 100, now), policy, now: now + 1000 })
  assert.equal(sameQuote.status, 'waiting-for-next-quote'); assert.equal(sameQuote.feesUsd, 0)
  assert.throws(() => validateQuotes(controlQuotes(now + 2000, 100, now + 3000), policy, now + 2000), /future/)
  assert.equal(observe(now + 15_000).status, 'modeled-rebalance')
  assert.ok(shadowSummary(shadowDirectory).feesUsd > 0); assert.ok(shadowSummary(shadowDirectory).pnlUsd < 0)
  assert.throws(() => observe(now + 15_000), /chronologically/)
  const afterLoss = observe(now + 30_000, 90)
  assert.equal(afterLoss.status, 'modeled-rebalance')
  const lossRecord = JSON.parse(fs.readFileSync(path.join(shadowDirectory, 'shadow/observations/000000000004.json')))
  const lossState = lossRecord.state, gross = Object.values(lossState.sleeves).reduce((sum, s) => sum + Math.abs((s.positions.VOO ?? 0) * 90), 0), cash = lossState.unassignedCashUsd + Object.values(lossState.sleeves).reduce((sum, s) => sum + s.cashUsd, 0)
  assert.ok(gross <= lossState.navUsd); assert.ok(cash >= lossState.navUsd * 0.05)
  for (const fill of lossRecord.fills) { assert.ok(Date.parse(fill.quoteObservedAt) > Date.parse(fill.decidedAt)); assert.ok(Date.parse(fill.quoteObservedAt) <= Date.parse(lossRecord.recordedAt)) }
  const depositConfig = structuredClone(config); depositConfig.capitalUsd += 10_000
  shadowStore.save(depositConfig, 1)
  observe(now + 45_000, 90, { ...controlTelemetry(now + 45_000), account: { ...telemetry.account, equityUsd: 120_000 } })
  const beforeDeposit = shadowSummary(shadowDirectory)
  const afterDeposit = observe(now + 60_000, 90, { ...controlTelemetry(now + 60_000), account: { ...telemetry.account, equityUsd: 120_000 } })
  assert.equal(afterDeposit.contributedUsd, 110_000); assert.ok(Math.abs(afterDeposit.pnlUsd - beforeDeposit.pnlUsd) < 100, 'deposit does not become investment profit')
  const staleSnapshot = snap(now + 75_000, { ...controlTelemetry(now + 75_000), account: { ...telemetry.account, equityUsd: 120_000 } })
  shadowStore.save({ ...depositConfig, paused: true }, 2)
  assert.throws(() => observeShadow({ stateDirectory: shadowDirectory, snapshot: staleSnapshot, quotePacket: controlQuotes(now + 75_000, 90), policy, now: now + 75_000 }), /changed/)
  assert.equal(observe(now + 75_000, 90).status, 'paused'); assert.equal(shadowSummary(shadowDirectory).pending, false)
  assert.throws(() => observeShadow({ stateDirectory: shadowDirectory, snapshot: snap(now + 90_000), quotePacket: controlQuotes(now + 90_000), policy: { ...policy, feeBps: 2 }, now: now + 90_000 }), /policy changed/)
  const oldestObservation = path.join(shadowDirectory, 'shadow/observations/000000000001.json')
  const originalObservation = fs.readFileSync(oldestObservation), corruptObservation = JSON.parse(originalObservation)
  corruptObservation.state.navUsd += 1
  fs.writeFileSync(oldestObservation, JSON.stringify(corruptObservation))
  assert.throws(() => shadowSummary(shadowDirectory), /integrity/)
  assert.throws(() => observe(now + 90_000), /integrity/)
  assert.equal(fs.existsSync(path.join(shadowDirectory, 'shadow/observations/000000000008.json')), false)
  fs.writeFileSync(oldestObservation, originalObservation)

  for (const allocationPatch of [{ enabled: false }, { riskScale: 0 }]) {
    const exitDirectory = path.join(temporary, `exit-${Object.keys(allocationPatch)[0]}`), exitStore = portfolioStore(exitDirectory, strategies)
    exitStore.save(config, 0)
    const exitObservation = time => {
      const saved = exitStore.read(), context = controlTelemetry(time)
      return observeShadow({ stateDirectory: exitDirectory, snapshot: { ...saved, strategies, inputs, plan: planPortfolio(saved.config, strategies, inputs, context, time), ordersEnabled: false }, quotePacket: controlQuotes(time), policy, now: time })
    }
    exitObservation(now); assert.equal(exitObservation(now + 15_000).status, 'modeled-rebalance')
    const exitConfig = structuredClone(config); Object.assign(exitConfig.allocations[0], allocationPatch)
    exitStore.save(exitConfig, 1)
    assert.equal(exitObservation(now + 30_000).status, 'waiting-for-next-quote')
    assert.equal(exitObservation(now + 45_000).status, 'modeled-rebalance')
    const exitRecord = JSON.parse(fs.readFileSync(path.join(exitDirectory, 'shadow/observations/000000000004.json')))
    assert.ok(exitRecord.fills.some(fill => fill.quantity < 0))
    assert.ok(Object.values(exitRecord.state.sleeves).every(sleeve => Object.values(sleeve.positions).every(quantity => quantity === 0)))
    assert.ok(exitRecord.state.pending.sleeves.every(sleeve => Object.values(sleeve.targets).every(value => value === 0)))
  }

  const hubState = path.join(temporary, 'hub-state'), runtimeCalls = []
  hub = await startHub({ portfolioRoot: hubState, telemetryEnabled: true, telemetryFactory: () => ({ read: async (endpoint, method) => { runtimeCalls.push([endpoint, method]); return { status: 200, body: telemetry } }, stop: async () => {} }) })
  const actualStrategies = desktopCatalog().strategies, actualConfig = defaultPortfolio(actualStrategies)
  const save = (value, revision = 0, origin = hub.origin) => fetch(hub.origin + '/api/hub/portfolio', { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ config: value, expectedRevision: revision }) })
  assert.equal((await save(actualConfig, 0, 'https://example.invalid')).status, 403)
  assert.equal((await fetch(hub.origin + '/api/hub/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  const races = await Promise.all([save(actualConfig), save({ ...actualConfig, paused: true })]); assert.deepEqual(races.map(r => r.status).sort(), [200, 409])
  const response = await fetch(hub.origin + '/api/hub/portfolio/targets'); assert.equal(response.status, 200)
  const dto = await response.json(); assert.equal(dto.ordersEnabled, false); assert.equal(dto.inputs[1].weights, null); assert.ok(!JSON.stringify(dto).includes('accountId'))
  assert.deepEqual(runtimeCalls, [['/api/live/status', 'GET']])
  for (const endpoint of ['/api/hub/portfolio', '/api/hub/portfolio/shadow', '/api/hub/portfolio/execute', '/api/broker/orders']) assert.equal((await fetch(hub.origin + endpoint, { method: 'POST', headers: { Origin: hub.origin }, body: '{}' })).status, 405)
  assert.equal((await (await fetch(hub.origin + '/api/hub/portfolio/shadow')).json()).status, 'unstarted')
  assert.equal((await save({ ...actualConfig, secret: 'never-forward-test' }, 1)).status, 400)
  const dryRunState = `.local/qore/test-control-${process.pid}`
  const cli = spawnSync(process.execPath, ['--no-experimental-strip-types', 'scripts/qore-portfolio-control.mjs', 'observe', `--state=${dryRunState}`], { cwd: root, encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).ordersEnabled, false); assert.equal(fs.existsSync(path.join(root, dryRunState)), false)
  console.log('PASS: expandable controls, budget validation, conservative netting, freshness/risk refusal, immutable revisions, concurrency, narrow DTOs, chronological shadow fills, virtual-NAV caps, costs, deposit neutrality, pause races, no broker mutations and JS-only runtime compatibility')
} finally { await hub?.stop(); fs.rmSync(temporary, { recursive: true, force: true }) }
