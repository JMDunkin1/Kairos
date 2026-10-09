import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readExperimentLedger } from './lib/qore-hub-ledger.mjs'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-event-reader-'))
const filename = path.join(temporary, 'experiments.jsonl')
const event = { experiment_id: 'QORE-TEST-EVENT-01', status: 'VERIFIED_RESEARCH', recorded_utc: '2026-10-08T22:00:00Z', allow_trading: false, study_id: 'QORE-GROUP-NOT-PARENT', verified_local_bindings: [{ path: '/Users/example/secret-location/evidence.json', sha256: 'a'.repeat(64) }] }
const write = rows => fs.writeFileSync(filename, rows.map(row => JSON.stringify(row)).join('\n') + '\n')
let checks = 0
const check = (name, action) => { action(); checks++; console.log(`PASS ${name}`) }
try {
  check('supported research event has null revision and distinct grouping label', () => {
    write([event]); const imported = readExperimentLedger(temporary)
    assert.equal(imported.historyCount, 1); assert.equal(imported.experiments.length, 1)
    const row = imported.experiments[0]
    assert.equal(row.revision, null); assert.equal(row.recordFormat, 'append-only'); assert.equal(row.studyGroup, event.study_id)
    assert.deepEqual(row.inheritedFrom, []); assert.equal(row.title, event.experiment_id)
    assert.deepEqual(row.sources, [{ name: 'evidence.json', sha256: 'a'.repeat(64) }]); assert.ok(!JSON.stringify(row).includes('/Users/'))
  })
  check('version1 unrevisioned event and exact duplicate retain all history rows', () => {
    write([{ ...event, schema_version: 1 }, { ...event, schema_version: 1 }]); const imported = readExperimentLedger(temporary)
    assert.equal(imported.historyCount, 2); assert.equal(imported.experiments.length, 1); assert.equal(imported.experiments[0].revision, null)
  })
  check('explicit parent wins over study group and fallback existing study parent', () => {
    const parent = { ...event, experiment_id: 'QORE-PARENT', full_frozen_protocol: { fixed: 'original' } }
    write([parent, { ...event, parent_id: 'QORE-PARENT' }, { ...event, experiment_id: 'QORE-FALLBACK', study_id: 'QORE-PARENT' }])
    const imported = readExperimentLedger(temporary)
    for (const id of [event.experiment_id, 'QORE-FALLBACK']) { const row = imported.experiments.find(e => e.id === id); assert.deepEqual(row.inheritedFrom, ['QORE-PARENT']); assert.match(row.protocol, /original/) }
  })
  check('frozen pre-computation study registration needs no result bindings', () => {
    const registration = { schema_version: 1, experiment_id: 'QORE-FRESH-REGISTERED', record_kind: 'study', status: 'REGISTERED_PRECOMPUTE', recorded_utc: event.recorded_utc, allow_trading: false, full_frozen_protocol: { split: 'frozen before outcomes' } }
    for (const row of [registration, { ...registration, verified_local_bindings: [] }]) {
      write([row]); const record = readExperimentLedger(temporary).experiments[0]
      assert.equal(record.status, registration.status); assert.deepEqual(record.sources, []); assert.match(record.protocol, /frozen before outcomes/)
      assert.match(record.metrics, /"released_final": null/)
    }
    for (const change of [{ record_kind: 'configuration' }, { status: 'VERIFIED_RESEARCH' }, { full_frozen_protocol: {} }, { full_frozen_protocol: [] }, { allow_trading: true }, { exact_reported_metrics: { return: 10 } }, { released_retrospective_metrics: { return: 10 } }, { metrics: { return: 10 } }]) {
      write([{ ...registration, ...change }]); assert.throws(() => readExperimentLedger(temporary), /Invalid experiment contract/)
    }
  })
  check('released retrospective outcomes remain visible without promoting them', () => {
    const result = { ...event, status: 'FAILED_RETROSPECTIVE_RESEARCH', released_retrospective_metrics: { returnPct: -12, drawdownPct: -25, fees: 100 } }
    write([result]); const record = readExperimentLedger(temporary).experiments[0]
    const metrics = JSON.parse(record.metrics)
    assert.deepEqual(metrics.released_retrospective, result.released_retrospective_metrics)
    assert.equal(metrics.released_final, null); assert.equal(record.status, result.status)
  })
  check('explicit parent_experiment_id precedes missing optional study group', () => {
    write([{ ...event, experiment_id: 'QORE-PARENT' }, { ...event, parent_experiment_id: 'QORE-PARENT' }]); assert.equal(readExperimentLedger(temporary).experiments.find(e => e.id === event.experiment_id).parentId, 'QORE-PARENT')
  })
  check('missing explicit parent and explicit cycle stay fail closed', () => {
    write([{ ...event, parent_id: 'missing' }]); assert.throws(() => readExperimentLedger(temporary), /Missing experiment parent/)
    write([{ ...event, parent_id: event.experiment_id }]); assert.throws(() => readExperimentLedger(temporary), /Cyclic experiment/)
  })
  check('conflicting append-only identities and mixed formats stay fail closed', () => {
    write([event, { ...event, status: 'CHANGED' }]); assert.throws(() => readExperimentLedger(temporary), /Conflicting duplicate append-only/)
    write([event, { ...event, schema_version: 1, revision: 1 }]); assert.throws(() => readExperimentLedger(temporary), /Conflicting experiment record formats/)
  })
  check('only precise allowed append-only envelope accepted; malformed revision never converted', () => {
    for (const changed of [{ revision: null }, { revision: 0 }, { revision: '1' }, { schema_version: 2 }, { allow_trading: true }, { status: '' }, { recorded_utc: '2026-10-08T22:00:00' }, { recorded_utc: '2026-02-30T22:00:00Z' }, { verified_local_bindings: [] }, { experiment_id: 'generic' }]) {
      write([{ ...event, ...changed }]); assert.throws(() => readExperimentLedger(temporary), /Invalid experiment contract/)
    }
  })
  check('legacy revisions remain latest-selected and conflicts rejected', () => {
    const legacy = { schema_version: 1, experiment_id: 'study', revision: 1, record_kind: 'study', title: 'Original', status: 'failed' }
    write([legacy, { ...legacy, revision: 2, title: 'Revised' }]); const imported = readExperimentLedger(temporary)
    assert.equal(imported.historyCount, 2); assert.equal(imported.experiments[0].revision, 2)
    write([legacy, { ...legacy, title: 'Conflict' }]); assert.throws(() => readExperimentLedger(temporary), /Conflicting duplicate revision/)
  })
  check('legacy group exception requires exact original row hash and parent', () => {
    write([{ ...event, experiment_id: 'QORE-20261004-DISCOVERY-01-AUDITED-PREPARATION-01', parent_id: 'QORE-strategy-program' }])
    assert.throws(() => readExperimentLedger(temporary), /Missing experiment parent/, 'same identity/group with different bytes cannot use qualification')
    write([{ ...event, experiment_id: 'QORE-20261004-PUBLIC-SPOT-01-REGISTERED', parent_id: 'different-missing-parent' }])
    assert.throws(() => readExperimentLedger(temporary), /Missing experiment parent/)
  })
  check('partial final append retained and malformed complete JSON rejected', () => {
    write([event]); fs.appendFileSync(filename, '{"incomplete":'); const imported = readExperimentLedger(temporary); assert.equal(imported.pendingAppend, true); assert.equal(imported.historyCount, 1)
    fs.appendFileSync(filename, '\n'); assert.throws(() => readExperimentLedger(temporary), /Malformed experiment history/)
  })
  console.log(JSON.stringify({ status: 'PASS', checks, canonicalWrites: 0 }))
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
