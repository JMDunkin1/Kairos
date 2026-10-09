import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { defaultPortfolio, validatePortfolio, ngasTargetInput, targetInputReady, planPortfolio } from './qore-portfolio-plan.mjs'

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const conflict = message => Object.assign(new Error(message), { status: 409 })
const verifiedRecords = new Map()
export function regularJson(filename, maxBytes = 1024 * 1024) {
  let current = path.parse(path.resolve(filename)).root
  for (const part of path.resolve(filename).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Portfolio state cannot follow symbolic links.')
  }
  const stat = fs.statSync(filename)
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid or oversized portfolio state.')
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}
export function ensureStateDirectory(directory) {
  // Check existing ancestors before mkdir; mutable state must never write through symlinks.
  let current = path.parse(path.resolve(directory)).root
  for (const part of path.resolve(directory).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try { const stat = fs.lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Invalid portfolio state directory.') }
    catch (error) { if (error.code !== 'ENOENT') throw error; fs.mkdirSync(current, { mode: 0o700 }) }
  }
}
export function atomicJson(filename, value) {
  ensureStateDirectory(path.dirname(filename))
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw new Error('Invalid portfolio state file.')
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`
  let fd
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    fs.renameSync(temporary, filename)
    const directory = fs.openSync(path.dirname(filename), 'r'); try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
  } finally { if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, { force: true }) }
}
export function withPortfolioLock(directory, operation) {
  ensureStateDirectory(directory)
  const lock = path.join(directory, 'operation.lock')
  let fd
  try { fd = fs.openSync(lock, 'wx', 0o600) }
  catch (error) { if (error.code === 'EEXIST') throw conflict('Portfolio state is busy. Retry after the current writer finishes; stale locks require operator inspection.'); throw error }
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); return operation() }
  finally { fs.closeSync(fd); fs.unlinkSync(lock) }
}

export function readPortfolioChain(directory, names, sequenceKey, maxBytes, validateRecord) {
  let previousSha256 = null, latest = null
  for (const [index, name] of names.entries()) {
    const filename = path.resolve(directory, name), stat = fs.lstatSync(filename, { bigint: true })
    if (!stat.isFile() || stat.size > BigInt(maxBytes)) throw new Error('Invalid or oversized portfolio journal record.')
    const stamp = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
    let checked = verifiedRecords.get(filename)
    // Verify changed files and always reread the latest payload; cache only chain metadata.
    if (checked?.stamp !== stamp || index === names.length - 1) {
      const record = regularJson(filename, maxBytes), { sha256, ...payload } = record
      if (record.schemaVersion !== 1 || sha256 !== digest(payload)) throw new Error('Portfolio journal integrity check failed.')
      validateRecord(record)
      checked = { stamp, sha256, previousSha256: record.previousSha256, sequence: record[sequenceKey] }
      verifiedRecords.set(filename, checked)
      if (index === names.length - 1) latest = record
    }
    if (checked.sequence !== index + 1 || name !== `${String(index + 1).padStart(12, '0')}.json` || checked.previousSha256 !== previousSha256) throw new Error('Portfolio journal chain is invalid or incomplete.')
    previousSha256 = checked.sha256
  }
  return latest
}

export function portfolioStore(directory, strategies) {
  const revisionsDir = path.join(directory, 'revisions')
  const files = () => {
    try {
      const stat = fs.lstatSync(revisionsDir)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid revision directory.')
      return fs.readdirSync(revisionsDir).filter(name => /^\d{12}\.json$/.test(name)).sort()
    } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  const readRecord = filename => {
    const record = regularJson(path.join(revisionsDir, filename))
    const { sha256, ...payload } = record
    if (sha256 !== digest(payload) || record.schemaVersion !== 1 || !Number.isSafeInteger(record.revision) || filename !== `${String(record.revision).padStart(12, '0')}.json` || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('Portfolio revision integrity check failed.')
    validatePortfolio(record.config, strategies)
    return record
  }
  const read = () => {
    const names = files()
    if (!names.length) return { revision: 0, updatedAt: null, config: defaultPortfolio(strategies), history: [] }
    const record = readPortfolioChain(revisionsDir, names, 'revision', 1024 * 1024, r => {
      if (!Number.isFinite(Date.parse(r.updatedAt))) throw new Error('Portfolio revision integrity check failed.')
      validatePortfolio(r.config, strategies)
    })
    return { revision: record.revision, updatedAt: record.updatedAt, config: validatePortfolio(record.config, strategies), history: names.slice(-20).reverse().map(name => {
      const r = readRecord(name)
      return { revision: r.revision, updatedAt: r.updatedAt, capitalUsd: r.config.capitalUsd, participating: r.config.allocations.filter(a => a.enabled && a.capitalUsd > 0).length, paused: r.config.paused }
    }) }
  }
  return { read, save(config, expectedRevision) {
    config = validatePortfolio(config, strategies)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('A valid expected revision is required.')
    return withPortfolioLock(directory, () => {
      const previous = read()
      if (previous.revision !== expectedRevision) throw conflict('The portfolio changed in another session. Reload the saved plan before saving again.')
      ensureStateDirectory(revisionsDir)
      const previousRecord = previous.revision ? readRecord(`${String(previous.revision).padStart(12, '0')}.json`) : null
      const record = { schemaVersion: 1, revision: previous.revision + 1, updatedAt: new Date().toISOString(), previousSha256: previousRecord?.sha256 ?? null, config }
      atomicJson(path.join(revisionsDir, `${String(record.revision).padStart(12, '0')}.json`), { ...record, sha256: digest(record) })
      return read()
    })
  }, restore(revision, expectedRevision) {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid revision to restore.')
    return this.save(readRecord(`${String(revision).padStart(12, '0')}.json`).config, expectedRevision)
  } }
}

export function loadPortfolioAdapters(root, strategies) {
  const registry = regularJson(path.join(root, 'config/qore-portfolio-adapters.json'))
  if (registry.schemaVersion !== 1 || registry.ordersEnabled !== false || !Array.isArray(registry.adapters)) throw new Error('Invalid portfolio adapter registry.')
  const ids = new Set(strategies.map(s => s.id)), seen = new Set()
  for (const adapter of registry.adapters) {
    if (!ids.has(adapter.strategyId) || seen.has(adapter.strategyId) || !['ngas-telemetry', 'weights-file'].includes(adapter.kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(adapter.version) || (adapter.kind === 'ngas-telemetry' && (adapter.strategyId !== 'ngas-all-year-beta' || adapter.version !== 'ngas-telemetry-preview-v1'))) throw new Error('Invalid portfolio target adapter.')
    seen.add(adapter.strategyId)
  }
  return registry.adapters
}

export function portfolioInputs(root, stateDirectory, strategies, telemetry, now = Date.now()) {
  const adapters = loadPortfolioAdapters(root, strategies)
  return strategies.map(strategy => {
    const adapter = adapters.find(a => a.strategyId === strategy.id)
    const unavailable = { strategyId: strategy.id, version: adapter?.version ?? 'unconfigured', generatedAt: null, expiresAt: null, weights: null, reason: 'No reviewed current target adapter. Historical evidence is retained separately.' }
    if (!adapter) return unavailable
    if (adapter.kind === 'ngas-telemetry') {
      const basket = regularJson(path.join(root, 'data/qore/market/index-basket-config.json'))
      return ngasTargetInput(telemetry, Object.fromEntries(basket.components.map(c => [c.symbol, c.targetWeight])), now)
    }
    try {
      const input = regularJson(path.join(stateDirectory, 'inputs', `${strategy.id}.json`), 64 * 1024)
      if (Object.keys(input).sort().join(',') !== 'expiresAt,generatedAt,schemaVersion,strategyId,version,weights' || input.schemaVersion !== 1 || input.strategyId !== strategy.id || input.version !== adapter.version || !targetInputReady(input, now)) return { ...unavailable, reason: 'The current target packet is stale or does not match its reviewed adapter.' }
      return { strategyId: input.strategyId, version: input.version, generatedAt: input.generatedAt, expiresAt: input.expiresAt, weights: input.weights, reason: 'Fresh target packet from the registered prospective adapter.' }
    } catch { return { ...unavailable, reason: 'The current target packet is missing or invalid.' } }
  })
}

export function portfolioSnapshot({ root, stateDirectory, strategies, telemetry = null, now = Date.now() }) {
  const saved = portfolioStore(stateDirectory, strategies).read()
  const inputs = portfolioInputs(root, stateDirectory, strategies, telemetry, now)
  return { ...saved, strategies, inputs, plan: planPortfolio(saved.config, strategies, inputs, telemetry, now), ordersEnabled: false }
}

// A fresh narrow projection protects the portfolio boundary even if an upstream DTO expands.
export function portfolioTelemetry(value) {
  if (!value) return null
  const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null
  const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null
  const boolean = v => typeof v === 'boolean' ? v : null
  const symbol = v => typeof v === 'string' && /^[A-Z][A-Z0-9.]{0,12}$/.test(v) ? v : 'UNSUPPORTED'
  const intent = value.strategy?.intent
  return {
    generatedAt: timestamp(value.generatedAt), sourceGeneratedAt: timestamp(value.sourceGeneratedAt), stale: value.stale === true,
    staleAfterSeconds: number(value.staleAfterSeconds), mode: ['paper', 'live', 'dry-run'].includes(value.mode) ? value.mode : 'unknown', brokerConnected: value.brokerConnected === true,
    account: value.account ? { equityUsd: number(value.account.equityUsd), cashUsd: number(value.account.cashUsd), dayPnlPct: number(value.account.dayPnlPct), trailingDrawdownPct: number(value.account.trailingDrawdownPct), status: value.account.status === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN', shortingEnabled: boolean(value.account.shortingEnabled) } : null,
    positions: Array.isArray(value.positions) && value.positions.length <= 128 ? value.positions.map(p => ({ symbol: symbol(p.symbol), marketValueUsd: number(p.marketValueUsd), currentPriceUsd: number(p.currentPriceUsd) })) : null,
    openOrders: Array.isArray(value.openOrders) && value.openOrders.length === 0 ? [] : [{}],
    marketClock: value.marketClock ? { isOpen: boolean(value.marketClock.isOpen), timestamp: timestamp(value.marketClock.timestamp) } : null,
    execution: value.execution ? { state: ['blocked', 'running', 'waiting'].includes(value.execution.state) ? value.execution.state : 'blocked', lastInferenceAt: timestamp(value.execution.lastInferenceAt) } : null,
    risk: value.risk ? { killSwitchEngaged: boolean(value.risk.killSwitchEngaged), blockedReasons: value.risk.blockedReasons?.length ? ['Runtime readiness gates failed.'] : [] } : null,
    strategy: { intent: intent ? { strategyId: intent.strategyId === 'ngas-all-year-beta' ? intent.strategyId : null, generatedAt: timestamp(intent.generatedAt), targetDate: typeof intent.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(intent.targetDate) ? intent.targetDate : null, gasPosition: number(intent.gasPosition), indexFraction: number(intent.indexFraction), cashFraction: number(intent.cashFraction) } : null,
      inference: value.strategy?.inference ? { strategyId: value.strategy.inference.strategyId === 'ngas-all-year-beta' ? value.strategy.inference.strategyId : null, validated: boolean(value.strategy.inference.validated), liveForecastAppliedToTarget: boolean(value.strategy.inference.liveForecastAppliedToTarget), generatedAt: timestamp(value.strategy.inference.generatedAt),
        target: value.strategy.inference.target ? { targetDate: /^\d{4}-\d{2}-\d{2}$/.test(value.strategy.inference.target.targetDate) ? value.strategy.inference.target.targetDate : null, gasPosition: number(value.strategy.inference.target.gasPosition), indexFraction: number(value.strategy.inference.target.indexFraction), cashFraction: number(value.strategy.inference.target.cashFraction) } : null } : null },
  }
}
