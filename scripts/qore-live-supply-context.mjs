#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { LIVE_SUPPLY_INDEX_URL, liveSupplyDate, liveSupplySha256, liveSupplySnapshotPath, assertSupplyUrl, parseSupplyArchiveIndex, supplyNoticeDates, parseSupplyWorkbook, validatedObservedSupplyRows, validateSupplySnapshotSources, loadLiveSupplyContext } from './lib/qore-live-supply-context.mjs'

function publish(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
export async function collectLiveSupplyContext({ repoRoot = process.cwd(), now = new Date(), snapshotPath = liveSupplySnapshotPath(repoRoot), targetDate = process.env.QORE_LIVE_SUPPLY_TARGET_DATE || liveSupplyDate(now), fixturePayloads = null } = {}) {
  if (fixturePayloads) assert.ok(process.env.NODE_ENV === 'test' && process.env.QORE_TEST_LIVE_INFERENCE_OVERRIDES === '1', 'Supply fixtures require the explicit live-inference test capability')
  const indexThroughDate = liveSupplyDate(now)
  assert.ok([indexThroughDate, now.toISOString().slice(0, 10)].includes(targetDate), 'Supply target must be the current New York or UTC date')
  const directory = path.dirname(snapshotPath), payloadRoot = path.join(directory, 'supply-context-payloads')
  if (!fixturePayloads && fs.existsSync(snapshotPath)) {
    try { const latest = loadLiveSupplyContext(repoRoot, { targetDate, now, snapshotPath }); return { cacheHit: true, latest, file: snapshotPath } } catch { /* An expired or invalid snapshot must refresh completely. */ }
  }
  fs.mkdirSync(payloadRoot, { recursive: true, mode: 0o700 })
  async function acquire(url) {
    assertSupplyUrl(url)
    let data
    if (fixturePayloads) { assert.ok(fixturePayloads.has(url), `Missing fixture ${url}`); data = Buffer.from(fixturePayloads.get(url)) }
    else {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'QORE public EIA supply context' } })
      assert.ok(response.ok, `EIA supply HTTP ${response.status}`); assertSupplyUrl(response.url)
      data = Buffer.from(await response.arrayBuffer())
    }
    assert.ok(data.length > 0 && data.length < 20 * 1024 * 1024, 'Unexpected EIA payload size')
    const sha256 = liveSupplySha256(data), file = path.join(payloadRoot, sha256)
    try { fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error; assert.equal(liveSupplySha256(fs.readFileSync(file)), sha256) }
    return { data, file, sha256, payloadFile: path.relative(directory, file) }
  }
  try {
    const index = await acquire(LIVE_SUPPLY_INDEX_URL), entries = parseSupplyArchiveIndex(index.data.toString(), indexThroughDate).slice(0, 2)
    const observations = []
    for (const entry of entries) {
      const workbook = await acquire(entry.sourceUrl), derived = parseSupplyWorkbook(repoRoot, workbook.file, entry.originalReleaseDate)
      let releasedAt = entry.originalReleaseDate
      const notices = []
      for (const url of entry.noticeUrls) {
        const notice = await acquire(url), dates = supplyNoticeDates(notice.data.toString())
        releasedAt = [releasedAt, ...dates].sort().at(-1)
        notices.push({ url, dates, sha256: notice.sha256, payloadFile: notice.payloadFile })
      }
      observations.push({ ...derived, originalReleaseDate: entry.originalReleaseDate, releasedAt, sourceUrl: entry.sourceUrl, sha256: workbook.sha256, payloadFile: workbook.payloadFile, notices, vintageType: 'STEO released estimates, not finalized observations' })
    }
    const latest = observations.filter(r => r.releasedAt < targetDate).sort((a,b) => a.originalReleaseDate.localeCompare(b.originalReleaseDate)).at(-1)
    assert.ok(latest, 'No next-day-admissible supply release')
    const snapshot = { schemaVersion: 1, serviceId: 'qore-live-supply-context', generatedAt: now.toISOString(), targetDate, validated: true, indexThroughDate, expectedLatestEligibleReleaseDate: latest.originalReleaseDate, archiveIndex: { url: LIVE_SUPPLY_INDEX_URL, sha256: index.sha256, payloadFile: index.payloadFile }, latest, observations }
    validatedObservedSupplyRows(snapshot, { targetDate, now }); validateSupplySnapshotSources(repoRoot, snapshot, directory, targetDate)
    publish(snapshotPath, snapshot)
    return { cacheHit: false, latest, file: snapshotPath }
  } catch (error) {
    // Do not leave an old apparently valid snapshot when a newly known workbook
    // fails. Earlier immutable payloads remain available for diagnosis.
    publish(snapshotPath, { schemaVersion: 1, serviceId: 'qore-live-supply-context', generatedAt: now.toISOString(), targetDate, validated: false, latest: null, observations: [], error: String(error.message).slice(0, 1000) })
    throw error
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  collectLiveSupplyContext().then(result => console.log(JSON.stringify({ serviceId: 'qore-live-supply-context', validated: true, cacheHit: result.cacheHit, originalReleaseDate: result.latest.originalReleaseDate, observationMonth: result.latest.month, supplyGrowthLessLngGrowthBcfd: result.latest.supplyGrowthLessLngGrowthBcfd, file: result.file }))).catch(error => { console.error(`Supply context unavailable: ${error.message}`); process.exitCode = 1 })
}
