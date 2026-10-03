import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const runName = /^run-[a-f0-9-]{36}\.json$/
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const numbers = (value, keys) => object(value) && keys.every(key => Number.isFinite(value[key]))
const strings = (value, keys) => object(value) && keys.every(key => typeof value[key] === 'string')
const numberMap = value => object(value) && Object.values(value).every(Number.isFinite)
function completeRecord(record) {
  const r = record.result, request = record.request
  return strings(record, ['dataHash', 'codeHash', 'requestHash', 'engineVersion', 'codeRevision']) && strings(r, ['partition']) && numbers(r.summary, ['nav', 'contributed', 'pnl', 'twrPct', 'drawdownPct', 'reconciliationError', 'income', 'fees', 'slippage', 'borrow'])
    && strings(request, ['partition']) && Array.isArray(request.definitions) && request.definitions.every(d => strings(d, ['id', 'name', 'kind', 'status']) && Array.isArray(d.instruments) && d.instruments.every(id => typeof id === 'string') && Number.isFinite(d.allocation) && numbers(d.parameters, ['lookback', 'threshold', 'exposure']))
    && numbers(request.assumptions, ['lagSessions', 'feeBps', 'slippageBps', 'borrowAprPct', 'maxAgeDays']) && Number.isFinite(request.capital) && Array.isArray(request.flows) && request.flows.every(f => strings(f, ['date', 'sleeveId']) && Number.isFinite(f.amount))
    && numbers(r.assumptions, ['lagSessions', 'feeBps', 'slippageBps', 'borrowAprPct', 'maxAgeDays']) && numberMap(r.positions)
    && Array.isArray(r.points) && r.points.length > 0 && r.points.every(p => strings(p, ['date']) && numbers(p, ['nav', 'cash', 'contributed', 'pnl', 'twrPct', 'drawdownPct', 'flow', 'reconciliationError']) && numberMap(p.sleeves))
    && Array.isArray(r.sleeves) && r.sleeves.every(s => strings(s, ['id', 'name']) && numbers(s, ['nav', 'cash', 'contributed', 'pnl', 'twrPct', 'fees', 'slippage', 'borrow', 'income']) && numberMap(s.positions))
    && Array.isArray(r.traces) && r.traces.every(t => strings(t, ['date', 'sleeveId', 'asOf', 'status', 'reason']) && numbers(t, ['nav', 'cash']) && numberMap(t.weights) && numberMap(t.positions))
    && Array.isArray(r.fills) && r.fills.every(f => strings(f, ['date', 'instrument']) && numbers(f, ['quantity', 'fillPrice', 'internalCrossQuantity', 'fee', 'slippage']))
}
function existing(filename) { try { return fs.lstatSync(filename) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
function resolvedLocation(filename) {
  let ancestor = path.resolve(filename)
  const tail = []
  while (!existing(ancestor)) { tail.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor) }
  return path.join(fs.realpathSync(ancestor), ...tail)
}
function regular(filename) {
  const stat = existing(filename)
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`Migration requires a regular file: ${path.basename(filename)}`)
  return stat
}
function directory(filename) {
  const stat = existing(filename)
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Migration requires a real directory: ${filename}`)
  return stat
}

// Both migration and new trials use this lock. A crash leaves an explicit busy
// receipt rather than guessing whether another process still owns user data.
export function withHubStateLock(root, operation) {
  directory(root)
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const lock = path.join(root, '.hub-write.lock')
  let fd
  try { fd = fs.openSync(lock, 'wx', 0o600) } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Run storage is locked by another operation. Quit other QORE windows; a lock left by an interrupted process needs manual inspection.')
    throw error
  }
  try { return operation() } finally { fs.closeSync(fd); fs.unlinkSync(lock) }
}

function events(filename) {
  if (!regular(filename)) return { bytes: Buffer.alloc(0), rows: [] }
  const bytes = fs.readFileSync(filename), text = bytes.toString('utf8')
  if (text && !text.endsWith('\n')) throw new Error(`Incomplete registry: ${filename}`)
  const rows = text.split('\n').filter(line => line.trim()).map(line => {
    const record = JSON.parse(line)
    if (!record || typeof record.id !== 'string' || !/^run-[a-f0-9-]{36}$/.test(record.id) || typeof record.event !== 'string') throw new Error(`Invalid registry event: ${filename}`)
    return { key: `${record.id}/${record.event}`, value: canonical(record), line }
  })
  return { bytes, rows }
}

function publish(filename, bytes, replace = false) {
  const temporary = path.join(path.dirname(filename), `.migration-${crypto.randomUUID()}.tmp`)
  let fd
  try {
    fd = fs.openSync(temporary, 'wx', replace ? 0o600 : 0o400)
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    if (replace) fs.renameSync(temporary, filename)
    else fs.linkSync(temporary, filename)
  } finally { if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, { force: true }) }
}

export function migrateLegacyHubState({ sourceRoot, destinationRoot }) {
  const receipt = { sourceRoot: sourceRoot ?? null, destinationRoot, status: 'not-needed', importedRuns: 0, importedEvents: 0, conflicts: [], originalsPreserved: true }
  try {
    if (!sourceRoot || !directory(sourceRoot)) return receipt
    const sourcePath = fs.realpathSync(sourceRoot), destinationPath = resolvedLocation(destinationRoot)
    if (sourcePath === destinationPath || sourcePath.startsWith(destinationPath + path.sep) || destinationPath.startsWith(sourcePath + path.sep)) throw new Error('Legacy source and destination must be separate directories.')
    const sourceRuns = path.join(sourceRoot, 'runs')
    const names = directory(sourceRuns) ? fs.readdirSync(sourceRuns).filter(name => runName.test(name)).sort() : []
    const sourceRegistry = events(path.join(sourceRoot, 'experiments.jsonl'))
    if (!names.length && !sourceRegistry.rows.length) { receipt.status = 'empty'; return receipt }
    return withHubStateLock(destinationRoot, () => {
      const destinationRuns = path.join(destinationRoot, 'runs')
      directory(destinationRuns)
      const destinationRegistryPath = path.join(destinationRoot, 'experiments.jsonl')
      const destinationRegistry = events(destinationRegistryPath)
      const additions = [], seen = new Map()
      for (const event of [...destinationRegistry.rows, ...sourceRegistry.rows]) {
        const prior = seen.get(event.key)
        if (prior && prior !== event.value) receipt.conflicts.push(`Registry event ${event.key}`)
        else if (!prior) { seen.set(event.key, event.value); if (!destinationRegistry.rows.includes(event)) additions.push(event.line) }
      }
      const copies = []
      for (const name of names) {
        const source = path.join(sourceRuns, name), destination = path.join(destinationRuns, name)
        regular(source)
        const bytes = fs.readFileSync(source), record = JSON.parse(bytes)
        if (record?.id !== name.slice(0, -5) || typeof record.createdAt !== 'string' || !['completed', 'blocked'].includes(record.status)) throw new Error(`Invalid legacy run: ${name}`)
        if ((record.request?.partition != null && typeof record.request.partition !== 'string') || (record.error != null && typeof record.error !== 'string')) throw new Error(`Invalid legacy display fields: ${name}`)
        if ((record.status === 'completed' && !completeRecord(record)) || (record.status === 'blocked' && record.result != null)) throw new Error(`Incomplete legacy result: ${name}`)
        if (regular(destination)) { if (sha(fs.readFileSync(destination)) !== sha(bytes)) receipt.conflicts.push(`Run ${name}`) }
        else copies.push({ destination, bytes })
      }
      if (receipt.conflicts.length) { receipt.status = 'conflict'; return receipt }
      fs.mkdirSync(destinationRuns, { recursive: true, mode: 0o700 })
      for (const { destination, bytes } of copies) { publish(destination, bytes); receipt.importedRuns++ }
      if (additions.length) {
        // Preserve every existing byte as a prefix. Publication is atomic and
        // the shared writer lock prevents replacing a concurrently added trial.
        publish(destinationRegistryPath, Buffer.concat([destinationRegistry.bytes, Buffer.from(additions.join('\n') + '\n')]), true)
        receipt.importedEvents = additions.length
      }
      receipt.status = receipt.importedRuns || receipt.importedEvents ? 'migrated' : 'up-to-date'
      return receipt
    })
  } catch (error) { receipt.status = 'attention'; receipt.error = error.message; return receipt }
}
