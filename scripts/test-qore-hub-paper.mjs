import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPaperBundle, paperCatalogue, paperIds, savedPaperReplay, paperEvidence, paperReadResponse } from './lib/qore-hub-paper.mjs'
import { startHub } from './qore-hub-service.mjs'
const root = fileURLToPath(new URL('../assets/offline-paper', import.meta.url))
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-offline-paper-'))
let hub
let checks = 0
const check = (name, action) => { action(); checks++; console.log(`PASS ${name}`) }
try {
  const bundle = loadPaperBundle(), catalog = paperCatalogue(bundle)
  check('exact three paper identities, retained roles and null forward ownership', () => {
    assert.deepEqual(catalog.candidates.map(c => c.id), paperIds)
    assert.equal(catalog.identities, 5); assert.equal(catalog.retainedResearchCandidates, 1); assert.equal(catalog.retainedBaselines, 1)
    assert.equal(catalog.newValidatedStrategies, 0); assert.equal(catalog.liveReadyPortfolios, 0)
    assert.equal(catalog.actualOwnedState, null); assert.equal(catalog.actualFutureObservations, 0)
    assert.ok(catalog.candidates.every(c => c.futureLaunchEnabled === false && c.historical_status.includes('FAILED') && c.actual_paper_account === false && c.runtime_enabled === false))
  })
  check('registered dates and no-date-change rationale retained', () => {
    assert.equal(catalog.candidates[0].prospective.first, '2026-11-02T21:00:00Z')
    assert.equal(catalog.candidates[1].prospective.sessions, 252)
    assert.equal(catalog.candidates[2].prospective.first, '2026-12-03T00:00:00Z')
    assert.ok(catalog.startRationale.decision_rationale.includes('planning buffer'))
  })
  for (const id of paperIds.slice(0, 2)) check(`${id}: full funded familiar chronology, primary scope and terminal units`, () => {
    const replay = savedPaperReplay(id, undefined, bundle)
    assert.equal(replay.frames.length, 690); assert.equal(replay.frames[0].date, '2024-01-02'); assert.equal(replay.frames.at(-1).date, '2026-10-01')
    assert.equal(replay.mode, 'familiar_replay'); assert.equal(replay.financialEngineRerun, false); assert.equal(replay.actualOwnedState, null)
    assert.equal(replay.selectedCase, 'primary-5bp')
    assert.ok(replay.frames.every(f => f.mode === 'familiar_replay' && f.actualAccount === false && f.decisionKnownAt.startsWith(f.date)))
    assert.ok(Object.values(replay.frames.at(-1).units).every(v => v === 0)); assert.equal(replay.frames.at(-1).cash, replay.frames.at(-1).wealth)
  })
  const btc = savedPaperReplay(paperIds[2], undefined, bundle)
  check('all fourteen actual funded BTC paths project exact saved terminal NAV', () => {
    const summary = bundle.json('btc/summary.json')
    assert.equal(btc.cases.length, 14)
    for (const entry of btc.cases) {
      const replay = savedPaperReplay(paperIds[2], entry.id, bundle), [scenario, account] = entry.id.split(':')
      assert.equal(replay.frames.length, 1096); assert.equal(replay.frames[0].date, '2019-01-01'); assert.equal(replay.frames.at(-1).date, '2021-12-31')
      assert.ok(Math.abs(replay.frames.at(-1).wealth - summary.scenarios[scenario].metrics[account].final_nav_usdt) < 1e-8)
      assert.equal(Number(replay.frames.at(-1).exactBalances.nav), replay.frames.at(-1).wealth)
      assert.equal(replay.frames.at(-1).terminal, false, 'BTC ending inventory is not fabricated liquidation')
    }
  })
  check('outbound catalogue/replay/evidence contain no local provenance paths', () => {
    for (const value of [catalog, btc, ...catalog.evidence.map(e => paperEvidence(e.id, bundle))]) {
      const text = JSON.stringify(value)
      assert.ok(!text.includes('/Users/')); assert.ok(!text.includes('"source_path"')); assert.ok(!text.includes('"path"'))
    }
  })
  check('fixture evidence never becomes a retained playback case', () => {
    assert.ok(btc.cases.every(c => !c.id.includes('invented')))
    assert.ok(!catalog.candidates.some(c => c.id.includes('fixture')))
    assert.equal(bundle.json('observations/btc_invented_next_decision.json').mode, 'invented_fixture')
  })
  check('unknown strategy/case/document and source paths fail closed', () => {
    assert.throws(() => savedPaperReplay('ngas-all-year-beta', undefined, bundle), /unknown paper/)
    assert.throws(() => savedPaperReplay(paperIds[0], 'stress-20bp', bundle), /only primary/)
    assert.throws(() => savedPaperReplay(paperIds[2], 'invented_fixture', bundle), /unknown retained/)
    assert.throws(() => paperEvidence('../../etc/passwd', bundle), /unknown evidence/)
  })
  check('same production GET dispatcher resolves three replays and audited evidence', () => {
    assert.deepEqual(paperReadResponse(new URL('http://localhost/api/hub/paper-candidates'), bundle).body, catalog)
    for (const id of paperIds) assert.equal(paperReadResponse(new URL(`http://localhost/api/hub/paper-candidates/${id}/replay`), bundle).body.id, id)
    assert.equal(paperReadResponse(new URL('http://localhost/api/hub/paper-evidence/start-rationale.json'), bundle).body.id, 'start-rationale.json')
    assert.equal(paperReadResponse(new URL('http://localhost/api/hub/runs'), bundle), null)
    assert.equal(paperReadResponse(new URL('http://localhost/api/hub/paper-evidence/../private.json'), bundle), null)
    assert.throws(() => paperReadResponse(new URL('http://localhost/api/hub/paper-candidates/BTC_PRIOR_CALENDAR_MONTH_LOSS_TO_CASH_01/replay?case=unknown'), bundle), /unknown retained/)
  })
  const copy = path.join(temporary, 'bundle')
  fs.cpSync(root, copy, { recursive: true })
  check('changed manifest refused', () => { fs.appendFileSync(path.join(copy, 'MANIFEST.json'), ' '); assert.throws(() => loadPaperBundle(copy), /manifest changed/) })
  fs.cpSync(root, copy, { recursive: true })
  check('changed saved financial output refused before playback', () => { fs.appendFileSync(path.join(copy, 'btc/daily.csv'), '\n'); assert.throws(() => loadPaperBundle(copy), /binding changed/) })
  fs.cpSync(root, copy, { recursive: true })
  check('intermediate directory symlink refused', () => { fs.rmSync(path.join(copy, 'btc'), { recursive: true }); fs.symlinkSync(path.join(root, 'btc'), path.join(copy, 'btc')); assert.throws(() => loadPaperBundle(copy), /symlink/) })
  if (!process.argv.includes('--offline')) {
    hub = await startHub({ stateRoot: path.join(temporary, 'state'), ledgerRoot: path.join(temporary, 'no-canonical-log') })
    const response = await fetch(hub.origin + '/api/hub/paper-candidates'); assert.equal(response.status, 200); assert.deepEqual(await response.json(), catalog); checks++
    for (const id of paperIds) { const r = await fetch(hub.origin + `/api/hub/paper-candidates/${id}/replay`); assert.equal(r.status, 200); assert.equal((await r.json()).id, id); checks++ }
    const doc = await fetch(hub.origin + '/api/hub/paper-evidence/start-rationale.json'); assert.equal(doc.status, 200); checks++
    for (const endpoint of ['/api/hub/paper-candidates', `/api/hub/paper-candidates/${paperIds[0]}/replay`, '/api/hub/paper-evidence/start-rationale.json']) {
      const denied = await fetch(hub.origin + endpoint, { method: 'POST', headers: { Origin: hub.origin, 'X-Qore-Local': '1', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(denied.status, 404); checks++
    }
    const missing = await fetch(hub.origin + '/api/hub/paper-evidence/not-admitted.json'); assert.equal(missing.status, 400); checks++
    const foreign = await fetch(hub.origin + '/api/hub/paper-candidates', { headers: { Origin: 'https://example.invalid' } }); assert.equal(foreign.status, 403); checks++
    assert.deepEqual(hub.store.list(), []); checks++
  }
  console.log(JSON.stringify({ status: 'PASS', checks, mode: process.argv.includes('--offline') ? 'offline; HTTP not run' : 'pure and isolated loopback HTTP', economicEnginesRerun: 0, actualFutureObservations: 0 }))
} finally { if (hub) { hub.server.closeAllConnections(); await new Promise(resolve => hub.server.close(resolve)) } fs.rmSync(temporary, { recursive: true, force: true }) }
