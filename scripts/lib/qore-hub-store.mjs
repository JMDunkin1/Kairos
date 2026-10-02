import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { simulate, engineVersion } from '../../src/hub/simulation.ts'
import { fixtureAdapter } from '../../src/hub/fixture.ts'

export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const hasNumbers = (value, fields) => isObject(value) && fields.every(field => isNumber(value[field]))
// Check editable field types before freezing; simulation still records semantic failures as blocked trials.
const validEnvelope = request => isObject(request)
  && Array.isArray(request.definitions)
  && request.definitions.every(d => isObject(d) && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.kind === 'string' && typeof d.status === 'string' && isNumber(d.allocation) && Array.isArray(d.instruments) && d.instruments.every(id => typeof id === 'string') && hasNumbers(d.parameters, ['lookback', 'threshold', 'exposure']))
  && hasNumbers(request.assumptions, ['feeBps', 'slippageBps', 'borrowAprPct', 'lagSessions', 'maxAgeDays'])
  && Array.isArray(request.flows)
  && request.flows.every(flow => isObject(flow) && typeof flow.date === 'string' && typeof flow.sleeveId === 'string' && isNumber(flow.amount))
  && typeof request.partition === 'string' && isNumber(request.capital)
const codeFiles = ['src/hub/types.ts', 'src/hub/simulation.ts', 'src/hub/fixture.ts', 'src/hub/strategies.ts', 'scripts/lib/qore-hub-store.mjs']
export function createRunStore(root, repoRoot, codeRevision = 'local-candidate', feedAdapter = fixtureAdapter) {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true, mode: 0o700 })
  const registry = path.join(root, 'experiments.jsonl')
  const append = event => { const fd = fs.openSync(registry, 'a', 0o600); try { fs.writeSync(fd, JSON.stringify(event) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) } }
  const persist = record => {
    const file = path.join(root, 'runs', record.id + '.json')
    const temporary = path.join(root, 'runs', `.${record.id}-${crypto.randomUUID()}.tmp`)
    let fd
    try {
      fd = fs.openSync(temporary, 'wx', 0o400)
      fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd)
      fs.closeSync(fd); fd = undefined
      // Publish the complete result atomically without replacing an immutable run.
      fs.linkSync(temporary, file)
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
      fs.rmSync(temporary, { force: true })
    }
  }
  const codeHash = hash(codeFiles.map(name => [name, hash(fs.readFileSync(path.join(repoRoot, name), 'utf8'))]))
  const get = id => {
    if (!/^run-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid run ID.')
    return JSON.parse(fs.readFileSync(path.join(root, 'runs', id + '.json'), 'utf8'))
  }
  return {
    get,
    list: () => fs.readdirSync(path.join(root, 'runs')).filter(name => /^run-[a-f0-9-]{36}\.json$/.test(name)).map(name => get(name.slice(0, -5))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ result, ...record }) => ({ ...record, summary: result?.summary ?? null })).slice(0, 200),
    run: (request, parentRunId = null) => {
      if (!validEnvelope(request)) throw new Error('Invalid run request envelope.')
      if (parentRunId) get(parentRunId)
      if (feedAdapter.status !== 'available') throw new Error('Data feed is unconfigured or unsupported.')
      const feed = feedAdapter.load()
      const record = { id: 'run-' + crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'registered', request: structuredClone(request), requestHash: hash(request), dataHash: hash(feed), codeHash, codeRevision, parentRunId, engineVersion }
      // Freeze the protocol before outcomes; blocked and negative trials remain in history.
      append({ ...record, event: 'frozen_protocol' })
      try { record.result = simulate(request, feed); record.status = 'completed' } catch (error) { record.status = 'blocked'; record.error = error.message.slice(0, 400) }
      persist(record)
      append({ id: record.id, event: 'outcome', status: record.status, error: record.error ?? null, summary: record.result?.summary ?? null })
      return record
    },
  }
}

export function weeklyReport(record) {
  if (record.status !== 'completed') throw new Error('A completed simulation is required for a report.')
  const result = record.result, groups = new Map()
  for (const point of result.points) {
    const date = new Date(point.date + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    const week = date.toISOString().slice(0, 10)
    if (!groups.has(week)) groups.set(week, [])
    groups.get(week).push(point)
  }
  let openingPnl = 0, openingWealth = 1
  const weeks = [...groups.entries()].map(([week, points]) => {
    const end = points.at(-1), wealth = 1 + end.twrPct / 100
    const fees = result.fills.filter(f => points.some(p => p.date === f.date)).reduce((n, f) => n + f.fee + f.slippage, 0)
    const row = { week, endDate: end.date, nav: end.nav, netPnl: end.pnl - openingPnl, netExternalFlows: points.reduce((n, p) => n + p.flow, 0), returnPct: (wealth / openingWealth - 1) * 100, executionCosts: fees, sleeveNav: end.sleeves }
    openingPnl = end.pnl; openingWealth = wealth
    return row
  })
  return { mode: result.mode, label: 'Synthetic paper simulation; no broker account or delivery scheduler connected.', runId: record.id, requestHash: record.requestHash, dataHash: record.dataHash, codeHash: record.codeHash, weeks }
}
