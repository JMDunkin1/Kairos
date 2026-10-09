#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadLocalEnv } from './local-env.mjs'
import { desktopCatalog } from './qore-hub-service.mjs'
import { desktopTelemetry } from './lib/qore-desktop-telemetry.mjs'
import { qoreExecutionHostAssessment } from './lib/qore-execution-host.mjs'
import { portfolioStore, portfolioSnapshot, portfolioTelemetry, regularJson, atomicJson } from './lib/qore-portfolio-control.mjs'
import { shadowPolicy, observeShadow, shadowSummary, validateQuotes } from './lib/qore-portfolio-shadow.mjs'
import { portfolioSymbols } from './lib/qore-portfolio-plan.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2), command = args[0] ?? 'plan'
const options = new Map()
for (const arg of args.slice(1)) {
  if (!/^--(state|file|expected-revision|revision|interval|feed|paper-shadow)(=.+)?$/.test(arg)) throw new Error('Unknown portfolio option. Live and broker routing flags are not supported.')
  const split = arg.indexOf('='); const key = split === -1 ? arg.slice(2) : arg.slice(2, split)
  if (options.has(key)) throw new Error('Duplicate portfolio option.')
  options.set(key, split === -1 ? true : arg.slice(split + 1))
}
const stateDirectory = path.resolve(root, options.get('state') ?? '.local/qore/portfolio-control')
if (!stateDirectory.startsWith(path.join(root, '.local') + path.sep)) throw new Error('Portfolio operational state must stay under this repository’s .local directory.')
const strategies = desktopCatalog().strategies
const print = value => console.log(JSON.stringify(value, null, 2))
const cachedTelemetry = () => { try { return portfolioTelemetry(regularJson(path.join(stateDirectory, 'telemetry.json'))) } catch { return null } }
const snapshot = now => portfolioSnapshot({ root, stateDirectory, strategies, telemetry: cachedTelemetry(), now })

async function capture() {
  let value
  if (qoreExecutionHostAssessment().allowed) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/qore-dashboard-service.mjs'), '--snapshot-json'], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 512 * 1024 })
    if (result.status !== 0) throw new Error('The read-only local telemetry snapshot failed.')
    value = portfolioTelemetry(JSON.parse(result.stdout))
  } else {
    const connection = desktopTelemetry('http://127.0.0.1:4776', root)
    try {
      const response = await connection.read('/api/live/status', 'GET')
      if (response.status !== 200) throw new Error('The read-only M1 telemetry connection is unavailable.')
      value = portfolioTelemetry(response.body)
    } finally { await connection.stop() }
  }
  atomicJson(path.join(stateDirectory, 'telemetry.json'), value)
  return value
}
async function collectQuotes() {
  loadLocalEnv(root)
  const key = process.env.QORE_ALPACA_API_KEY_ID ?? process.env.APCA_API_KEY_ID ?? process.env.ALPACA_API_KEY_ID
  const secret = process.env.QORE_ALPACA_API_SECRET_KEY ?? process.env.APCA_API_SECRET_KEY ?? process.env.ALPACA_API_SECRET_KEY
  if (!key || !secret) throw new Error('Read-only market-data credentials are unavailable on this host. Run the observer on the credentialed research/execution host.')
  const feed = options.get('feed') ?? 'iex'
  if (!['iex', 'sip'].includes(feed)) throw new Error('The shadow observer requires a real-time IEX or SIP feed.')
  // A fixed GET-only market-data URL: no configured redirect or trading API is accepted.
  const url = new URL('https://data.alpaca.markets/v2/stocks/quotes/latest')
  url.searchParams.set('symbols', portfolioSymbols.join(',')); url.searchParams.set('feed', feed)
  const response = await fetch(url, { method: 'GET', redirect: 'error', headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Read-only quote collection failed (HTTP ${response.status}).`)
  const chunks = []; let size = 0
  for await (const chunk of response.body) { size += chunk.length; if (size > 64 * 1024) throw new Error('The quote response exceeded its size limit.'); chunks.push(chunk) }
  const raw = JSON.parse(Buffer.concat(chunks).toString())
  const packet = { schemaVersion: 1, source: 'alpaca-latest-quotes', recordedAt: new Date().toISOString(), quotes: Object.fromEntries(portfolioSymbols.map(symbol => {
    const quote = raw.quotes?.[symbol]
    return [symbol, { observedAt: quote?.t, bid: quote?.bp, ask: quote?.ap, bidSize: quote?.bs, askSize: quote?.as }]
  })) }
  const checked = validateQuotes(packet, shadowPolicy(root), Date.now())
  atomicJson(path.join(stateDirectory, 'quotes.json'), checked)
  return checked
}
async function observe() {
  if (options.get('paper-shadow') !== true) return { ...snapshot(Date.now()), note: 'Dry-run only. --paper-shadow is required to append modeled prospective observations.' }
  const packet = regularJson(path.join(stateDirectory, 'quotes.json'))
  const now = Date.now()
  return observeShadow({ stateDirectory, snapshot: snapshot(now), quotePacket: packet, policy: shadowPolicy(root), now })
}

try {
  if (command === 'plan') print(snapshot(Date.now()))
  else if (command === 'status') print({ saved: portfolioStore(stateDirectory, strategies).read(), shadow: shadowSummary(stateDirectory), ordersEnabled: false })
  else if (command === 'save') {
    if (typeof options.get('file') !== 'string' || typeof options.get('expected-revision') !== 'string') throw new Error('save requires --file=<configuration.json> and --expected-revision=<number>.')
    print(portfolioStore(stateDirectory, strategies).save(regularJson(path.resolve(root, options.get('file'))), Number(options.get('expected-revision'))))
  } else if (command === 'restore') {
    if (typeof options.get('revision') !== 'string' || typeof options.get('expected-revision') !== 'string') throw new Error('restore requires --revision=<number> and --expected-revision=<number>.')
    print(portfolioStore(stateDirectory, strategies).restore(Number(options.get('revision')), Number(options.get('expected-revision'))))
  } else if (command === 'capture') { await capture(); print({ status: 'captured', ordersEnabled: false }) }
  else if (command === 'quotes') { await collectQuotes(); print({ status: 'captured', ordersEnabled: false }) }
  else if (command === 'observe') print(await observe())
  else if (command === 'run') {
    if (options.get('paper-shadow') !== true) throw new Error('run requires --paper-shadow. This loop never routes broker orders.')
    const interval = Number(options.get('interval') ?? 15)
    if (!Number.isInteger(interval) || interval < 5 || interval > 60) throw new Error('Observer interval must be 5–60 seconds.')
    let stopping = false, timer, release
    const stop = () => { stopping = true; clearTimeout(timer); release?.() }
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    while (!stopping) {
      try { await capture(); if (stopping) break; await collectQuotes(); if (stopping) break; print(await observe()) }
      catch { print({ status: 'blocked', ordersEnabled: false, reason: 'Current telemetry or quotes failed validation. No modeled fills were committed on this pass.' }) }
      if (!stopping) await new Promise(resolve => { release = resolve; timer = setTimeout(resolve, interval * 1000) })
    }
  } else throw new Error('Use plan, status, save, restore, capture, quotes, observe or run.')
} catch (error) { console.error(error.message); process.exitCode = 1 }
