#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { collectLiveSupplyContext } from './qore-live-supply-context.mjs'
import { LIVE_SUPPLY_INDEX_URL, loadLiveSupplyContext, validatedObservedSupplyRows, validateSupplySnapshotSources, validateObservedSupplyRow, parseSupplyArchiveIndex, supplyNoticeDates } from './lib/qore-live-supply-context.mjs'

process.env.NODE_ENV = 'test'
process.env.QORE_TEST_LIVE_INFERENCE_OVERRIDES = '1'
const root = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-supply-'))
const originalSnapshotEnv = process.env.QORE_LIVE_SUPPLY_CONTEXT_FILE
const workbookScript = String.raw`
import sys,json,io,zipfile,calendar,html
p=json.loads(sys.stdin.read()); historical=p['historical']; year,month=divmod(historical,100)
def col(n):
 s=''
 while n:n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def sheet(cells):
 rows={}
 for address,value in cells.items():
  number=''.join(c for c in address if c.isdigit())
  cell='<c r="'+address+'"'+(' t="inlineStr"><is><t>'+html.escape(value)+'</t></is>' if isinstance(value,str) else '><v>'+str(value)+'</v>')+'</c>'
  rows.setdefault(number,[]).append(cell)
 return '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join('<row r="'+n+'">'+''.join(v)+'</row>' for n,v in rows.items())+'</sheetData></worksheet>'
c=3+(year-2025)*12+month-1
cells={'C3':2025,col(c)+'4':calendar.month_abbr[month],'A20':'NGPRPUS','A25':'NGEXPUS_LNG',col(c)+'20':p.get('production',112),col(c-12)+'20':108,col(c)+'25':16.6,col(c-12)+'25':14.5}
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dates" sheetId="1" r:id="rId1"/><sheet name="5atab" sheetId="2" r:id="rId2"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml',sheet({'A1':'Last Historical Month','D1':historical}))
 z.writestr('xl/worksheets/sheet2.xml',sheet(cells))
sys.stdout.buffer.write(out.getvalue())
`
function workbook(historical, production = 112) {
  const result = spawnSync('python3', ['-c', workbookScript], { input: JSON.stringify({ historical, production }), maxBuffer: 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString()); return result.stdout
}
const url = file => `https://www.eia.gov/outlooks/steo/archives/${file}`
const entry = (date, file, notice = '') => `<tr><td>month</td><td>${date}</td><td>PDF</td><td><a href="archives/${file}">Excel</a></td><td>${notice ? `<a href="archives/${notice}">Correction</a>` : ''}</td></tr>`
const index = entry('09/09/2026', 'sep26_base.xlsx') + entry('08/11/2026', 'aug26_base.xlsx')
const good = new Map([[LIVE_SUPPLY_INDEX_URL, index], [url('sep26_base.xlsx'), workbook(202608)], [url('aug26_base.xlsx'), workbook(202607)]])
const now = new Date('2026-09-10T12:00:00Z'), snapshotPath = path.join(temp, 'context.json')
try {
 const result = await collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: good })
 assert.equal(result.cacheHit, false); assert.equal(result.latest.originalReleaseDate, '2026-09-09')
 assert.ok(Math.abs(result.latest.supplyGrowthLessLngGrowthBcfd - 1.9) < 1e-10)
 const snapshot = JSON.parse(fs.readFileSync(snapshotPath))
 assert.deepEqual(loadLiveSupplyContext(root, { now, targetDate: '2026-09-10', snapshotPath }), result.latest)
 assert.equal(validatedObservedSupplyRows(snapshot, { now, targetDate: '2026-09-10' }).length, 2)
 process.env.QORE_LIVE_SUPPLY_CONTEXT_FILE = snapshotPath
 assert.deepEqual(loadLiveSupplyContext(root, { now, targetDate: '2026-09-10' }), result.latest)
 const cache = await collectLiveSupplyContext({ repoRoot: root, now, snapshotPath })
 assert.equal(cache.cacheHit, true)
 assert.throws(() => validatedObservedSupplyRows(snapshot, { now: new Date(now.getTime() + 3600000), targetDate: '2026-09-10' }), /stale/)
 assert.throws(() => validatedObservedSupplyRows(snapshot, { now: new Date(now.getTime() - 1000), targetDate: '2026-09-10' }), /future/)
 assert.throws(() => validateObservedSupplyRow({ ...snapshot.latest, supplyGrowthLessLngGrowthBcfd: 99 }), /Incoherent/)
 assert.throws(() => validateObservedSupplyRow({ ...snapshot.latest, productionBcfd: NaN }), /Invalid/)
 const missing = structuredClone(snapshot); missing.observations = [missing.observations[1]]; missing.latest = missing.observations[0]
 assert.throws(() => validatedObservedSupplyRows(missing, { now, targetDate: '2026-09-10' }), /Newest known/)
 assert.throws(() => validateSupplySnapshotSources(root, missing, temp, '2026-09-10'), /Newest archive/)
 const backdatedIndex = structuredClone(snapshot); backdatedIndex.indexThroughDate = '2026-08-12'
 assert.throws(() => validateSupplySnapshotSources(root, backdatedIndex, temp, '2026-09-10'), /actual New York collection date/)
 const tampered = structuredClone(snapshot); tampered.latest.productionBcfd += 1; tampered.observations[0].productionBcfd += 1
 assert.throws(() => validateSupplySnapshotSources(root, tampered, temp, '2026-09-10'), /does not match retained workbook/)
 const payloadFile = path.join(temp, snapshot.latest.payloadFile), payload = fs.readFileSync(payloadFile)
 fs.appendFileSync(payloadFile, 'x'); assert.throws(() => loadLiveSupplyContext(root, { now, targetDate: '2026-09-10', snapshotPath }), /payload digest/); fs.writeFileSync(payloadFile, payload)
 const releasedToday = await collectLiveSupplyContext({ repoRoot: root, now: new Date('2026-09-09T18:00:00Z'), snapshotPath, fixturePayloads: good })
 assert.equal(releasedToday.latest.originalReleaseDate, '2026-08-11', 'Same-day new release must wait until next day')
 const midnightNow = new Date('2026-09-10T00:30:00Z')
 const midnight = await collectLiveSupplyContext({ repoRoot: root, now: midnightNow, targetDate: '2026-09-10', snapshotPath, fixturePayloads: good })
 assert.equal(midnight.latest.originalReleaseDate, '2026-09-09')
 const midnightSnapshot = JSON.parse(fs.readFileSync(snapshotPath))
 assert.equal(midnightSnapshot.targetDate, '2026-09-10')
 assert.equal(midnightSnapshot.indexThroughDate, '2026-09-09', 'Archive cutoff stays on the actual New York date across UTC midnight')
 assert.deepEqual(loadLiveSupplyContext(root, { now: midnightNow, targetDate: '2026-09-10', snapshotPath }), midnight.latest)
 assert.throws(() => loadLiveSupplyContext(root, { now: midnightNow, targetDate: '2026-09-09', snapshotPath }), /different inference date/)
 await assert.rejects(collectLiveSupplyContext({ repoRoot: root, now: midnightNow, targetDate: '2026-09-11', snapshotPath, fixturePayloads: good }), /current New York or UTC date/)
 const corrected = new Map(good); corrected.set(LIVE_SUPPLY_INDEX_URL, entry('09/09/2026', 'sep26_base.xlsx', 'sep26_notice.html') + entry('08/11/2026', 'aug26_base.xlsx'))
 corrected.set(url('sep26_notice.html'), '<p>Corrected: September 10, 2026</p>')
 assert.equal((await collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: corrected })).latest.originalReleaseDate, '2026-08-11')
 const next = await collectLiveSupplyContext({ repoRoot: root, now: new Date('2026-09-11T12:00:00Z'), snapshotPath, fixturePayloads: corrected })
 assert.equal(next.latest.releasedAt, '2026-09-10')
 const old = structuredClone(snapshot); old.generatedAt = '2026-11-01T12:00:00Z'; old.targetDate = '2026-11-01'
 assert.throws(() => validatedObservedSupplyRows(old, { now: new Date(old.generatedAt), targetDate: '2026-11-01' }), /45 days/)
 assert.throws(() => supplyNoticeDates('<p>corrected without a date</p>'), /availability/)
 assert.throws(() => parseSupplyArchiveIndex(index + entry('09/09/2026', 'sep26_base.xlsx'), '2026-09-10'), /Duplicate/)
 await collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: good })
 const badNewest = new Map(good); badNewest.set(url('sep26_base.xlsx'), Buffer.from('broken newest workbook'))
 await assert.rejects(collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: badNewest }), /parsing failed/)
 assert.equal(JSON.parse(fs.readFileSync(snapshotPath)).validated, false, 'Bad newer-known workbook must invalidate old snapshot')
 assert.throws(() => loadLiveSupplyContext(root, { now, targetDate: '2026-09-10', snapshotPath }))
 const futureMonth = new Map(good); futureMonth.set(url('sep26_base.xlsx'), workbook(202609))
 await assert.rejects(collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: futureMonth }), /parsing failed/)
 process.env.QORE_TEST_LIVE_INFERENCE_OVERRIDES = '0'
 await assert.rejects(collectLiveSupplyContext({ repoRoot: root, now, snapshotPath, fixturePayloads: good }), /test capability/)
 console.log('Live supply: stdlib XLSX math, next-day/correction eligibility, newest-publication binding, 45-day/1-hour freshness, retained-source integrity, cache reuse, and failure invalidation pass.')
} finally {
 if (originalSnapshotEnv === undefined) delete process.env.QORE_LIVE_SUPPLY_CONTEXT_FILE; else process.env.QORE_LIVE_SUPPLY_CONTEXT_FILE = originalSnapshotEnv
 fs.rmSync(temp, { recursive: true, force: true })
}
