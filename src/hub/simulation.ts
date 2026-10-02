import { adapters } from './strategies.ts'
import type { Feed, RunRequest, Sleeve, PortfolioPoint, NettedFill, Trace, Simulation, StrategyAdapter } from './types.ts'

export const engineVersion = 'qore-sleeves-3'
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const solvencyTolerance = 1e-7 // USD floating-point residue, below reconciliation tolerance.
const finite = (n: number, min: number, max: number, label: string) => { if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`) }
const validId = (id: string) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && !['__proto__', 'constructor', 'prototype', 'reserve'].includes(id)
const timestampPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const validDate = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

function validateFeed(feed: Feed) {
  const seen = new Set<string>()
  // Test runs consume development bars for warm-up; validate the whole supplied feed first.
  for (const bar of feed.bars) {
    const key = JSON.stringify([bar.instrument, bar.date])
    if (seen.has(key)) throw new Error(`Missing or duplicate ${bar.instrument} quote for ${bar.date}; execution blocked.`)
    seen.add(key)
    finite(bar.open, .00001, 1e9, 'Open'); finite(bar.close, .00001, 1e9, 'Close')
    finite(bar.incomePerShare ?? 0, 0, 1e6, 'Income per share')
    const [openAt, closeAt, availableAt] = [bar.openAt, bar.closeAt, bar.availableAt].map(value => typeof value === 'string' && timestampPattern.test(value) && validDate(value.slice(0, 10)) ? Date.parse(value) : NaN)
    if (!validDate(bar.date) || ![openAt, closeAt, availableAt].every(Number.isFinite) || !(openAt < closeAt && closeAt <= availableAt) || bar.openAt.slice(0, 10) !== bar.date || bar.closeAt.slice(0, 10) !== bar.date) throw new Error('Invalid quote timestamps.')
  }
}

export function validateRequest(request: RunRequest, feed: Feed) {
  if (!request || !Array.isArray(request.definitions) || !request.definitions.length || request.definitions.length > 24) throw new Error('Choose 1–24 strategy sleeves.')
  if (!['development', 'test'].includes(request.partition)) throw new Error('Choose development or test; protected data is unavailable.')
  finite(request.capital, 1, 100_000_000, 'Capital')
  const ids = new Set<string>()
  for (const d of request.definitions) {
    if (!validId(d.id) || ids.has(d.id)) throw new Error('Strategy IDs must be unique safe identifiers.')
    ids.add(d.id)
    if (typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 120) throw new Error('Invalid strategy name.')
    if (!adapters.some(a => a.id === d.kind) || !['research', 'paused'].includes(d.status)) throw new Error('Unsupported strategy or lifecycle state.')
    if (d.kind === 'ngas-all-year') throw new Error('NGAS needs its separately approved released target feed. Runtime is untouched.')
    if (!Array.isArray(d.instruments) || d.instruments.length !== (d.kind === 'spread' ? 2 : 1) || new Set(d.instruments).size !== d.instruments.length) throw new Error('Strategy leg contract is invalid.')
    for (const id of d.instruments) {
      const instrument = feed.instruments.find(i => i.id === id)
      if (!instrument || !['equity', 'etf'].includes(instrument.kind) || instrument.currency !== 'USD' || instrument.multiplier !== 1) throw new Error(`Unsupported execution product: ${id}.`)
    }
    finite(d.allocation, 0, 1, 'Allocation')
    finite(d.parameters?.lookback, 2, 60, 'Lookback')
    if (!Number.isInteger(d.parameters.lookback)) throw new Error('Lookback must be an integer.')
    finite(d.parameters.threshold, 0, .5, 'Threshold')
    finite(d.parameters.exposure, 0, 1, 'Gross exposure')
  }
  if (sum(request.definitions.map(d => d.allocation)) > 1 + 1e-10) throw new Error('Allocations exceed 100% of capital.')
  const a = request.assumptions
  finite(a?.feeBps, 0, 100, 'Fees (bps)'); finite(a?.slippageBps, 0, 100, 'Slippage (bps)'); finite(a?.borrowAprPct, 0, 100, 'Borrow APR')
  finite(a?.lagSessions, 1, 5, 'Signal lag'); finite(a?.maxAgeDays, 1, 30, 'Maximum signal age')
  if (!Number.isInteger(a.lagSessions)) throw new Error('Lag must be an integer.')
  if (!Array.isArray(request.flows) || request.flows.length > 100) throw new Error('Invalid cash flows.')
  const dates = new Set(feed.bars.filter(b => request.partition === 'test' ? b.date >= feed.testStart : b.date < feed.testStart).map(b => b.date))
  for (const flow of request.flows) {
    if (!dates.has(flow.date) || (!ids.has(flow.sleeveId) && flow.sleeveId !== 'reserve')) throw new Error('Flow must name a selected session and sleeve.')
    finite(flow.amount, -100_000_000, 100_000_000, 'External flow')
  }
}

export function simulate(request: RunRequest, feed: Feed, strategyAdapters: StrategyAdapter[] = adapters): Simulation {
  validateRequest(request, feed)
  validateFeed(feed)
  const definitions = request.definitions
  const instruments = [...new Set(definitions.flatMap(d => d.instruments))]
  const calendar = [...new Set(feed.bars.map(b => b.date))].sort()
  const selected = calendar.filter(date => request.partition === 'test' ? date >= feed.testStart : date < feed.testStart)
  if (!selected.length) throw new Error('Partition has no sessions.')
  const sleeves: Sleeve[] = definitions.map(d => ({ id: d.id, name: d.name, cash: request.capital * d.allocation, contributed: request.capital * d.allocation, positions: {}, fees: 0, slippage: 0, borrow: 0, income: 0, nav: request.capital * d.allocation, pnl: 0, twrPct: 0 }))
  sleeves.push({ id: 'reserve', name: 'Unallocated cash', cash: request.capital * (1 - sum(definitions.map(d => d.allocation))), contributed: request.capital * (1 - sum(definitions.map(d => d.allocation))), positions: {}, fees: 0, slippage: 0, borrow: 0, income: 0, nav: 0, pnl: 0, twrPct: 0 })
  const wealth: Record<string, number> = Object.fromEntries(sleeves.map(s => [s.id, 1]))
  const points: PortfolioPoint[] = [], fills: NettedFill[] = [], traces: Trace[] = []
  const netPositions: Record<string, number> = {}
  let portfolioCash = request.capital, previousNav = request.capital, portfolioWealth = 1, peakWealth = 1
  let previousDate: string | null = null
  for (const date of selected) {
    const index = calendar.indexOf(date)
    const bars = Object.fromEntries(instruments.map(id => {
      const matches = feed.bars.filter(b => b.date === date && b.instrument === id)
      if (matches.length !== 1) throw new Error(`Missing or duplicate ${id} quote for ${date}; execution blocked.`)
      return [id, matches[0]]
    }))
    const openingInstants = new Set(Object.values(bars).map(b => Date.parse(b.openAt)))
    if (openingInstants.size !== 1) throw new Error('Selected instruments must have simultaneous session opens; asynchronous execution is unsupported.')
    const mark = (s: Sleeve, field: 'open' | 'close') => s.cash + sum(Object.entries(s.positions).map(([id, quantity]) => quantity * bars[id][field]))
    const elapsedDays = previousDate ? (Date.parse(date) - Date.parse(previousDate)) / 86400000 : 1
    const borrowBySleeve: Record<string, number> = Object.fromEntries(sleeves.map(s => [s.id, 0]))
    let accountBorrow = 0
    if (previousDate) for (const id of instruments) {
      // Only the prior net account short needs borrowing; virtual longs offset virtual shorts.
      const shortQuantity = Math.max(0, -(netPositions[id] ?? 0))
      const previousClose = feed.bars.find(b => b.date === previousDate && b.instrument === id)!.close
      const borrow = shortQuantity * previousClose * request.assumptions.borrowAprPct / 100 / 360 * elapsedDays
      const sleeveShorts = sleeves.map(s => ({ id: s.id, quantity: Math.max(0, -(s.positions[id] ?? 0)) }))
      const grossShortQuantity = sum(sleeveShorts.map(s => s.quantity))
      for (const s of sleeveShorts) borrowBySleeve[s.id] += grossShortQuantity ? borrow * s.quantity / grossShortQuantity : 0
      accountBorrow += borrow
    }
    // Overnight expenses and opening distributions belong before an opening external flow.
    // Distribution entitlement uses inventory entering the session, never shares just bought.
    portfolioCash -= accountBorrow
    for (const s of sleeves) {
      const income = sum(Object.entries(s.positions).map(([id, q]) => q * (bars[id].incomePerShare ?? 0)))
      s.cash += income - borrowBySleeve[s.id]; portfolioCash += income
      s.borrow += borrowBySleeve[s.id]; s.income += income
    }
    const openNavs = Object.fromEntries(sleeves.map(s => [s.id, mark(s, 'open')]))
    const beforeFlowNav = sum(Object.values(openNavs))
    const openingFlows: Record<string, number> = {}
    for (const flow of request.flows.filter(f => f.date === date)) {
      const s = sleeves.find(s => s.id === flow.sleeveId)!
      if (flow.amount < 0 && -flow.amount > s.cash) throw new Error('Withdrawal exceeds sleeve cash; sell positions in a separate run first.')
      s.cash += flow.amount; s.contributed += flow.amount; portfolioCash += flow.amount
      openingFlows[s.id] = (openingFlows[s.id] ?? 0) + flow.amount
    }
    const flow = sum(Object.values(openingFlows))
    const atOpen = sum(sleeves.map(s => mark(s, 'open')))
    if (beforeFlowNav <= 0 || atOpen <= 0) throw new Error('Non-positive portfolio NAV; simulation blocked.')
    const changes: Record<string, Record<string, number>> = {}
    const decisions = new Map<string, ReturnType<StrategyAdapter['decide']>>()
    const signalDate = calendar[index - request.assumptions.lagSessions]
    const executionOpen = openingInstants.values().next().value!
    const cutSession = calendar[index - request.assumptions.lagSessions + 1]
    const sessionOpen = signalDate ? Math.min(...feed.bars.filter(b => b.date === cutSession && instruments.includes(b.instrument)).map(b => Date.parse(b.openAt))) : Date.parse('1900-01-01T00:00:00Z') + 1
    // Freeze just before the next session open after the lagged signal session.
    // Every sleeve shares this cut, bounded by the earliest execution open.
    const cut = Math.min(sessionOpen, executionOpen) - 1
    const asOf = new Date(cut).toISOString().replace('.000Z', 'Z')
    const history = feed.bars.filter(b => signalDate && b.date <= signalDate && Date.parse(b.availableAt) <= cut && Date.parse(b.closeAt) <= cut).sort((a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt) || a.instrument.localeCompare(b.instrument))
    for (const d of definitions) {
      const s = sleeves.find(s => s.id === d.id)!
      const nav = mark(s, 'open')
      if (nav < -solvencyTolerance) throw new Error(`Insolvent sleeve ${s.id}.`)
      const decision = strategyAdapters.find(a => a.id === d.kind)!.decide({ definition: structuredClone(d), asOf, history: structuredClone(history) })
      if (decision.status === 'unsupported') throw new Error(decision.reason)
      for (const id of d.instruments) {
        const last = history.filter(b => b.instrument === id).at(-1)
        if (signalDate && (!last || (Date.parse(bars[id].openAt) - Date.parse(last.closeAt)) / 86400000 > request.assumptions.maxAgeDays)) throw new Error(`Missing or stale ${id} signal data; execution blocked.`)
      }
      if (Object.entries(decision.weights).some(([id, w]) => !d.instruments.includes(id) || !Number.isFinite(w)) || sum(Object.values(decision.weights).map(Math.abs)) > 1 + 1e-10) throw new Error('Adapter target exceeds its supported contract.')
      const budget = nav / (1 + 2 * (request.assumptions.feeBps + request.assumptions.slippageBps) / 10000)
      changes[s.id] = Object.fromEntries(d.instruments.map(id => [id, (decision.weights[id] ?? 0) * budget / bars[id].open - (s.positions[id] ?? 0)]))
      decisions.set(s.id, decision)
    }
    for (const id of instruments) {
      const deltas = sleeves.map(s => ({ s, delta: changes[s.id]?.[id] ?? 0 }))
      const quantity = sum(deltas.map(d => d.delta))
      const turnover = sum(deltas.map(d => Math.abs(d.delta)))
      const price = bars[id].open
      const slippage = Math.abs(quantity) * price * request.assumptions.slippageBps / 10000
      const fee = Math.abs(quantity) * price * request.assumptions.feeBps / 10000
      // Virtual transfers cross at the opening reference; only external net trades incur costs.
      for (const { s, delta } of deltas) {
        const share = turnover ? Math.abs(delta) / turnover : 0
        s.cash -= delta * price + share * (fee + slippage)
        s.fees += share * fee; s.slippage += share * slippage
        s.positions[id] = (s.positions[id] ?? 0) + delta
      }
      portfolioCash -= quantity * price + fee + slippage
      netPositions[id] = (netPositions[id] ?? 0) + quantity
      if (turnover > 1e-10) fills.push({ date, instrument: id, quantity, referencePrice: price, fillPrice: price * (1 + Math.sign(quantity) * request.assumptions.slippageBps / 10000), fee, slippage, internalCrossQuantity: (turnover - Math.abs(quantity)) / 2 })
    }
    for (const s of sleeves) {
      const previousSleeveNav = points.at(-1)?.sleeves[s.id] ?? s.contributed - (openingFlows[s.id] ?? 0)
      const postFlowOpen = openNavs[s.id] + (openingFlows[s.id] ?? 0)
      s.nav = mark(s, 'close'); s.pnl = s.nav - s.contributed
      if (s.nav < -solvencyTolerance) throw new Error(`Insolvent sleeve ${s.id} after costs and closing marks on ${date}.`)
      if (previousSleeveNav > 0) wealth[s.id] *= openNavs[s.id] / previousSleeveNav
      if (postFlowOpen > 0) wealth[s.id] *= s.nav / postFlowOpen
      s.twrPct = (wealth[s.id] - 1) * 100
      const decision = decisions.get(s.id)
      if (decision) traces.push({ date, sleeveId: s.id, asOf, status: decision.status, reason: decision.reason, weights: decision.weights, positions: { ...s.positions }, cash: s.cash, nav: s.nav })
    }
    const nav = portfolioCash + sum(Object.entries(netPositions).map(([id, q]) => q * bars[id].close))
    const reconciliationError = Math.max(Math.abs(nav - sum(sleeves.map(s => s.nav))), Math.abs(portfolioCash - sum(sleeves.map(s => s.cash))), ...instruments.map(id => Math.abs((netPositions[id] ?? 0) - sum(sleeves.map(s => s.positions[id] ?? 0)))))
    if (reconciliationError > 1e-6 || !Number.isFinite(nav)) throw new Error('Portfolio/sleeve reconciliation failed.')
    portfolioWealth *= beforeFlowNav / previousNav * nav / atOpen
    peakWealth = Math.max(peakWealth, portfolioWealth)
    const contributed = sum(sleeves.map(s => s.contributed))
    points.push({ date, nav, cash: portfolioCash, contributed, pnl: nav - contributed, twrPct: (portfolioWealth - 1) * 100, drawdownPct: (portfolioWealth / peakWealth - 1) * 100, flow, reconciliationError, sleeves: Object.fromEntries(sleeves.map(s => [s.id, s.nav])) })
    previousNav = nav; previousDate = date
  }
  const last = points.at(-1)!
  return { mode: 'paper-simulation', feedId: feed.id, feedVersion: feed.version, exposure: feed.exposure, partition: request.partition, assumptions: { ...request.assumptions }, points, sleeves, fills, traces, positions: netPositions, summary: { nav: last.nav, contributed: last.contributed, pnl: last.pnl, twrPct: last.twrPct, drawdownPct: Math.min(...points.map(p => p.drawdownPct)), fees: sum(sleeves.map(s => s.fees)), slippage: sum(sleeves.map(s => s.slippage)), borrow: sum(sleeves.map(s => s.borrow)), income: sum(sleeves.map(s => s.income)), reconciliationError: Math.max(...points.map(p => p.reconciliationError)) } }
}
