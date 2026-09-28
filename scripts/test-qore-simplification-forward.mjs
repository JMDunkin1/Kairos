#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { adjustedBarFromYahooRow } from './lib/qore-research-execution.mjs'
import { simplificationPreopenTiming, validateSimplificationForwardRecord, SIMPLIFICATION_CANDIDATE_IDS, simplificationDigest, simplificationImplementationCompatible, validateSimplificationSettlement } from './lib/qore-simplification-forward.mjs'
const start = '2026-09-28'
assert.equal(simplificationPreopenTiming(new Date('2026-09-28T13:29:59Z'), start).eligible, true)
assert.equal(simplificationPreopenTiming(new Date('2026-09-28T13:30:00Z'), start).eligible, false)
assert.equal(simplificationPreopenTiming(new Date('2026-10-03T12:00:00Z'), start).eligible, false)
assert.equal(simplificationPreopenTiming(new Date('2026-12-25T12:00:00Z'), start).eligible, false)
const contractDigest = simplificationDigest('{}')
const seal = { prospectiveStart: start, candidateIds: SIMPLIFICATION_CANDIDATE_IDS, implementationDigests: { 'config/qore-research-execution.json': contractDigest }, protocol: { rule: 'fixed' } }
const record = { schemaVersion: 1, executionEligible: false, evidenceClass: 'local-preopen-research-no-external-chronology-anchor', seal, sealDigest: simplificationDigest(seal), targetDate: start, generatedAt: '2026-09-28T13:00:00Z', candidates: Object.fromEntries(SIMPLIFICATION_CANDIDATE_IDS.map(id => [id, { executionEligible: false, status: 'unavailable', target: null, reason: 'Missing fixture atom' }])) }
validateSimplificationForwardRecord(record)
assert.throws(() => validateSimplificationForwardRecord({ ...record, seal: undefined }))
assert.throws(() => validateSimplificationForwardRecord({ ...record, seal: { ...seal, protocol: { rule: 'changed' } } }), /Seal content/)
assert.throws(() => validateSimplificationForwardRecord({ ...record, candidates: {} }))
assert.throws(() => validateSimplificationForwardRecord({ ...record, generatedAt: '2026-09-28T13:30:00Z' }), /before session open/)
assert.throws(() => validateSimplificationForwardRecord({ ...record, candidates: { ...record.candidates, current: { ...record.candidates.current, target: { gasPosition: 0 } } } }))
assert.throws(() => validateSimplificationForwardRecord({ ...record, executionEligible: true }))
assert.throws(() => validateSimplificationForwardRecord({ ...record, targetDate: '2026-09-29' }))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-forward-test-'))
try {
 fs.mkdirSync(path.join(temp, 'config')); fs.writeFileSync(path.join(temp, 'config/qore-research-execution.json'), '{}')
 assert.equal(simplificationImplementationCompatible(record, temp).compatible, true)
 fs.writeFileSync(path.join(temp, 'config/qore-research-execution.json'), '{"changed":true}')
 assert.equal(simplificationImplementationCompatible(record, temp).compatible, false)
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
const dates = ['2026-09-25', '2026-09-28'], rawPayload = JSON.stringify({ chart: { result: [{ timestamp: dates.map(d => Date.parse(d + 'T13:30:00Z') / 1000), indicators: { quote: [{ open: [10, 11], high: [11, 12], low: [9, 10], close: [10.5, 11.5] }], adjclose: [{ adjclose: [10.5, 11.5] }] } }] } })
const sources = Object.fromEntries(['UNG', 'VOO', 'QQQM'].map(s => [s, { rawPayload, payloadDigest: simplificationDigest(rawPayload) }]))
const previous = adjustedBarFromYahooRow({ date: dates[0], open: 10, high: 11, low: 9, close: 10.5, adjustedClose: 10.5 })
const current = adjustedBarFromYahooRow({ date: dates[1], open: 11, high: 12, low: 10, close: 11.5, adjustedClose: 11.5 })
const settlement = { schemaVersion: 1, executionEligible: false, targetDate: start, previousDate: dates[0], sealDigest: record.sealDigest, targetDigest: 'c'.repeat(64), executionContractDigest: contractDigest, sources, bars: Object.fromEntries(['UNG', 'VOO', 'QQQM'].map(s => [s, { previous, current }])) }
const verify = s => validateSimplificationSettlement(s, record, 'c'.repeat(64), contractDigest)
verify(settlement)
const badBar = structuredClone(settlement); badBar.bars.UNG.current.close += 1; assert.throws(() => verify(badBar), /retained source/)
const badPayload = structuredClone(settlement); badPayload.sources.UNG.rawPayload += ' '; assert.throws(() => verify(badPayload), /payload digest/)
assert.throws(() => verify({ ...settlement, targetDate: '2026-09-29' }))
assert.throws(() => verify({ ...settlement, previousDate: '2026-09-24' }))
assert.throws(() => verify({ ...settlement, sealDigest: 'd'.repeat(64) }))
console.log('Forward shadow: time/holiday boundaries, seal and candidate integrity, missing-vs-flat semantics, code compatibility, source-bound settlement bars pass.')
