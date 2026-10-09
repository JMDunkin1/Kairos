import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { portfolioSymbols, fresh, money } from './qore-portfolio-plan.mjs'
import { regularJson, atomicJson, withPortfolioLock, portfolioStore, readPortfolioChain } from './qore-portfolio-control.mjs'

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const finite = v => typeof v === 'number' && Number.isFinite(v)
const sessionDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export function shadowPolicy(root) {
  const policy = regularJson(path.join(root, 'config/qore-portfolio-shadow.json'))
  if (policy.schemaVersion !== 1 || policy.policyId !== 'prospective-etf-shadow-v1' || policy.ordersEnabled !== false || ['feeBps', 'slippageBps', 'shortBorrowAprPct', 'debitAprPct'].some(k => !finite(policy[k]) || policy[k] < 0 || policy[k] > 100) || ['maxQuoteAgeSeconds', 'maxSpreadBps', 'maxPendingAgeSeconds'].some(k => !finite(policy[k]) || policy[k] <= 0 || policy[k] > 300)) throw new Error('Invalid prospective shadow policy.')
  return policy
}
export function validateQuotes(value, policy, now) {
  if (value?.schemaVersion !== 1 || value?.source !== 'alpaca-latest-quotes' || !fresh(value.recordedAt, now, policy.maxQuoteAgeSeconds * 1000) || !value.quotes || Object.keys(value.quotes).sort().join(',') !== [...portfolioSymbols].sort().join(',')) throw new Error('Fresh prospective Alpaca quotes are required.')
  const quotes = {}
  for (const symbol of portfolioSymbols) {
    const quote = value.quotes[symbol]
    if (!fresh(quote?.observedAt, now, policy.maxQuoteAgeSeconds * 1000) || Date.parse(quote.observedAt) > Math.min(now, Date.parse(value.recordedAt)) || !finite(quote.bid) || !finite(quote.ask) || quote.bid <= 0 || quote.ask < quote.bid || !finite(quote.bidSize) || !finite(quote.askSize) || quote.bidSize <= 0 || quote.askSize <= 0 || (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) * 10_000 > policy.maxSpreadBps) throw new Error('A quote is stale, future-dated, crossed, empty or outside the spread cap.')
    quotes[symbol] = { observedAt: new Date(quote.observedAt).toISOString(), bid: quote.bid, ask: quote.ask, bidSize: quote.bidSize, askSize: quote.askSize }
  }
  return { schemaVersion: 1, source: value.source, recordedAt: new Date(value.recordedAt).toISOString(), quotes }
}
function files(directory) {
  try {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Invalid shadow journal directory.')
    return fs.readdirSync(directory).filter(name => /^\d{12}\.json$/.test(name)).sort()
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
function latestRecord(directory) {
  const names = files(directory)
  return readPortfolioChain(directory, names, 'sequence', 4 * 1024 * 1024, record => {
    if (record.mode !== 'prospective-shadow' || record.ordersEnabled !== false || !Number.isFinite(Date.parse(record.recordedAt))) throw new Error('Shadow journal integrity check failed.')
  })
}
export function shadowSummary(stateDirectory) {
  const record = latestRecord(path.join(stateDirectory, 'shadow/observations'))
  if (!record) return { mode: 'prospective-shadow', status: 'unstarted', ordersEnabled: false, observations: 0, actualAccountPerformance: false, sleeves: [] }
  // Only derived accounting values and fixed diagnostics cross the browser boundary.
  const state = record.state
  return { mode: 'prospective-shadow', status: record.status, ordersEnabled: false, actualAccountPerformance: false, observations: record.sequence, recordedAt: record.recordedAt, revision: record.revision,
    navUsd: money(state.navUsd), contributedUsd: money(state.contributedUsd), pnlUsd: money(state.navUsd - state.contributedUsd), feesUsd: money(state.feesUsd), financingUsd: money(state.financingUsd), pending: Boolean(state.pending),
    sleeves: Object.values(state.sleeves).map(s => ({ strategyId: s.strategyId, navUsd: money(s.navUsd), contributedUsd: money(s.contributedUsd), pnlUsd: money(s.navUsd - s.contributedUsd), feesUsd: money(s.feesUsd), financingUsd: money(s.financingUsd) })) }
}

export function observeShadow({ stateDirectory, snapshot, quotePacket, policy, now = Date.now() }) {
  return withPortfolioLock(stateDirectory, () => {
    const saved = portfolioStore(stateDirectory, snapshot.strategies).read()
    if (snapshot.revision !== saved.revision || JSON.stringify(snapshot.config) !== JSON.stringify(saved.config)) throw new Error('The saved portfolio changed. Capture a fresh snapshot before observing.')
    const quotes = validateQuotes(quotePacket, policy, now), directory = path.join(stateDirectory, 'shadow/observations'), previous = latestRecord(directory)
    const policyHash = hash(policy)
    if (previous && previous.policySha256 !== policyHash) throw new Error('Shadow cost policy changed. Start a separately named evaluation directory; the original journal is preserved.')
    if (previous && (now <= Date.parse(previous.recordedAt) || Date.parse(quotes.recordedAt) <= Date.parse(previous.quotes.recordedAt))) throw new Error('Shadow observations must advance chronologically; repeated packets cannot generate fills.')
    if (!snapshot || snapshot.ordersEnabled !== false || snapshot.plan?.ordersEnabled !== false || snapshot.plan.generatedAt !== new Date(now).toISOString()) throw new Error('A current no-order portfolio snapshot is required.')
    const config = snapshot.config
    const state = previous ? structuredClone(previous.state) : { contributedUsd: config.capitalUsd, unassignedCashUsd: config.capitalUsd, navUsd: config.capitalUsd, feesUsd: 0, financingUsd: 0, sleeves: {}, pending: null, wealthIndex: 1, highWaterIndex: 1, day: sessionDay(now), dayStartIndex: 1 }
    const previousNav = state.navUsd, previousContribution = state.contributedUsd
    const mids = Object.fromEntries(portfolioSymbols.map(symbol => [symbol, (quotes.quotes[symbol].bid + quotes.quotes[symbol].ask) / 2]))
    const elapsedYears = previous ? (now - Date.parse(previous.recordedAt)) / (365.25 * 86_400_000) : 0
    for (const sleeve of Object.values(state.sleeves)) {
      const financing = Object.entries(sleeve.positions).reduce((sum, [symbol, quantity]) => sum + Math.max(0, -quantity * mids[symbol]) * policy.shortBorrowAprPct / 100 * elapsedYears, 0) + Math.max(0, -sleeve.cashUsd) * policy.debitAprPct / 100 * elapsedYears
      sleeve.cashUsd -= financing; sleeve.financingUsd += financing; state.financingUsd += financing
      sleeve.navUsd = sleeve.cashUsd + Object.entries(sleeve.positions).reduce((sum, [symbol, quantity]) => sum + quantity * mids[symbol], 0)
    }
    const markNav = state.unassignedCashUsd + Object.values(state.sleeves).reduce((sum, sleeve) => sum + sleeve.navUsd, 0)
    if (!finite(markNav) || markNav <= 0 || previousNav <= 0) throw new Error('Shadow equity is exhausted or invalid; evaluation requires operator review.')
    state.wealthIndex *= markNav / previousNav
    if (state.day !== sessionDay(now)) { state.day = sessionDay(now); state.dayStartIndex = previous?.state.wealthIndex ?? state.wealthIndex }
    state.highWaterIndex = Math.max(state.highWaterIndex, state.wealthIndex)
    const lossBlocked = (state.wealthIndex / state.dayStartIndex - 1) * 100 <= -config.limits.maxDailyLossPct || (1 - state.wealthIndex / state.highWaterIndex) * 100 >= config.limits.maxDrawdownPct
    const signature = hash({ revision: snapshot.revision, config, sleeves: snapshot.plan.sleeves.map(s => ({ strategyId: s.strategyId, targets: s.targets })), inputs: snapshot.inputs.map(i => ({ strategyId: i.strategyId, version: i.version, generatedAt: i.generatedAt })) })
    let status = snapshot.plan.status === 'ready' && !lossBlocked ? 'waiting-for-next-quote' : lossBlocked ? 'shadow-risk-stop' : snapshot.plan.status
    const fills = []
    if (status !== 'waiting-for-next-quote') state.pending = null
    else {
      const pending = state.pending
      const pendingCurrent = pending && pending.signature === signature && now - Date.parse(pending.decidedAt) <= policy.maxPendingAgeSeconds * 1000
      const usable = pendingCurrent && portfolioSymbols.every(symbol => Date.parse(quotes.quotes[symbol].observedAt) > Math.max(Date.parse(pending.decidedAt), Date.parse(pending.quoteObservedAt[symbol])))
      if (usable) {
        const externalFlow = config.capitalUsd - state.contributedUsd
        const targetGross = pending.sleeves.reduce((sum, s) => sum + Object.values(s.targets).reduce((n, v) => n + Math.abs(v), 0), 0)
        const heldGross = Object.values(state.sleeves).reduce((sum, s) => sum + Object.entries(s.positions).reduce((n, [symbol, quantity]) => n + Math.abs(quantity * mids[symbol]), 0), 0)
        // Reserve a conservative upper bound on spread, impact and fees before sizing.
        // The virtual book's own equity owns these caps, independently of Alpaca NAV.
        const halfSpread = policy.maxSpreadBps / 20_000, impact = policy.slippageBps / 10_000, fee = policy.feeBps / 10_000
        const costRate = halfSpread + impact * (1 + halfSpread) + fee * (1 + halfSpread) * (1 + impact)
        const riskNav = markNav + externalFlow - (targetGross + heldGross) * costRate
        if (riskNav <= 0) throw new Error('Insufficient virtual equity after conservative transaction costs.')
        let riskScale = Math.min(1, targetGross ? riskNav * config.limits.maxGrossPct / 100 / targetGross : 1)
        const longs = pending.sleeves.reduce((sum, s) => sum + Object.values(s.targets).reduce((n, v) => n + Math.max(0, v), 0), 0)
        if (longs) riskScale = Math.min(riskScale, riskNav * (1 - config.limits.cashReservePct / 100) / longs)
        for (const symbol of portfolioSymbols) {
          const gross = pending.sleeves.reduce((sum, s) => sum + Math.abs(s.targets[symbol] ?? 0), 0)
          if (gross) riskScale = Math.min(riskScale, riskNav * config.limits.maxSymbolPct / 100 / gross)
        }
        const executionTargets = pending.sleeves.map(s => ({ ...s, targets: Object.fromEntries(Object.entries(s.targets).map(([symbol, v]) => [symbol, v * riskScale])) }))
        // Account observations gate evaluation, but virtual sleeve holdings own its turnover and P&L.
        const virtualTurnover = executionTargets.reduce((sum, target) => sum + portfolioSymbols.reduce((total, symbol) => total + Math.abs((target.targets[symbol] ?? 0) - (state.sleeves[target.strategyId]?.positions[symbol] ?? 0) * mids[symbol]), 0), 0)
        if (virtualTurnover > riskNav * config.limits.maxTurnoverPct / 100) { status = 'shadow-turnover-stop'; state.pending = null }
        else {
          state.unassignedCashUsd += externalFlow; state.contributedUsd = config.capitalUsd
          for (const target of executionTargets) {
            const sleeve = state.sleeves[target.strategyId] ??= { strategyId: target.strategyId, contributedUsd: 0, cashUsd: 0, positions: {}, navUsd: 0, feesUsd: 0, financingUsd: 0 }
            const transfer = target.capitalUsd - sleeve.contributedUsd
            state.unassignedCashUsd -= transfer; sleeve.cashUsd += transfer; sleeve.contributedUsd = target.capitalUsd
            for (const symbol of portfolioSymbols) {
              const quantity = Math.trunc((target.targets[symbol] ?? 0) / mids[symbol] * 1_000_000) / 1_000_000
              const delta = quantity - (sleeve.positions[symbol] ?? 0)
              if (Math.abs(delta) < 1e-9) continue
              const quote = quotes.quotes[symbol], price = (delta > 0 ? quote.ask : quote.bid) * (1 + (delta > 0 ? 1 : -1) * policy.slippageBps / 10_000)
              const notional = delta * price, fee = Math.abs(notional) * policy.feeBps / 10_000
              sleeve.cashUsd -= notional + fee; sleeve.feesUsd += fee; state.feesUsd += fee; sleeve.positions[symbol] = quantity
              fills.push({ strategyId: target.strategyId, symbol, quantity: delta, price, feeUsd: fee, quoteObservedAt: quote.observedAt, decidedAt: pending.decidedAt, modeled: true })
            }
          }
          status = 'modeled-rebalance'; state.pending = null
        }
      }
      if (status !== 'shadow-turnover-stop' && (!pendingCurrent || usable)) state.pending = { signature, decidedAt: new Date(now).toISOString(), quoteObservedAt: Object.fromEntries(portfolioSymbols.map(symbol => [symbol, quotes.quotes[symbol].observedAt])), revision: snapshot.revision, sleeves: snapshot.plan.sleeves.map(s => ({ strategyId: s.strategyId, capitalUsd: s.capitalUsd, targets: s.targets })) }
    }
    for (const sleeve of Object.values(state.sleeves)) sleeve.navUsd = sleeve.cashUsd + Object.entries(sleeve.positions).reduce((sum, [symbol, quantity]) => sum + quantity * mids[symbol], 0)
    state.navUsd = state.unassignedCashUsd + Object.values(state.sleeves).reduce((sum, sleeve) => sum + sleeve.navUsd, 0)
    const flow = state.contributedUsd - previousContribution
    state.wealthIndex *= state.navUsd / (markNav + flow)
    state.highWaterIndex = Math.max(state.highWaterIndex, state.wealthIndex)
    if (!finite(state.navUsd) || !finite(state.wealthIndex) || state.navUsd <= 0 || markNav + flow <= 0) throw new Error('Shadow accounting failed; no observation was committed.')
    if (fills.length) {
      const gross = Object.values(state.sleeves).reduce((sum, s) => sum + Object.entries(s.positions).reduce((total, [symbol, quantity]) => total + Math.abs(quantity * mids[symbol]), 0), 0)
      const cash = state.unassignedCashUsd + Object.values(state.sleeves).reduce((sum, s) => sum + s.cashUsd, 0)
      if (gross > state.navUsd * config.limits.maxGrossPct / 100 + 0.01 || cash < state.navUsd * config.limits.cashReservePct / 100 - 0.01 || portfolioSymbols.some(symbol => Object.values(state.sleeves).reduce((sum, s) => sum + Math.abs((s.positions[symbol] ?? 0) * mids[symbol]), 0) > state.navUsd * config.limits.maxSymbolPct / 100 + 0.01)) throw new Error('Virtual exposure limits failed; no observation was committed.')
    }
    const record = { schemaVersion: 1, sequence: (previous?.sequence ?? 0) + 1, previousSha256: previous?.sha256 ?? null, mode: 'prospective-shadow', ordersEnabled: false, recordedAt: new Date(now).toISOString(), revision: snapshot.revision, policySha256: policyHash, status, quoteSha256: hash(quotes), quotes, fills, flowUsd: flow, state }
    atomicJson(path.join(directory, `${String(record.sequence).padStart(12, '0')}.json`), { ...record, sha256: hash(record) })
    return shadowSummary(stateDirectory)
  })
}
