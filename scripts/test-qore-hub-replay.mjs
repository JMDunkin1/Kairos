import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadHistoricalReplay, parseReplayCSV } from './lib/qore-hub-replay.mjs'
import { startHub } from './qore-hub-service.mjs'

const source = fileURLToPath(new URL('../assets/released-replay', import.meta.url))
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-replay-'))
let hub
try {
  const replay = loadHistoricalReplay()
  assert.equal(replay.independentMechanisms, 1)
  assert.equal(replay.definitions.filter(d => d.baseline).length, 1)
  const candidate = replay.definitions.find(d => !d.baseline), baseline = replay.definitions.find(d => d.baseline)
  for (const definition of replay.definitions) {
    assert.equal(definition.points.length, 690)
    assert.equal(definition.points[0].date, '2024-01-02')
    assert.equal(definition.points.at(-1).date, '2026-10-01')
    assert.ok(Math.abs(definition.metrics.returnPct - definition.points.at(-1).returnPct) < 1e-8)
    assert.ok(Math.abs(definition.metrics.fees - definition.points.reduce((sum, p) => sum + p.fees, 0)) < 1e-6)
    assert.ok(definition.points.every(p => p.signalDate < p.date))
    assert.deepEqual(Object.values(definition.points.at(-1).holdings), [0, 0, 0, 0, 0, 0])
  }
  assert.ok(candidate.metrics.returnPct < baseline.metrics.returnPct)
  assert.ok(candidate.metrics.drawdownPct > baseline.metrics.drawdownPct)
  assert.deepEqual(parseReplayCSV('id,description\na,"text, with ""quotes"""\n'), [{ id: 'a', description: 'text, with "quotes"' }])
  assert.throws(() => parseReplayCSV('id,a\nx,"unterminated'), /incomplete CSV/)
  const copy = path.join(temporary, 'export')
  fs.cpSync(source, copy, { recursive: true })
  fs.appendFileSync(path.join(copy, 'daily_nav_replay.csv'), '\n')
  assert.throws(() => loadHistoricalReplay(copy), /manifest binding daily_nav_replay/)
  fs.cpSync(source, copy, { recursive: true })
  fs.appendFileSync(path.join(copy, 'RELEASED_REPLAY_APPROVAL.json'), ' ')
  assert.throws(() => loadHistoricalReplay(copy), /approval changed/)
  fs.cpSync(source, copy, { recursive: true })
  fs.rmSync(path.join(copy, 'contract.json'))
  fs.symlinkSync(path.join(source, 'contract.json'), path.join(copy, 'contract.json'))
  assert.throws(() => loadHistoricalReplay(copy), /non-regular export/)
  if (!process.argv.includes('--offline')) {
  hub = await startHub({ stateRoot: path.join(temporary, 'state'), ledgerRoot: path.join(temporary, 'no-canonical-ledger') })
  const response = await fetch(hub.origin + '/api/hub/replay')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), replay)
  const denied = await fetch(hub.origin + '/api/hub/replay', { method: 'POST', headers: { Origin: hub.origin, 'X-Qore-Local': '1', 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(denied.status, 404, 'historical replay provides no execution endpoint')
  assert.deepEqual(hub.store.list(), [], 'viewing replay does not record or simulate new trials')
  }
  console.log(process.argv.includes('--offline') ? 'PASS: approved closure, 690-session candidate/baseline arithmetic and chronology, CSV parsing and tamper refusal. NOT RUN: read-only API and API trial-mutation checks (offline mode).' : 'PASS: approved closure, 690-session candidate/baseline arithmetic and chronology, tamper refusal, read-only API, and no trial mutation')
} finally { if (hub) await new Promise(resolve => hub.server.close(resolve)); fs.rmSync(temporary, { recursive: true, force: true }) }
