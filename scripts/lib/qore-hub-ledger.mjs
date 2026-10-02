import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const canonicalLedgerRoot = '/Users/jamesdunkin/Documents/Local Automations/QORE/research/experiment-log'
const digest = text => crypto.createHash('sha256').update(text).digest('hex')
function safe(value, depth = 0) {
  if (depth > 12) return '[nested]'
  if (typeof value === 'string') return value.replace(/\/(?:Users|srv|tmp)\/[^\s";,]+/g, matched => path.basename(matched)).slice(0, 12000)
  if (Array.isArray(value)) return value.slice(0, 300).map(v => safe(v, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|credential|api.?key|access.?token|email|account.?id/i.test(key)).map(([key, v]) => [key, safe(v, depth + 1)]))
  return value
}
const readable = value => typeof value === 'string' ? safe(value) : JSON.stringify(safe(value ?? null), null, 2)
export function readExperimentLedger(root = canonicalLedgerRoot) {
  const filename = path.join(root, 'experiments.jsonl')
  if (!fs.existsSync(filename)) return { status: 'unavailable', error: 'Canonical experiment ledger is not available on this Mac.', experiments: [], historyCount: 0, pendingAppend: false, hash: null, importedAt: new Date().toISOString() }
  const stat = fs.statSync(filename)
  if (stat.size > 32 * 1024 * 1024) throw new Error('Experiment log exceeds this reader’s 32 MB limit.')
  const text = fs.readFileSync(filename, 'utf8')
  const rows = text.split('\n'), latest = new Map(), revisions = new Map()
  let historyCount = 0, pendingAppend = false
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].trim()) continue
    let event
    try { event = JSON.parse(rows[i]) } catch {
      if (i === rows.length - 1 && !text.endsWith('\n')) { pendingAppend = true; continue }
      throw new Error(`Malformed experiment history at line ${i + 1}.`)
    }
    if (event.schema_version !== 1 || typeof event.experiment_id !== 'string' || !Number.isInteger(event.revision) || event.revision < 1) throw new Error(`Invalid experiment contract at line ${i + 1}.`)
    const key = `${event.experiment_id}:${event.revision}`, hash = digest(JSON.stringify(event))
    if (revisions.has(key) && revisions.get(key) !== hash) throw new Error(`Conflicting duplicate revision for ${event.experiment_id}.`)
    revisions.set(key, hash); historyCount++
    if (!latest.has(event.experiment_id) || latest.get(event.experiment_id).revision < event.revision) latest.set(event.experiment_id, event)
  }
  const experiments = [...latest.values()].map(event => {
    const lineage = [], seen = new Set([event.experiment_id])
    let node = event
    while (node) {
      lineage.push(node)
      const parentId = node.parent_id ?? node.source_inherited_from ?? (node.study_id !== node.experiment_id ? node.study_id : null) ?? node.parent_experiment_id
      if (!parentId) break
      if (seen.has(parentId)) throw new Error(`Cyclic experiment inheritance for ${event.experiment_id}.`)
      if (!latest.has(parentId)) throw new Error(`Missing experiment parent for ${event.experiment_id}.`)
      seen.add(parentId); node = latest.get(parentId)
    }
    const inherited = (...fields) => {
      for (const row of lineage) {
        for (const field of fields) if (row[field] !== undefined && row[field] !== null) return row[field]
      }
    }
    const sourceRefs = inherited('source_refs') ?? []
    return { id: event.experiment_id, title: readable(event.title ?? event.name ?? event.experiment_id), kind: event.record_kind, status: event.status ?? 'unknown', revision: event.revision, parentId: lineage[1]?.experiment_id ?? null,
      theory: readable(event.rule_theory ?? event.rule ?? event.outcome_summary ?? ''), retry: readable(inherited('retry_conditions', 'retry_condition', 'retry') ?? 'No retry condition recorded.'),
      protocol: readable(inherited('full_frozen_protocol', 'frozen_protocol', 'protocol') ?? 'No full protocol supplied.'),
      metrics: readable({ training_validation: event.training_validation_metrics ?? null, released_final: event.released_final_metrics ?? null, reported: event.exact_reported_metrics ?? null, outcome: event.outcome_summary ?? null, exposure: inherited('exposure') ?? null, audit: inherited('audit', 'audit_gaps') ?? null }),
      sources: sourceRefs.map(ref => ({ name: path.basename(String(ref.path ?? ref.name ?? 'source')), sha256: /^[a-f0-9]{64}$/i.test(ref.sha256 ?? '') ? ref.sha256 : 'unverified' })), inheritedFrom: lineage.slice(1).map(row => row.experiment_id),
    }
  })
  return { status: pendingAppend ? 'append-in-progress' : 'available', experiments, historyCount, pendingAppend, hash: digest(text), importedAt: new Date().toISOString() }
}
