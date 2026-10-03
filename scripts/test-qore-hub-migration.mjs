import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { migrateLegacyHubState, withHubStateLock } from './lib/qore-hub-state-migration.mjs'
import { createRunStore } from './lib/qore-hub-store.mjs'
import { defaultDefinitions, defaultAssumptions } from '../src/hub/strategies.ts'
import { fileURLToPath } from 'node:url'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-migration-'))
const repo = fileURLToPath(new URL('..', import.meta.url))
const id = n => `run-00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const record = (n, error = 'Preserved blocked research') => ({ id: id(n), createdAt: '2026-10-02T00:00:00Z', status: 'blocked', request: {}, error })
const event = r => JSON.stringify({ ...r, event: 'outcome' }) + '\n'
function fixture(name, records) {
  const root = path.join(temporary, name)
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true })
  for (const r of records) fs.writeFileSync(path.join(root, 'runs', r.id + '.json'), JSON.stringify(r))
  fs.writeFileSync(path.join(root, 'experiments.jsonl'), records.map(event).join(''))
  return root
}
const bytes = root => Object.fromEntries(fs.readdirSync(root, { recursive: true }).filter(name => fs.statSync(path.join(root, name)).isFile()).map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]))
try {
  const empty = fixture('empty', []), absent = path.join(temporary, 'never-created')
  assert.equal(migrateLegacyHubState({ sourceRoot: empty, destinationRoot: absent }).status, 'empty')
  assert.equal(fs.existsSync(absent), false)
  const source = fixture('source', [record(1), record(2)])
  fs.writeFileSync(path.join(source, 'unrelated-note.txt'), 'Keep original notes')
  fs.writeFileSync(path.join(source, 'runs', '.interrupted.tmp'), 'unfinished')
  const original = bytes(source), destination = fixture('destination', [record(3)])
  const alias = path.join(temporary, 'source-alias')
  fs.symlinkSync(source, alias)
  assert.match(migrateLegacyHubState({ sourceRoot: source, destinationRoot: path.join(alias, 'new') }).error, /separate directories/)
  assert.equal(fs.existsSync(path.join(source, 'new')), false, 'symlink ancestor cannot hide a destination inside the original source')
  const prefix = fs.readFileSync(path.join(destination, 'experiments.jsonl'))
  const receipt = migrateLegacyHubState({ sourceRoot: source, destinationRoot: destination })
  assert.equal(receipt.status, 'migrated'); assert.equal(receipt.importedRuns, 2); assert.equal(receipt.importedEvents, 2)
  assert.deepEqual(bytes(source), original, 'every original file stays unchanged')
  assert.ok(fs.readFileSync(path.join(destination, 'experiments.jsonl')).subarray(0, prefix.length).equals(prefix), 'existing registry bytes remain the exact prefix')
  assert.equal(fs.existsSync(path.join(destination, 'unrelated-note.txt')), false)
  const first = bytes(destination)
  assert.equal(migrateLegacyHubState({ sourceRoot: source, destinationRoot: destination }).status, 'up-to-date')
  assert.deepEqual(bytes(destination), first, 'repeated import adds no events and changes no files')
  assert.equal(fs.statSync(path.join(destination, 'runs', id(1) + '.json')).mode & 0o777, 0o400)

  const conflictDestination = fixture('run-conflict', [record(1, 'Different destination result')])
  const conflictBefore = bytes(conflictDestination)
  assert.equal(migrateLegacyHubState({ sourceRoot: source, destinationRoot: conflictDestination }).status, 'conflict')
  assert.deepEqual(bytes(conflictDestination), conflictBefore, 'conflict blocks all copies and preserves destination data')
  const registryConflict = fixture('event-conflict', [])
  fs.writeFileSync(path.join(registryConflict, 'experiments.jsonl'), event(record(1, 'Different event')))
  assert.equal(migrateLegacyHubState({ sourceRoot: source, destinationRoot: registryConflict }).status, 'conflict')
  assert.equal(fs.readdirSync(path.join(registryConflict, 'runs')).length, 0)

  const broken = fixture('broken', [record(1)])
  fs.writeFileSync(path.join(broken, 'runs', id(1) + '.json'), '{"id":')
  assert.equal(migrateLegacyHubState({ sourceRoot: broken, destinationRoot: destination }).status, 'attention')
  const partialRegistry = fixture('partial-registry', [record(1)])
  fs.writeFileSync(path.join(partialRegistry, 'experiments.jsonl'), event(record(1)).trimEnd())
  assert.match(migrateLegacyHubState({ sourceRoot: partialRegistry, destinationRoot: destination }).error, /Incomplete registry/)
  const linked = fixture('linked', [])
  fs.symlinkSync(path.join(source, 'runs', id(1) + '.json'), path.join(linked, 'runs', id(1) + '.json'))
  assert.match(migrateLegacyHubState({ sourceRoot: linked, destinationRoot: destination }).error, /regular file/)

  const interrupted = fixture('interrupted', [])
  const rename = fs.renameSync
  try {
    fs.renameSync = () => { throw new Error('Injected interruption before registry publication') }
    const result = migrateLegacyHubState({ sourceRoot: source, destinationRoot: interrupted })
    assert.equal(result.status, 'attention'); assert.equal(result.importedRuns, 2)
    assert.equal(fs.readFileSync(path.join(interrupted, 'experiments.jsonl'), 'utf8'), '')
  } finally { fs.renameSync = rename }
  const recovered = migrateLegacyHubState({ sourceRoot: source, destinationRoot: interrupted })
  assert.equal(recovered.status, 'migrated'); assert.equal(recovered.importedRuns, 0); assert.equal(recovered.importedEvents, 2)
  assert.equal(migrateLegacyHubState({ sourceRoot: source, destinationRoot: interrupted }).status, 'up-to-date')
  assert.deepEqual(bytes(source), original)

  const store = createRunStore(destination, repo)
  const request = { definitions: structuredClone(defaultDefinitions), capital: 100000, partition: 'development', assumptions: { ...defaultAssumptions }, flows: [] }
  withHubStateLock(destination, () => {
    assert.equal(migrateLegacyHubState({ sourceRoot: source, destinationRoot: destination }).status, 'attention')
    assert.throws(() => store.run(request), /storage is locked/, 'new trials and migration cannot race')
  })
  const completed = store.run(request)
  assert.equal(completed.status, 'completed', 'new trials still work after migration')
  const validSource = fixture('completed-valid', [completed])
  assert.equal(migrateLegacyHubState({ sourceRoot: validSource, destinationRoot: path.join(temporary, 'complete-import') }).status, 'migrated', 'intact completed history remains compatible')
  for (const [name, change] of [
    ['object-engine', r => { r.engineVersion = {} }],
    ['object-revision', r => { r.codeRevision = {} }],
    ['missing-partition', r => { delete r.request.partition }],
    ['null-summary', r => { r.result.summary = null }],
    ['empty-summary', r => { r.result.summary = {} }],
    ['missing-point', r => { r.result.points[0].date = null }],
    ['missing-sleeve', r => { r.result.sleeves[0].positions = null }],
    ['invalid-protocol', r => { r.request.definitions = null }],
  ]) {
    const bad = structuredClone(completed); change(bad)
    const badSource = fixture(name, [bad]), badDestination = path.join(temporary, name + '-destination')
    assert.match(migrateLegacyHubState({ sourceRoot: badSource, destinationRoot: badDestination }).error, /Incomplete legacy result/)
    assert.equal(fs.existsSync(path.join(badDestination, 'runs', bad.id + '.json')), false, 'incomplete history cannot poison run selection')
  }
  const malformedBlocked = { ...record(99), request: { partition: {} } }
  const blockedSource = fixture('blocked-display', [malformedBlocked])
  assert.match(migrateLegacyHubState({ sourceRoot: blockedSource, destinationRoot: path.join(temporary, 'blocked-destination') }).error, /Invalid legacy display fields/)
  console.log('PASS: preserved originals, existing history, immutable copies, idempotence, conflicts, malformed/symlink refusal, interrupted recovery, and shared writer lock')
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
