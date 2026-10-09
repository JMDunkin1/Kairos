import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { desktopCatalog, startHub } from './qore-hub-service.mjs'
import { desktopTelemetry } from './lib/qore-desktop-telemetry.mjs'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-desktop-'))
const ledger = path.join(temporary, 'ledger'); fs.mkdirSync(ledger)
const ledgerText = JSON.stringify({ schema_version: 1, experiment_id: 'failed-study', revision: 1, record_kind: 'study', status: 'failed', title: 'Retained failed study', full_frozen_protocol: { fixed: true }, retry_conditions: 'New independent inputs required' }) + '\n'
fs.writeFileSync(path.join(ledger, 'experiments.jsonl'), ledgerText)
const reads = []
let stopped = false
const hub = await startHub({ ledgerRoot: ledger, telemetryEnabled: true, telemetryFactory: () => ({ read: async (endpoint, method) => { reads.push([endpoint, method]); return { status: 200, body: { mode: 'paper', execution: { state: 'blocked' } } } }, stop: async () => { stopped = true } }) })
let sidecar
let upstream
let crashHub
let crashBridgePid
const environmentKeys = ['NODE_ENV', 'QORE_COMMAND_TEST_UPSTREAM_URL', 'QORE_COMMAND_T3_BASE_URL', 'QORE_COMMAND_SSH_BIN']
const environment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]))
try {
  const catalog = await (await fetch(`${hub.origin}/api/hub/catalog`)).json()
  assert.equal(catalog.strategies.length, new Set(catalog.strategies.map(s => s.id)).size)
  assert.equal(catalog.brokerSubmissionEnabled, false)
  for (const id of ['ngas-all-year-beta', 'lev_core_relative_leverage_sleeves_v3', 'rv_xle_brent_residual', 'rv_ief_barbell_residual', 'BTC_PRIOR_CALENDAR_MONTH_LOSS_TO_CASH_01']) assert.ok(catalog.strategies.some(s => s.id === id))
  const futureStrategies = Array.from({ length: 64 }, (_, i) => ({ id: `registered-${i}`, name: `Registered research ${i}`, stage: 'research', label: 'Adapter pending', description: 'New frozen research registration.', view: 'unconfigured', apiKey: 'never-forward-this-test-value' }))
  const expanded = desktopCatalog({ ...catalog, strategies: [...catalog.strategies.toReversed(), ...futureStrategies], secret: 'never-forward-this-test-value' })
  assert.equal(expanded.strategies.length, catalog.strategies.length + futureStrategies.length)
  assert.ok(!JSON.stringify(expanded).includes('never-forward-this-test-value'))
  assert.throws(() => desktopCatalog({ ...catalog, strategies: [...catalog.strategies, catalog.strategies[0]] }), /duplicate/)
  assert.throws(() => desktopCatalog({ ...catalog, strategies: [{ ...futureStrategies[0], role: 'baseline' }] }), /Invalid/)
  assert.throws(() => desktopCatalog({ ...catalog, strategies: [{ ...futureStrategies[0], view: 'ngas' }] }), /own reviewed evidence adapter/)
  for (const id of [undefined, null, 123]) assert.throws(() => desktopCatalog({ ...catalog, strategies: [{ ...futureStrategies[0], id }] }), /Invalid/)

  assert.ok(!catalog.strategies.some(s => ['trend-core', 'reversion-core', 'relative-value', 'TQQQ_50_QQQ_static', 'ngas-summer-alpha', 'ngas-winter-alpha'].includes(s.id)))
  assert.deepEqual(reads, [], 'catalogue does not open the M1 connection')
  for (const endpoint of ['/api/hub/runs', '/api/hub/replay', '/api/hub/paper-candidates', '/api/broker/orders']) assert.equal((await fetch(hub.origin + endpoint, { method: 'POST', headers: { Origin: hub.origin }, body: '{}' })).status, 405)
  assert.equal((await fetch(hub.origin + '/api/hub/runs')).status, 404)
  const history = await (await fetch(hub.origin + '/api/hub/experiments')).json()
  assert.equal(history.experiments[0].status, 'failed')
  assert.match(history.experiments[0].retry, /New independent/)
  assert.equal(fs.readFileSync(path.join(ledger, 'experiments.jsonl'), 'utf8'), ledgerText)
  assert.equal((await fetch(hub.origin + '/api/live/refresh', { method: 'POST' })).status, 403)
  assert.equal((await fetch(hub.origin + '/api/live/status', { headers: { Origin: 'https://example.invalid' } })).status, 403)
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(hub.origin + '/api/live/status', { headers: { Host: 'example.invalid' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)) })
    request.once('error', reject)
  })
  assert.equal(invalidHostStatus, 403)
  assert.equal((await fetch(hub.origin + '/api/live/status')).status, 200)
  assert.equal((await fetch(hub.origin + '/api/live/refresh', { method: 'POST', headers: { Origin: hub.origin } })).status, 200)
  assert.deepEqual(reads, [['/api/live/status', 'GET'], ['/api/live/refresh', 'POST']])
  const ngas = await fetch(hub.origin + '/ngas.html')
  assert.equal(ngas.status, 200)
  assert.match(await ngas.text(), /Kairos/)
  const home = await fetch(hub.origin)
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/)
  assert.match(await home.text(), /Kairos \| Strategies/)
  assert.equal((await fetch(hub.origin + '/.env.local')).status, 403)
  await hub.stop(); assert.equal(stopped, true)

  const disabled = await startHub({ ledgerRoot: ledger })
  try { assert.equal((await fetch(disabled.origin + '/api/live/status')).status, 503) } finally { await disabled.stop() }

  upstream = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.url === '/' ? '{}' : JSON.stringify({ mode: 'paper', risk: { blockedReasons: ['Test-only blocked state'], warnings: [] } })) })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`
  process.env.NODE_ENV = 'test'; process.env.QORE_COMMAND_TEST_UPSTREAM_URL = upstreamOrigin; process.env.QORE_COMMAND_T3_BASE_URL = upstreamOrigin; process.env.QORE_COMMAND_SSH_BIN = '/no-ssh-in-tests'
  sidecar = desktopTelemetry('http://127.0.0.1:55555', process.cwd())
  const status = await sidecar.read('/api/live/status', 'GET')
  assert.equal(status.status, 200); assert.equal(status.body.mode, 'paper')
  assert.equal((await sidecar.read('/api/live/refresh', 'POST')).status, 200)
  await assert.rejects(sidecar.read('/api/broker/orders', 'POST'), /Unsupported read-only/)
  await sidecar.stop()
  await assert.rejects(sidecar.read('/api/live/status', 'GET'), /closing/)
  crashHub = spawn(process.execPath, ['scripts/qore-hub-service.mjs'], { cwd: process.cwd(), env: { ...process.env, QORE_HUB_LEDGER_ROOT: ledger, QORE_HUB_ENABLE_TELEMETRY: '1', QORE_HUB_PARENT_PID: String(process.pid) }, stdio: ['ignore', 'pipe', 'pipe'] })
  const crashOrigin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Isolated hub startup timed out.')), 5_000)
    crashHub.once('error', error => { clearTimeout(timeout); reject(error) })
    crashHub.stdout.once('data', chunk => { clearTimeout(timeout); resolve(chunk.toString().trim()) })
  })
  assert.equal((await fetch(crashOrigin + '/api/live/status')).status, 200)
  const children = spawnSync('ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' }).stdout.split('\n').map(line => line.trim().split(/\s+/)).filter(fields => Number(fields[1]) === crashHub.pid)
  assert.equal(children.length, 1, 'the isolated hub owns exactly one bridge child')
  crashBridgePid = Number(children[0][0])
  const exited = new Promise(resolve => crashHub.once('exit', resolve))
  crashHub.kill('SIGKILL'); await exited
  const running = () => {
    const stat = spawnSync('ps', ['-p', String(crashBridgePid), '-o', 'stat='], { encoding: 'utf8' }).stdout.trim()
    return stat !== '' && !stat.startsWith('Z')
  }
  const deadline = Date.now() + 4_000
  while (running() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(running(), false, 'bridge exits after its hub parent crashes')
  crashBridgePid = null
  console.log('PASS: expandable registry, narrow DTOs, preserved ledger, absent synthetic/order endpoints, exact origins, NGAS assets, lazy read-only bridge, normal shutdown and parent-crash cleanup')
} finally {
  await sidecar?.stop()
  await hub.stop()
  if (crashHub?.exitCode === null && crashHub?.signalCode === null) crashHub.kill('SIGKILL')
  if (crashBridgePid) { try { process.kill(crashBridgePid, 'SIGKILL') } catch { /* already stopped */ } }
  if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) }
  for (const key of environmentKeys) { if (environment[key] === undefined) delete process.env[key]; else process.env[key] = environment[key] }
  fs.rmSync(temporary, { recursive: true, force: true })
}
