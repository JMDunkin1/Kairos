import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readExperimentLedger, canonicalLedgerRoot } from './lib/qore-hub-ledger.mjs'
import { assertHubRuntime } from './lib/qore-hub-runtime.mjs'
import { migrateLegacyHubState } from './lib/qore-hub-state-migration.mjs'
import { loadHistoricalReplay } from './lib/qore-hub-replay.mjs'
import { paperReadResponse } from './lib/qore-hub-paper.mjs'

assertHubRuntime()
const { createRunStore, weeklyReport } = await import('./lib/qore-hub-store.mjs')
const { defaultDefinitions, defaultAssumptions, ngasDefinition } = await import('../src/hub/strategies.ts')

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
export const capabilities = [
  { id: 'fixture', name: 'Deterministic fixture feed', type: 'Data / simulation', status: 'available', products: 'Synthetic USD ETF-like bars; raw prices + explicit income' },
  { id: 'simulation', name: 'Shared portfolio simulator', type: 'Execution', status: 'available', products: 'Fractional USD equity/ETF sleeves; opposing legs; gross ≤ 1× per sleeve' },
  { id: 'alpaca', name: 'Alpaca paper', type: 'Broker', status: 'unconfigured', products: 'Designed boundary only. No credentials read, connection made, or orders sent.' },
  { id: 'ngas', name: 'Existing NGAS adapter', type: 'Strategy / data', status: 'unsupported', products: 'Existing code preserved. Approved released targets and bars required for replay.' },
  { id: 'futures', name: 'Futures / options / FX', type: 'Broker', status: 'unsupported', products: 'Types reserved; expiry, margin, contract selection and venue adapters absent.' },
  { id: 'external', name: 'Exogenous / alternative feeds', type: 'Data', status: 'unsupported', products: 'Availability timestamps required; no provider connected.' },
  { id: 'live', name: 'Live execution', type: 'Broker', status: 'unconfigured', products: 'Disabled. Separate reviewed broker setup and user authorization required.' },
  { id: 'paper-report', name: 'Actual PAPER account report', type: 'Reporting', status: 'unavailable', products: 'No reviewed account export installed. Simulation reports cannot establish actual account performance.' },
  { id: 'weekly-email', name: 'Scheduled weekly email', type: 'Delivery', status: 'inactive', products: 'Collection, reconciliation, durable export and delivery setup are unverified. No timer activated.' },
]
// Reviewed owner handoff only; the desktop never opens runtime paths or collects account data.
export const reporting = {
  serviceId: 'qore-weekly-paper-brief', contractVersion: 1, checkedAt: '2026-10-02T21:10:00Z',
  contractHash: 'd1290d5feb495d63f372264118ac5b8fdf044f02ce9804d8470c8a5f09d27b5d',
  status: 'real-paper-unavailable', delivery: 'scheduled-email-inactive',
  pureModule: 'scripts/lib/qore-weekly-performance.mjs',
  exports: ['buildWeeklyPerformance', 'weeklyCaption', 'renderWeeklyBriefSvg'],
  metrics: 'Total account return excludes external flows. Strategy contribution is percentage points after removing actual VOO/QQQM dollar P&L; both series use account capital.',
  requirements: 'Complete history and order lineage, RAW marks, ledger/NAV/position reconciliation, fresh native collection and reviewed export provenance. Missing or inconsistent inputs withhold performance.',
  nextStep: 'Approved native installation and a durable sanitized export, then separately verified delivery setup. Collection must keep historical SIP data at least 15 minutes old. No paid subscription required.',
}
export function unavailableBroker(mode) { return { id: 'alpaca', mode, status: 'unconfigured', products: ['equity', 'etf'], submit() { throw new Error('Broker execution is disabled in the desktop research candidate.') } } }

function validateListener(host, port) {
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('Hub host must be 127.0.0.1 or localhost.')
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Hub port must be an integer between 0 and 65535.')
}

