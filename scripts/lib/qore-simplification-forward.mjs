import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { adjustedBarFromYahooRow } from './qore-research-execution.mjs'
import { previousReviewedMarketSession, spatialDemandRevisionRecordTiming } from './qore-spatial-demand-revision-shadow.mjs'

export const SIMPLIFICATION_PROSPECTIVE_START = '2026-09-28'
export const SIMPLIFICATION_CANDIDATE_IDS = ['current', 'no-summer-shorts', 'ung-price', 'no-summer-shorts-ung-price', 'fallback', 'no-summer-fade+revision', 'no-summer-fade+storage', 'no-summer-fade+revision-storage', 'no-summer-fade+supply-balance']
export const simplificationDigest = content => crypto.createHash('sha256').update(typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content)).digest('hex')

export function simplificationNewYorkDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function simplificationPreopenTiming(now, prospectiveStart) {
  return spatialDemandRevisionRecordTiming({ targetDate: simplificationNewYorkDate(now), generatedAt: now.toISOString(), prospectiveStart })
}

export function validateSimplificationForwardRecord(record) {
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.executionEligible, false)
  assert.equal(record.evidenceClass, 'local-preopen-research-no-external-chronology-anchor')
  assert.match(record.sealDigest, /^[a-f0-9]{64}$/)
  assert.ok(record.seal && typeof record.seal === 'object')
  assert.equal(record.sealDigest, simplificationDigest(record.seal), 'Seal content digest mismatch')
  assert.equal(record.seal.prospectiveStart, SIMPLIFICATION_PROSPECTIVE_START)
  assert.deepEqual(record.seal.candidateIds, SIMPLIFICATION_CANDIDATE_IDS)
  assert.deepEqual(Object.keys(record.candidates), SIMPLIFICATION_CANDIDATE_IDS)
  assert.ok(spatialDemandRevisionRecordTiming({ targetDate: record.targetDate, generatedAt: record.generatedAt, prospectiveStart: record.seal.prospectiveStart }).eligible, 'Prediction was not generated before session open')
  assert.equal(record.targetDate, simplificationNewYorkDate(new Date(record.generatedAt)))
  for (const [id, row] of Object.entries(record.candidates)) {
    assert.equal(row.executionEligible, false, id)
    if (row.status === 'unavailable') {
      assert.equal(row.target, null)
      assert.ok(row.reason)
      continue
    }
    assert.equal(row.status, 'available')
    assert.equal(row.target.targetDate, record.targetDate)
    assert.equal(row.target.cashFraction, 0)
    assert.ok(Number.isFinite(row.target.gasPosition) && Math.abs(row.target.gasPosition) <= 1)
    assert.ok(Math.abs(row.target.indexFraction - (1 - Math.abs(row.target.gasPosition))) < 1e-8)
    assert.ok(row.target.gasPosition === 0 || row.target.signalDate < record.targetDate)
  }
}

// Intentionally owns its wall clock; there is no backfill/test clock in this writer.
export function appendSimplificationForwardRecord({ root, record, prospectiveStart }) {
  validateSimplificationForwardRecord(record)
  const now = new Date(), timing = simplificationPreopenTiming(now, prospectiveStart)
  if (!timing.eligible) return { written: false, reason: timing.reason }
  if (record.targetDate !== simplificationNewYorkDate(now) || Math.abs(now - Date.parse(record.generatedAt)) > 60000) {
    throw new Error('Only a current, freshly generated pre-open prediction can be appended')
  }
  const directory = path.resolve(root, record.sealDigest, 'targets')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  assert.ok(!fs.lstatSync(directory).isSymbolicLink())
  const destination = path.join(directory, `${record.targetDate}.json`)
  const temporary = path.join(directory, `.${record.targetDate}.${crypto.randomUUID()}.tmp`)
  let fd
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n')
    fs.fsyncSync(fd); fs.closeSync(fd); fd = null
    try { fs.linkSync(temporary, destination) } catch (error) {
      if (error.code === 'EEXIST') return { written: false, reason: 'already-recorded', file: destination }
      throw error
    }
    return { written: true, reason: null, file: destination }
  } finally {
    if (fd !== null && fd !== undefined) fs.closeSync(fd)
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export function simplificationImplementationCompatible(record, repoRoot = process.cwd()) {
  const mismatches = []
  for (const [relative, expected] of Object.entries(record.seal.implementationDigests)) {
    const file = path.resolve(repoRoot, relative)
    if (!file.startsWith(path.resolve(repoRoot) + path.sep) || !fs.existsSync(file) || simplificationDigest(fs.readFileSync(file)) !== expected) mismatches.push(relative)
  }
  return { compatible: mismatches.length === 0, mismatches }
}

export function validateSimplificationSettlement(settlement, record, targetDigest, contractDigest) {
  assert.equal(settlement.schemaVersion, 1)
  assert.equal(settlement.executionEligible, false)
  assert.equal(settlement.targetDate, record.targetDate)
  assert.equal(settlement.previousDate, previousReviewedMarketSession(record.targetDate))
  assert.equal(settlement.sealDigest, record.sealDigest)
  assert.equal(settlement.targetDigest, targetDigest)
  assert.equal(settlement.executionContractDigest, contractDigest)
  assert.equal(record.seal.implementationDigests['config/qore-research-execution.json'], contractDigest)
  for (const symbol of ['UNG', 'VOO', 'QQQM']) {
    const source = settlement.sources[symbol]
    assert.equal(source.payloadDigest, simplificationDigest(source.rawPayload), 'Settlement payload digest mismatch')
    const data = JSON.parse(source.rawPayload).chart.result[0], q = data.indicators.quote[0], adj = data.indicators.adjclose[0].adjclose
    const rows = data.timestamp.map((t, i) => adjustedBarFromYahooRow({ date: new Date(t * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], adjustedClose: adj[i] }, symbol))
    assert.deepEqual(settlement.bars[symbol].previous, rows.find(r => r.date === settlement.previousDate), 'Settlement previous bar differs from retained source')
    assert.deepEqual(settlement.bars[symbol].current, rows.find(r => r.date === settlement.targetDate), 'Settlement current bar differs from retained source')
  }
}
