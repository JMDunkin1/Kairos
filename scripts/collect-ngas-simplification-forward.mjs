#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Papa from 'papaparse'
import { enrichForecastRows, inferAllYearTarget } from './lib/qore-live-all-year-inference.mjs'
import { assertSummerForecastTemporalInputs } from './lib/qore-summer-forecast-contract.mjs'
import { summarizeSummerForecastLocationBreadth } from './lib/qore-summer-forecast-coverage.mjs'
import { executableLiveComponentActiveForDate } from './lib/qore-live-contract.mjs'
import { loadNoSummerReversionEngine, causalSimplificationMarketDays } from './lib/qore-simplification-replay.mjs'
import { revisionFeature, latestSupplyVintage, demandDecision, DEMAND_OVERLAY_IDS } from './lib/qore-simplification-demand.mjs'
import { simplificationNewYorkDate, simplificationPreopenTiming, appendSimplificationForwardRecord, validateSimplificationForwardRecord } from './lib/qore-simplification-forward.mjs'

// Reads current caches only. Refreshing weather/market data is a separate no-order operation.
// No --date/clock override exists: past predictions cannot be created by this command.
const args = new Map(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)] }))
for (const key of args.keys()) assert.ok(['--check-only', '--runtime-root', '--research-root', '--prior-root'].includes(key), `Unknown argument ${key}`)
const repo = process.cwd(), runtime = path.resolve(args.get('--runtime-root') || '.local/qore')
const research = path.resolve(args.get('--research-root') || '.local/qore/research/ngas-simplification')
const priorRoot = path.resolve(args.get('--prior-root') || path.join(research, 'forward-inputs'))
const prospectiveStart = '2026-09-28', now = new Date(), targetDate = simplificationNewYorkDate(now)
const timing = simplificationPreopenTiming(now, prospectiveStart)
if (!timing.eligible && !args.has('--check-only')) {
  console.log(JSON.stringify({ written: false, targetDate, reason: timing.reason, nextAction: 'Run on a reviewed session before 09:30 America/New_York with fresh runtime caches.' }))
  process.exit(0)
}
const inputDigests = {}
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
function text(file) {
  const data = fs.readFileSync(file), digest = hash(data)
  inputDigests[path.relative(repo, file)] = digest
  const payloadRoot = path.join(research, 'forward/payloads')
  fs.mkdirSync(payloadRoot, { recursive: true, mode: 0o700 })
  const retained = path.join(payloadRoot, digest)
  try { fs.writeFileSync(retained, data, { flag: 'wx', mode: 0o600 }) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    assert.equal(hash(fs.readFileSync(retained)), digest, 'Retained input payload is corrupt')
  }
  return data.toString('utf8')
}
function json(file) { return JSON.parse(text(file)) }
function csv(file) { const result = Papa.parse(text(file), { header: true, skipEmptyLines: true }); assert.equal(result.errors.length, 0); return result.data }
// Calendar availability is data: retain its exact vintage without rotating the implementation seal.
text(path.join(repo, 'data/qore/fundamentals/eia/working-gas-storage-release-calendar.json'))
const snapshot = json(path.join(runtime, 'live-inference/all-year-target.json'))
assert.equal(snapshot.serviceId, 'qore-live-all-year-inference')
assert.equal(snapshot.validated, true)
assert.equal(snapshot.target.targetDate, targetDate)
assert.deepEqual(snapshot.inputProfile.testOnlyOverrideNames, [])
assert.ok(now - Date.parse(snapshot.generatedAt) >= 0 && now - Date.parse(snapshot.generatedAt) < 30 * 60000, 'Fresh live inference cache required (<30 minutes)')
const candidates = {}, details = {}, available = target => ({ status: 'available', executionEligible: false, target: { ...target, executionEligible: false } })
const flatten = t => ({ ...t, gasPosition: 0, indexFraction: 1, cashFraction: 0, direction: 'flat', componentStrategyId: 'index-fallback', thesisKind: 'index-fallback', windowId: 'index-fallback' })
const summer = executableLiveComponentActiveForDate({ season: 'summer', targetDate })
let locations = [], noFade = snapshot.target
if (summer) {
  const forecastRoot = path.join(runtime, 'live-inference/noaa-calendar'), scores = []
  for (const [sourceId, weatherDir] of [['gfs', 'noaa-gfs'], ['gefs-mean', 'noaa-gefs']]) {
    const base = `qore-live-${sourceId}-00z`
    const scoreRows = csv(path.join(forecastRoot, 'research', `${base}-signal-scores.csv`))
    const locationRows = csv(path.join(forecastRoot, 'weather', weatherDir, `${base}-location-anomalies.csv`))
    const manifest = json(path.join(forecastRoot, 'weather', weatherDir, `${base}-manifest.json`))
    assertSummerForecastTemporalInputs({ sourceId, scoreRows, locationRows, manifest })
    for (const row of scoreRows) assert.equal(summarizeSummerForecastLocationBreadth(locationRows.filter(r => r.issueDate === row.issueDate && r.targetDate === row.targetDate && r.modelId === row.modelId && r.leadDays === row.leadDays)).complete, true)
    scores.push(...scoreRows.map(r => ({ ...r, sourceId }))); locations.push(...locationRows.map(r => ({ ...r, sourceId })))
  }
  const floor = new Date(Date.parse(targetDate) - 16 * 86400000).toISOString().slice(0, 10)
  const forecastRows = enrichForecastRows(scores, locations, 'summer').filter(r => r.issueDate >= floor && r.issueDate <= targetDate)
  const manifest = json(path.join(runtime, 'live-market-history/manifest.json'))
  assert.equal(manifest.targetDate, targetDate); assert.equal(manifest.completedSessionCutoffExclusive, targetDate)
  const indexRows = csv(path.join(runtime, 'live-market-history/US-INDEX-BASKET-qore-market.csv')).filter(r => r.date < targetDate)
  const latestDate = indexRows.at(-1)?.date
  assert.equal(latestDate, snapshot.marketValidation.latestCommonDate)
  const market = symbol => {
    const raw = csv(path.join(runtime, 'live-market-history', `${symbol}-qore-market.csv`))
    const map = new Map(raw.map(r => [r.date, r]))
    assert.ok(indexRows.length >= 42)
    for (const row of indexRows) assert.ok(Number(map.get(row.date)?.close) > 0, `Missing ${symbol} ${row.date}`)
    const days = causalSimplificationMarketDays({ rows: indexRows.map(r => ({ date: r.date, gasClose: Number(map.get(r.date).close) })), targetDate })
    return snapshot.marketValidation.provisionalTargetDate ? days : days.filter(row => !row.provisional)
  }
  const storageMap = new Map(csv(path.join(repo, 'data/qore/fundamentals/eia/working-gas-storage-lower48-weekly.csv')).map(r => [r.date, r]))
  const polled = json(path.join(runtime, 'live-weather/eia-storage-release-window.json'))
  for (const row of polled.storageRows) storageMap.set(row.date, row)
  assert.equal(polled.latestStorage.date, snapshot.storageValidation.latestPolledDate)
  assert.equal(Number(polled.latestStorage.storageBcf), Number(snapshot.storageValidation.latestPolledStorageBcf))
  const storageRows = [...storageMap.values()].sort((a,b) => a.date.localeCompare(b.date))
  const input = { forecastRows, storageRows, targetDate }, ngDays = market('NG-F'), ungDays = market('UNG')
  const baseline = inferAllYearTarget({ ...input, marketDays: ngDays })
  assert.deepEqual(baseline, snapshot.target, 'Retained raw inputs must reproduce live target exactly')
  const { engine } = await loadNoSummerReversionEngine(repo)
  noFade = engine.inferAllYearTarget({ ...input, marketDays: ngDays })
  const combined = engine.inferAllYearTarget({ ...input, marketDays: ungDays })
  assert.equal(combined.gasPosition, noFade.gasPosition)
  candidates.current = available(baseline)
  candidates['no-summer-shorts'] = available(noFade)
  candidates['ung-price'] = available(inferAllYearTarget({ ...input, marketDays: ungDays }))
  candidates['no-summer-shorts-ung-price'] = available(combined)
} else {
  // All proposed ablations are Summer-only. Preserve the current Winter selector.
  for (const id of ['current', 'no-summer-shorts', 'ung-price', 'no-summer-shorts-ung-price']) candidates[id] = available(snapshot.target)
}
candidates.fallback = available(flatten(snapshot.target))
for (const variant of DEMAND_OVERLAY_IDS) {
  const id = `no-summer-fade+${variant}`
  if (!summer || noFade.gasPosition === 0) { candidates[id] = available(noFade); continue }
  try {
    let revision = null, supply = null
    if (variant.includes('revision')) {
      const previous = ['gfs', 'gefs-mean'].flatMap(sourceId => csv(path.join(priorRoot, `prior-${sourceId}-location-anomalies.csv`)).map(r => ({ ...r, sourceId })))
      revision = revisionFeature(noFade.signalDate, locations, previous, '6|12|18|24')
    }
    if (variant === 'supply-balance') {
      supply = latestSupplyVintage(json(path.join(research, 'forward-supply-vintages/observations.json')), targetDate)
      assert.ok(supply && Date.parse(targetDate) - Date.parse(supply.releasedAt ?? supply.releaseDate) < 45 * 86400000, 'Fresh released supply vintage unavailable')
    }
    assert.equal(typeof noFade.diagnostics.storage.storageDeficit, 'boolean')
    const passes = demandDecision({ variant, revision, storageDeficit: noFade.diagnostics.storage.storageDeficit, supply })
    details[id] = { revision, supply, storageDeficit: noFade.diagnostics.storage.storageDeficit, passes }
    candidates[id] = available(passes ? noFade : flatten(noFade))
  } catch (error) {
    candidates[id] = { status: 'unavailable', executionEligible: false, target: null, reason: String(error.message).slice(0, 300) }
  }
}
// Source changes create a new local series. Dependencies are recursively bound.
const implementationDigests = {}, visit = file => {
  const resolved = path.resolve(repo, file)
  if (implementationDigests[path.relative(repo, resolved)]) return
  const body = fs.readFileSync(resolved, 'utf8'); implementationDigests[path.relative(repo, resolved)] = hash(body)
  for (const match of body.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) visit(path.resolve(path.dirname(resolved), match[1]))
}
for (const file of ['scripts/collect-ngas-simplification-forward.mjs', 'scripts/run-ngas-simplification-preopen.mjs', 'scripts/settle-ngas-simplification-forward.mjs', 'scripts/qore-live-strategy-inference.mjs', 'scripts/qore-live-market-history.mjs', 'scripts/build-gfs-forecast-calendar.mjs', 'scripts/collect-ngas-supply-vintages.py']) visit(file)
for (const file of ['config/qore-research-execution.json', 'config/qore-live-broker-settings.json', 'data/qore/market/index-basket-config.json']) implementationDigests[file] = hash(fs.readFileSync(path.join(repo, file)))
const protocol = json(path.join(research, 'demand-protocol.json'))
const seal = { prospectiveStart, candidateIds: Object.keys(candidates), implementationDigests, protocol, evidenceClass: 'local-preopen-research-no-external-chronology-anchor' }
const record = { schemaVersion: 1, generatedAt: new Date().toISOString(), targetDate, executionEligible: false, evidenceClass: seal.evidenceClass, sealDigest: hash(JSON.stringify(seal)), seal, inputDigests, inputPayloadDirectory: path.relative(repo, path.join(research, 'forward/payloads')), candidates, details }
if (args.has('--check-only')) console.log(JSON.stringify({ written: false, reason: 'check-only', targetDate, candidates: Object.fromEntries(Object.entries(candidates).map(([id, r]) => [id, { status: r.status, gasPosition: r.target?.gasPosition ?? null, reason: r.reason ?? null }])) }, null, 2))
else { validateSimplificationForwardRecord(record); console.log(JSON.stringify(appendSimplificationForwardRecord({ root: path.join(research, 'forward'), record, prospectiveStart }))) }