export function hubListenerOptions(args = process.argv.slice(2), env = process.env) {
  let host = '127.0.0.1', rawPort = env.QORE_HUB_PORT ?? '0'
  for (let i = 0; i < args.length; i++) {
    const [flag, ...inlineParts] = args[i].split('=')
    const inline = inlineParts.length ? inlineParts.join('=') : undefined
    if (flag === '--strictPort' && inline === undefined) continue // Node's listener already fails on an occupied port.
    if (!['--host', '--port'].includes(flag)) throw new Error(`Unsupported hub argument: ${args[i]}`)
    const value = inline ?? args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`)
    if (flag === '--host') host = value
    else rawPort = value
  }
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN
  validateListener(host, port)
  return { host, port }
}

export async function startHub({ port = 0, host = '127.0.0.1', stateRoot = path.join(repoRoot, '.local/hub'), ledgerRoot = canonicalLedgerRoot, legacyStateRoot, revision = '64c253d+local-candidate' } = {}) {
  validateListener(host, port)
  const migration = migrateLegacyHubState({ sourceRoot: legacyStateRoot, destinationRoot: stateRoot })
  const store = createRunStore(stateRoot, repoRoot, revision)
  let expectedHost = ''
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)) }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== expectedHost) return json(res, 403, { error: 'Invalid local host.' })
      const origin = `http://${expectedHost}`
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Origin rejected.' })
      const url = new URL(req.url, origin)
      if (req.method === 'POST') {
        if (['conflict', 'attention'].includes(migration.status)) return json(res, 409, { error: 'Previous run migration needs attention; originals and destination records are preserved. Quit QORE and resolve the reported storage conflict before recording new trials.' })
        if (req.headers.origin !== origin || req.headers['x-qore-local'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: 'Local application requests only.' })
        if (url.pathname !== '/api/hub/runs') return json(res, 404, { error: 'No execution endpoint exists.' })
        let body = ''
        for await (const chunk of req) { body += chunk; if (body.length > 64000) return json(res, 413, { error: 'Run request too large.' }) }
        const input = JSON.parse(body)
        const record = store.run(input.request, input.parentRunId ?? null)
        return json(res, 201, record)
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Unsupported method.' })
      if (url.pathname === '/api/hub/health') return json(res, 200, { status: 'ready', mode: 'paper-simulation' })
      if (url.pathname === '/api/hub/catalog') return json(res, 200, { migration, definitions: defaultDefinitions, ngas: ngasDefinition, assumptions: defaultAssumptions, capabilities, reporting, feed: { id: 'fixture-two-assets', version: '1', exposure: 'synthetic', development: '2026-01-05 → 2026-03-27', test: '2026-03-30 → 2026-05-08', protected: 'Unavailable; never read' } })
      if (url.pathname === '/api/hub/replay') return json(res, 200, loadHistoricalReplay())
      const paperResponse = paperReadResponse(url)
      if (paperResponse) return json(res, paperResponse.status, paperResponse.body)
      if (url.pathname === '/api/hub/runs') return json(res, 200, store.list())
      if (url.pathname === '/api/hub/experiments') return json(res, 200, readExperimentLedger(ledgerRoot))
      const match = url.pathname.match(/^\/api\/hub\/runs\/(run-[a-f0-9-]{36})(?:\/(report|export))?$/)
      if (match) {
        const record = store.get(match[1])
        if (match[2] === 'report') return json(res, 200, weeklyReport(record))
        if (match[2] === 'export') {
          res.setHeader('Content-Disposition', `attachment; filename="${record.id}.json"`)
          return json(res, 200, record)
        }
        return json(res, 200, record)
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown research endpoint.' })
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1)
      if (relative.split('/').some(part => part === '..' || part.startsWith('.'))) return json(res, 403, { error: 'Asset rejected.' })
      const dist = path.join(repoRoot, 'dist'), filename = path.resolve(dist, relative)
      if (!filename.startsWith(dist + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return json(res, 404, { error: 'Build the desktop UI first.' })
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(filename)]
      if (!mime) return json(res, 403, { error: 'Asset type rejected.' })
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" })
      fs.createReadStream(filename).pipe(res)
    } catch (error) { json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Run unavailable.' : String(error.message).slice(0, 300) }) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { expectedHost = `${host}:${server.address().port}`; resolve() }) })
  return { server, origin: `http://${expectedHost}`, store }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, origin } = await startHub({ ...hubListenerOptions(), stateRoot: process.env.QORE_HUB_STATE, ledgerRoot: process.env.QORE_HUB_LEDGER_ROOT, legacyStateRoot: process.env.QORE_HUB_LEGACY_STATE })
  // The native launcher consumes one readiness URL over a private stdout pipe.
  console.log(origin)
  let parentWatch
  const stop = () => { clearInterval(parentWatch); server.close(() => process.exit(0)); server.closeAllConnections() }
  const parentPid = Number(process.env.QORE_HUB_PARENT_PID ?? 0)
  if (Number.isInteger(parentPid) && parentPid > 1) parentWatch = setInterval(() => { try { process.kill(parentPid, 0) } catch { stop() } }, 5000)
  process.on('SIGTERM', stop); process.on('SIGINT', stop)
}
