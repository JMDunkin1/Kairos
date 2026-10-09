import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readExperimentLedger, canonicalLedgerRoot } from './lib/qore-hub-ledger.mjs'
import { loadHistoricalReplay } from './lib/qore-hub-replay.mjs'
import { paperReadResponse, paperIds } from './lib/qore-hub-paper.mjs'
import { desktopTelemetry } from './lib/qore-desktop-telemetry.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const internalIdentities = new Set(['ngas-summer-alpha', 'ngas-winter-alpha', 'trend-core', 'reversion-core', 'relative-value', 'TQQQ_50_QQQ_static'])
const boundedText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
const configuredAdapters = { ngas: new Set(['ngas-all-year-beta']), leverage: new Set(['lev_core_relative_leverage_sleeves_v3']), paper: new Set(paperIds) }
export function desktopCatalog(catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/qore-desktop.json'), 'utf8'))) {
  if (catalog.schemaVersion !== 1 || catalog.brokerSubmissionEnabled !== false || !boundedText(catalog.application, 80) || !Array.isArray(catalog.strategies) || !catalog.strategies.length) throw new Error('The desktop strategy registry is invalid.')
  const identities = new Set()
  const strategies = catalog.strategies.map(strategy => {
    if (!strategy || typeof strategy.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(strategy.id) || internalIdentities.has(strategy.id) || identities.has(strategy.id) || (strategy.role !== undefined && strategy.role !== 'strategy')
      || !boundedText(strategy.name, 150) || !boundedText(strategy.stage, 80) || !boundedText(strategy.label, 150) || !boundedText(strategy.description, 1200)
      || !['ngas', 'leverage', 'paper', 'unconfigured'].includes(strategy.view)) throw new Error('Invalid or duplicate strategy registration.')
    if (strategy.view !== 'unconfigured' && !configuredAdapters[strategy.view].has(strategy.id)) throw new Error('This strategy needs its own reviewed evidence adapter.')
    identities.add(strategy.id)
    // Only display metadata crosses into the browser, never arbitrary config.
    return Object.fromEntries(['id', 'name', 'stage', 'label', 'description', 'view'].map(key => [key, strategy[key]]))
  })
  return { schemaVersion: 1, application: catalog.application, brokerSubmissionEnabled: false, strategies }
}

export async function startHub({ port = 0, host = '127.0.0.1', ledgerRoot = canonicalLedgerRoot, telemetryEnabled = false, telemetryFactory = desktopTelemetry } = {}) {
  if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('QORE requires a valid loopback listener.')
  let expectedHost = ''
  let telemetry = null
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)) }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== expectedHost) return json(res, 403, { error: 'Invalid local host.' })
      const origin = `http://${expectedHost}`
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Origin rejected.' })
      const url = new URL(req.url, origin)
      if (['/api/live/status', '/api/connection/status', '/api/live/refresh'].includes(url.pathname)) {
        const allowed = (req.method === 'GET' && url.pathname !== '/api/live/refresh') || (req.method === 'POST' && url.pathname === '/api/live/refresh')
        if (!allowed) return json(res, 405, { error: 'Unsupported read-only request.' })
        if (req.method === 'POST' && req.headers.origin !== origin) return json(res, 403, { error: 'Local application requests only.' })
        if (!telemetryEnabled) return json(res, 503, { error: 'Read-only runtime telemetry is disabled for this service.' })
        telemetry ??= telemetryFactory(origin, root)
        const result = await telemetry.read(url.pathname, req.method)
        return json(res, result.status, result.body)
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'This application has no strategy or broker submission endpoint.' })
      if (url.pathname === '/api/hub/health') return json(res, 200, { status: 'ready', mode: 'read-only-strategy-hub' })
      if (url.pathname === '/api/hub/catalog') return json(res, 200, desktopCatalog())
      if (url.pathname === '/api/hub/experiments') return json(res, 200, readExperimentLedger(ledgerRoot))
      if (url.pathname === '/api/hub/replay') return json(res, 200, loadHistoricalReplay())
      const paperResponse = paperReadResponse(url)
      if (paperResponse) return json(res, paperResponse.status, paperResponse.body)
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown read-only endpoint.' })
      const relative = url.pathname === '/' ? 'desktop.html' : url.pathname === '/ngas.html' ? 'index.html' : decodeURIComponent(url.pathname).slice(1)
      if (relative.split('/').some(part => part === '..' || part.startsWith('.'))) return json(res, 403, { error: 'Asset rejected.' })
      const dist = path.join(root, 'dist'), filename = path.resolve(dist, relative)
      if (!filename.startsWith(dist + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return json(res, 404, { error: 'Application asset unavailable.' })
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(filename)]
      if (!mime) return json(res, 403, { error: 'Asset type rejected.' })
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" })
      fs.createReadStream(filename).pipe(res)
    } catch (error) { json(res, error.code === 'ENOENT' ? 404 : 502, { error: error.code === 'ENOENT' ? 'Evidence unavailable.' : String(error.message).slice(0, 240) }) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { expectedHost = `${host}:${server.address().port}`; resolve() }) })
  const stop = async () => {
    const closed = new Promise(resolve => server.close(resolve))
    server.closeAllConnections()
    await telemetry?.stop()
    await closed
  }
  return { server, origin: `http://${expectedHost}`, stop }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { origin, stop } = await startHub({ ledgerRoot: process.env.QORE_HUB_LEDGER_ROOT, telemetryEnabled: process.env.QORE_HUB_ENABLE_TELEMETRY === '1' })
  console.log(origin)
  let stopping = false
  const shutdown = () => { if (!stopping) { stopping = true; clearInterval(parentWatch); void stop().then(() => process.exit(0)) } }
  const parentPid = Number(process.env.QORE_HUB_PARENT_PID ?? 0)
  const parentWatch = Number.isInteger(parentPid) && parentPid > 1 ? setInterval(() => { try { process.kill(parentPid, 0) } catch { shutdown() } }, 5_000) : undefined
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}
