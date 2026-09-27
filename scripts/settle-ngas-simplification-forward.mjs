#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { adjustedBarFromYahooRow, loadResearchExecutionContract, applyExecutionStep, targetWeightsForAllocation } from './lib/qore-research-execution.mjs'
import { previousReviewedMarketSession } from './lib/qore-spatial-demand-revision-shadow.mjs'
import { simplificationNewYorkDate, validateSimplificationForwardRecord, simplificationImplementationCompatible, validateSimplificationSettlement } from './lib/qore-simplification-forward.mjs'

// Settle already committed predictions only. No target is generated or backfilled.
const repo = process.cwd(), root = path.resolve('.local/qore/research/ngas-simplification/forward')
const now = new Date(), today = simplificationNewYorkDate(now)
const clock = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]))
const afterClose = Number(clock.hour) * 60 + Number(clock.minute) >= 16 * 60 + 15
const hash = content => crypto.createHash('sha256').update(content).digest('hex')
const symbols = ['UNG', 'VOO', 'QQQM']
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const contract = loadResearchExecutionContract(repo)
function append(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temp, 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    try { fs.linkSync(temp, file); return true } catch (error) { if (error.code === 'EEXIST') return false; throw error }
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
const series = fs.existsSync(root) ? fs.readdirSync(root).filter(name => /^[a-f0-9]{64}$/.test(name)) : []
let written = 0
const skippedSeries = []
for (const seal of series) {
  const dir = path.join(root, seal), targetsDir = path.join(dir, 'targets'), settlementsDir = path.join(dir, 'settlements')
  if (!fs.existsSync(targetsDir)) continue
  const records = fs.readdirSync(targetsDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(file => ({ file: path.join(targetsDir, file), record: read(path.join(targetsDir, file)) }))
  let compatible = true
  for (const { record } of records) {
    validateSimplificationForwardRecord(record)
    const check = simplificationImplementationCompatible(record, repo)
    if (!check.compatible) { skippedSeries.push({ sealDigest: seal, reason: 'implementation-changed', mismatches: check.mismatches }); compatible = false; break }
  }
  if (!compatible) continue
  for (const { file, record } of records) {
    validateSimplificationForwardRecord(record)
    assert.equal(record.sealDigest, seal)
    const date = record.targetDate, destination = path.join(settlementsDir, `${date}.json`)
    if (date > today || (date === today && !afterClose) || fs.existsSync(destination)) continue
    const previousDate = previousReviewedMarketSession(date), bars = {}, sources = {}
    for (const symbol of symbols) {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`)
      url.searchParams.set('period1', String(Math.floor(Date.parse(previousDate) / 1000)))
      url.searchParams.set('period2', String(Math.floor(Date.parse(date) / 1000) + 86400))
      url.searchParams.set('interval', '1d'); url.searchParams.set('events', 'div,splits')
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'QORE research shadow' } })
      if (!response.ok) throw new Error(`${symbol} settlement HTTP ${response.status}`)
      const payload = await response.text(), data = JSON.parse(payload).chart.result[0]
      const q = data.indicators.quote[0], adj = data.indicators.adjclose[0].adjclose
      const rows = data.timestamp.map((t, i) => adjustedBarFromYahooRow({ date: new Date(t * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], adjustedClose: adj[i] }, symbol))
      const previous = rows.find(r => r.date === previousDate), current = rows.find(r => r.date === date)
      assert.ok(previous && current, `Missing ${symbol} complete settlement bars ${date}`)
      bars[symbol] = { previous, current }
      sources[symbol] = { url: url.href, fetchedAt: new Date().toISOString(), payloadDigest: hash(payload), rawPayload: payload }
    }
    const value = { schemaVersion: 1, targetDate: date, previousDate, generatedAt: new Date().toISOString(), executionEligible: false, sealDigest: seal, targetDigest: hash(fs.readFileSync(file)), executionContractDigest: contract.digest, bars, sources }
    validateSimplificationSettlement(value, record, hash(fs.readFileSync(file)), contract.digest)
    if (append(destination, value)) written++
  }
  // Recompute each candidate's complete prefix; unavailable inputs or missing
  // sessions explicitly break its evaluated prefix rather than inventing returns.
  const state = new Map(), curves = []
  let previousDate = null, commonGap = null
  for (const { file, record } of records) {
    const settlementFile = path.join(settlementsDir, `${record.targetDate}.json`)
    if (!fs.existsSync(settlementFile)) break
    const settlement = read(settlementFile)
    validateSimplificationSettlement(settlement, record, hash(fs.readFileSync(file)), contract.digest)
    if (previousDate && settlement.previousDate !== previousDate) { commonGap = `Missing target session before ${record.targetDate}`; break }
    const day = { date: record.targetDate, previousDate: settlement.previousDate, calendarGapDays: (Date.parse(record.targetDate) - Date.parse(settlement.previousDate)) / 86400000, symbols: {} }
    for (const symbol of symbols) {
      const { previous, current } = settlement.bars[symbol]
      day.symbols[symbol] = { overnightReturnPct: (current.open / previous.close - 1) * 100, intradayReturnPct: (current.close / current.open - 1) * 100, closeToCloseReturnPct: (current.close / previous.close - 1) * 100 }
    }
    for (const [id, candidate] of Object.entries(record.candidates)) for (const scenarioId of ['baseline', 'elevated', 'stress']) {
      const key = `${id}|${scenarioId}`
      if (!state.has(key)) state.set(key, { candidateId: id, scenarioId, equity: 100000, peak: 100000, maxDrawdownPct: 0, execution: { closeWeights: targetWeightsForAllocation(contract), previousDate: settlement.previousDate }, evaluatedSessions: 0, unavailableSince: null })
      const row = state.get(key)
      if (row.unavailableSince) continue
      if (candidate.status !== 'available') { row.unavailableSince = record.targetDate; row.reason = candidate.reason; continue }
      const step = applyExecutionStep({ state: row.execution, day, contract, scenarioId, targetWeights: targetWeightsForAllocation(contract, { gasPosition: candidate.target.gasPosition, investedIndexFraction: candidate.target.indexFraction }) })
      row.equity *= 1 + step.netReturnPct / 100; row.execution = step.state; row.evaluatedSessions++
      row.peak = Math.max(row.peak, row.equity); row.maxDrawdownPct = Math.min(row.maxDrawdownPct, (row.equity / row.peak - 1) * 100)
      curves.push({ date: record.targetDate, candidateId: id, scenarioId, equity: row.equity, gasPosition: candidate.target.gasPosition, netReturnPct: step.netReturnPct })
    }
    previousDate = record.targetDate
  }
  const report = { generatedAt: new Date().toISOString(), sealDigest: seal, evidenceClass: 'local-preopen-research-no-external-chronology-anchor', startingEquity: 100000, initialAllocation: 'Matched 98%-deployed index fallback at preceding close; same for every candidate', lastSettledSession: previousDate, commonGap, results: [...state.values()].map(({ execution: _execution, ...r }) => ({ ...r, pnlUsd: r.equity - 100000, returnPct: (r.equity / 100000 - 1) * 100 })), curves }
  // Derived reports can be replaced; pre-open targets and settlement inputs cannot.
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
console.log(JSON.stringify({ settledNewSessions: written, seriesCount: series.length, skippedSeries, root }))
