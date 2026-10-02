import assert from 'node:assert/strict'
import { createTelemetryLoader } from '../src/runtime/telemetryLoader.ts'
const pending = []
const results = []
const busy = []
const errors = []
let active = true
const loader = createTelemetryLoader(refresh => new Promise((resolve, reject) => pending.push({ refresh, resolve, reject })), {
  isActive: () => active,
  onResult: value => results.push(value),
  onError: error => errors.push(error.message),
  onBusy: value => busy.push(value),
})
const passive = loader.load()
const refresh = loader.load(true)
await loader.load()
await loader.load(true)
assert.equal(pending.length, 2, 'polling and repeat refresh must not interrupt the manual request')
assert.deepEqual(busy, [true])
pending[0].resolve('old cached data')
await passive
assert.deepEqual(results, [])
assert.deepEqual(busy, [true])
pending[1].resolve('refreshed data')
await refresh
assert.deepEqual(results, ['refreshed data'])
assert.deepEqual(busy, [true, false])
const resumed = loader.load()
pending[2].resolve('next poll')
await resumed
assert.deepEqual(results, ['refreshed data', 'next poll'])
const unmounted = loader.load()
loader.invalidate()
active = false
pending[3].resolve('unmounted result')
await unmounted
assert.deepEqual(results, ['refreshed data', 'next poll'])
active = true
const failed = loader.load(true)
pending[4].reject(new Error('read failure'))
await failed
assert.deepEqual(errors, ['read failure'])
assert.equal(busy.at(-1), false)
console.log('PASS: manual refresh remains authoritative, passive polling resumes, late unmounted reads ignored, errors release busy state')
