import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const LIVE_SUPPLY_INDEX_URL = 'https://www.eia.gov/outlooks/steo/outlook.php'
export const LIVE_SUPPLY_CACHE_MS = 60 * 60 * 1000
export const LIVE_SUPPLY_MAX_RELEASE_AGE_DAYS = 45
export const liveSupplySha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const DAY = 86400000
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').trim()
export function liveSupplyDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function liveSupplySnapshotPath(repoRoot = process.cwd()) {
  return path.resolve(process.env.QORE_LIVE_SUPPLY_CONTEXT_FILE || path.join(repoRoot, '.local/qore/live-weather/eia-supply-context.json'))
}
export function assertSupplyUrl(value) {
  const url = new URL(value)
  assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'www.eia.gov')
  assert.ok(url.pathname.startsWith('/outlooks/steo/'), `Unsupported EIA supply source path ${url.pathname}`); assert.equal(url.username, ''); assert.equal(url.password, '')
  return url.href
}
export function parseSupplyArchiveIndex(html, throughDate) {
  assert.match(throughDate, datePattern)
  const rows = []
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1])
    if (cells.length < 4) continue
    const link = cells[3].match(/href=["']([^"']+_base\.xlsx)["']/i)
    if (!link) continue
    const date = plain(cells[1]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    assert.ok(date, 'STEO archive release date is malformed')
    const releaseDate = `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`
    assert.equal(new Date(releaseDate).toISOString().slice(0, 10), releaseDate)
    if (releaseDate > throughDate) continue
    const sourceUrl = assertSupplyUrl(new URL(link[1], LIVE_SUPPLY_INDEX_URL).href)
    const noticeUrls = [...cells.slice(4).join('').matchAll(/href=["']([^"']+)["']/gi)].map(m => new URL(m[1], LIVE_SUPPLY_INDEX_URL).href)
    rows.push({ originalReleaseDate: releaseDate, sourceUrl, noticeUrls })
  }
  rows.sort((a, b) => b.originalReleaseDate.localeCompare(a.originalReleaseDate))
  assert.ok(rows.length, 'STEO archive has no eligible published workbook')
  assert.equal(new Set(rows.map(r => r.originalReleaseDate)).size, rows.length, 'Duplicate archive release dates')
  return rows
}
export function supplyNoticeDates(html) {
  const dates = []
  for (const match of plain(html).matchAll(/(?:Released|Updated|Revised|Corrected):?\s*([A-Za-z]+\s+\d{1,2},\s*20\d{2})/g)) {
    const parsed = Date.parse(match[1] + ' 12:00:00 UTC')
    if (Number.isFinite(parsed)) dates.push(new Date(parsed).toISOString().slice(0, 10))
  }
  assert.ok(dates.length, 'Correction notice has no unambiguous availability date')
  return [...new Set(dates)].sort()
}
export function parseSupplyWorkbook(repoRoot, payloadFile, releaseDate) {
  const result = spawnSync('python3', [path.join(repoRoot, 'scripts/lib/qore-eia-supply-xlsx.py'), payloadFile, releaseDate], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `STEO workbook parsing failed: ${(result.stderr || '').slice(-500)}`)
  return JSON.parse(result.stdout)
}
export function validateObservedSupplyRow(row) {
  assert.match(row.originalReleaseDate, datePattern); assert.match(row.releasedAt, datePattern)
  assert.ok(row.releasedAt >= row.originalReleaseDate)
  assert.match(row.month, /^\d{4}-\d{2}$/); assert.ok(row.month < row.originalReleaseDate.slice(0, 7))
  assert.equal(row.units, 'Bcf/d'); assertSupplyUrl(row.sourceUrl)
  for (const field of ['productionBcfd', 'lngBcfd', 'priorYearProductionBcfd', 'priorYearLngBcfd']) assert.ok(Number.isFinite(row[field]) && row[field] > 0, `Invalid supply ${field}`)
  for (const [field, expected] of [['productionYoYChangeBcfd', row.productionBcfd - row.priorYearProductionBcfd], ['lngYoYChangeBcfd', row.lngBcfd - row.priorYearLngBcfd], ['supplyGrowthLessLngGrowthBcfd', (row.productionBcfd - row.priorYearProductionBcfd) - (row.lngBcfd - row.priorYearLngBcfd)]]) {
    assert.ok(Number.isFinite(row[field]) && Math.abs(row[field] - expected) < 1e-9, `Incoherent supply ${field}`)
  }
  assert.match(row.sha256, /^[a-f0-9]{64}$/)
  return row
}
export function validatedObservedSupplyRows(snapshot, { targetDate, now = new Date(), maximumCacheAgeMs = LIVE_SUPPLY_CACHE_MS } = {}) {
  assert.equal(snapshot.schemaVersion, 1); assert.equal(snapshot.serviceId, 'qore-live-supply-context'); assert.equal(snapshot.validated, true)
  assert.match(targetDate, datePattern)
  assert.equal(snapshot.targetDate, targetDate, 'Supply snapshot targets a different inference date')
  const age = now.getTime() - Date.parse(snapshot.generatedAt)
  assert.ok(Number.isFinite(age) && age >= 0 && age < maximumCacheAgeMs, 'Supply snapshot fetch is stale or future dated')
  assert.ok(Array.isArray(snapshot.observations) && snapshot.observations.length > 0)
  const rows = snapshot.observations.map(validateObservedSupplyRow).filter(r => r.releasedAt < targetDate)
    .sort((a,b) => a.originalReleaseDate.localeCompare(b.originalReleaseDate))
  assert.ok(rows.length, 'No next-day-admissible STEO supply vintage')
  const latest = rows.at(-1)
  assert.ok((Date.parse(targetDate) - Date.parse(latest.originalReleaseDate)) / DAY <= LIVE_SUPPLY_MAX_RELEASE_AGE_DAYS, 'Latest original STEO release is older than 45 days')
  assert.equal(snapshot.expectedLatestEligibleReleaseDate, latest.originalReleaseDate, 'Newest known eligible STEO vintage is missing')
  assert.deepEqual(snapshot.latest, latest, 'Selected supply context does not match retained observations')
  return rows
}
function readBoundPayload(directory, reference) {
  assert.match(reference.sha256, /^[a-f0-9]{64}$/)
  assert.equal(reference.payloadFile, `supply-context-payloads/${reference.sha256}`, 'Unexpected supply payload location')
  const file = path.resolve(directory, reference.payloadFile)
  assert.ok(file.startsWith(path.resolve(directory) + path.sep), 'Supply payload must remain beneath snapshot directory')
  const data = fs.readFileSync(file)
  assert.equal(liveSupplySha256(data), reference.sha256, 'Supply retained payload digest mismatch')
  return { file, data }
}
export function validateSupplySnapshotSources(repoRoot, snapshot, directory, targetDate) {
  const index = readBoundPayload(directory, snapshot.archiveIndex)
  assert.equal(snapshot.archiveIndex.url, LIVE_SUPPLY_INDEX_URL)
  assert.match(snapshot.indexThroughDate, datePattern)
  assert.equal(snapshot.indexThroughDate, liveSupplyDate(new Date(snapshot.generatedAt)), 'Supply archive cutoff must match the actual New York collection date')
  assert.ok(snapshot.indexThroughDate <= targetDate, 'Supply index vintage cannot be future dated')
  const entries = parseSupplyArchiveIndex(index.data.toString(), snapshot.indexThroughDate)
  const considered = entries.slice(0, 2)
  assert.deepEqual(snapshot.observations.map(r => r.originalReleaseDate).sort(), considered.map(r => r.originalReleaseDate).sort(), 'Newest archive workbook must be parsed before publication')
  const admissible = []
  for (const row of snapshot.observations) {
    const entry = considered.find(r => r.originalReleaseDate === row.originalReleaseDate)
    assert.equal(row.sourceUrl, entry.sourceUrl)
    assert.deepEqual(row.notices.map(n => n.url), entry.noticeUrls)
    const workbook = readBoundPayload(directory, { sha256: row.sha256, payloadFile: row.payloadFile })
    const derived = parseSupplyWorkbook(repoRoot, workbook.file, row.originalReleaseDate)
    for (const [key, value] of Object.entries(derived)) assert.deepEqual(row[key], value, `Supply ${key} does not match retained workbook`)
    let available = row.originalReleaseDate
    for (const notice of row.notices) {
      assertSupplyUrl(notice.url)
      const payload = readBoundPayload(directory, notice)
      const dates = supplyNoticeDates(payload.data.toString())
      assert.deepEqual(notice.dates, dates)
      available = [available, ...dates].sort().at(-1)
    }
    assert.equal(row.releasedAt, available)
    if (available < targetDate) admissible.push(row)
  }
  const newest = admissible.sort((a,b) => b.originalReleaseDate.localeCompare(a.originalReleaseDate))[0]
  assert.ok(newest, 'No next-day-admissible supply workbook')
  assert.equal(snapshot.expectedLatestEligibleReleaseDate, newest.originalReleaseDate)
}
export function loadLiveSupplyContext(repoRoot = process.cwd(), { targetDate = liveSupplyDate(), now = new Date(), snapshotPath = liveSupplySnapshotPath(repoRoot) } = {}) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const rows = validatedObservedSupplyRows(snapshot, { targetDate, now })
  validateSupplySnapshotSources(repoRoot, snapshot, path.dirname(snapshotPath), targetDate)
  return rows.at(-1)
}
