import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const canonicalLedgerRoot = '/Users/jamesdunkin/Documents/Local Automations/QORE/research/experiment-log'
// Research owner qualification SHA256 13d748aa67916a1f76812a8720073cec9f70eba40bf12d7d853e5d7a287a4761.
// These exact old rows refer to external groups, without an inheritable ledger parent.
const legacyExternalGroups = {
  "QORE-20261004-DISCOVERY-01-AUDITED-PREPARATION-01": {
    "parent": "QORE-strategy-program",
    "rowHash": "32844f3739719ff14ddbe7309e987f235c3e6a5b9f86938d88fef86f45a95030"
  },
  "QORE-20261004-PUBLIC-SPOT-01-REGISTERED": {
    "parent": "QORE-strategy-program",
    "rowHash": "c030d67a7ea75c78c54640deaed00cc1d0787d8aecc36e0d1ad633f9dd987363"
  },
  "QORE-20261004-TBILL-CASHFLOW-MODEL-01-REGISTERED": {
    "parent": "QORE-20261004-DISCOVERY-01",
    "rowHash": "e106acc8e3a19dacf775c8bab4b3a55418e4c4b778a27e17d0530550b812ef97"
  }
}
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
  const rows = text.split('\n'), latest = new Map(), revisions = new Map(), rowHashes = new WeakMap()
  let historyCount = 0, pendingAppend = false
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].trim()) continue
    let event
    try { event = JSON.parse(rows[i]) } catch {
      if (i === rows.length - 1 && !text.endsWith('\n')) { pendingAppend = true; continue }
      throw new Error(`Malformed experiment history at line ${i + 1}.`)
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error(`Invalid experiment contract at line ${i + 1}.`)
    rowHashes.set(event, digest(rows[i]))
    const hasRevision = Object.hasOwn(event, 'revision')
    const explicitUtc = typeof event.recorded_utc === 'string' && /(?:Z|\+00:00)$/.test(event.recorded_utc) && Number.isFinite(Date.parse(event.recorded_utc)) && new Date(event.recorded_utc).toISOString().slice(0, 10) === event.recorded_utc.slice(0, 10)
    // A study protocol is registered before inputs/results exist. Qualify this
    // envelope separately; it supplies no performance or execution evidence.
    const registeredProtocol = event.schema_version === 1 && event.record_kind === 'study'
      && /^REGISTERED(?:_|$)/.test(event.status ?? '')
      && event.full_frozen_protocol && typeof event.full_frozen_protocol === 'object' && !Array.isArray(event.full_frozen_protocol) && Object.keys(event.full_frozen_protocol).length > 0
      && (event.verified_local_bindings === undefined || Array.isArray(event.verified_local_bindings) && event.verified_local_bindings.length === 0)
      && !event.released_final_metrics && !event.released_retrospective_metrics && !event.training_validation_metrics && !event.exact_reported_metrics && !event.metrics
    const verifiedBindings = Array.isArray(event.verified_local_bindings) && event.verified_local_bindings.length > 0
    const appendOnly = !hasRevision && (event.schema_version === undefined || event.schema_version === 1) && typeof event.experiment_id === 'string' && event.experiment_id.startsWith('QORE-') && event.experiment_id.length > 5 && typeof event.status === 'string' && event.status.trim() && explicitUtc && event.allow_trading === false && (verifiedBindings || registeredProtocol)
    const revisioned = hasRevision && event.schema_version === 1 && typeof event.experiment_id === 'string' && event.experiment_id.length > 0 && Number.isInteger(event.revision) && event.revision >= 1
    if (!appendOnly && !revisioned) throw new Error(`Invalid experiment contract at line ${i + 1}.`)
    const previous = latest.get(event.experiment_id)
    if (previous && Object.hasOwn(previous, 'revision') !== hasRevision) throw new Error(`Conflicting experiment record formats for ${event.experiment_id}.`)
    const key = JSON.stringify([event.experiment_id, hasRevision ? event.revision : null]), hash = digest(JSON.stringify(event))
    if (revisions.has(key) && revisions.get(key) !== hash) throw new Error(`Conflicting duplicate ${hasRevision ? 'revision' : 'append-only record'} for ${event.experiment_id}.`)
    revisions.set(key, hash); historyCount++
    if (!previous || (hasRevision && previous.revision < event.revision)) latest.set(event.experiment_id, event)
  }
  const experiments = [...latest.values()].map(event => {
    const lineage = [], seen = new Set([event.experiment_id])
    let node = event, externalGroupId = null
    while (node) {
      lineage.push(node)
      // Explicit lineage takes priority. A study_id may be a grouping label;
      // it inherits only when that identity exists in this canonical ledger.
      const explicitParent = node.parent_id ?? node.source_inherited_from ?? node.parent_experiment_id
      if (explicitParent !== undefined && explicitParent !== null && (typeof explicitParent !== 'string' || !explicitParent)) throw new Error(`Invalid experiment parent for ${event.experiment_id}.`)
      const parentId = explicitParent ?? (node.study_id !== node.experiment_id && latest.has(node.study_id) ? node.study_id : null)
      if (!parentId) break
      const qualified = legacyExternalGroups[node.experiment_id]
      if (qualified && node.parent_id === qualified.parent && parentId === qualified.parent && rowHashes.get(node) === qualified.rowHash) {
        if (node === event) externalGroupId = qualified.parent
        break
      }
      if (seen.has(parentId)) throw new Error(`Cyclic experiment inheritance for ${event.experiment_id}.`)
      if (!latest.has(parentId)) throw new Error(`Missing experiment parent for ${event.experiment_id}.`)
      seen.add(parentId); node = latest.get(parentId)
    }
    const inherited = (...fields) => {
      for (const row of lineage) {
        for (const field of fields) if (row[field] !== undefined && row[field] !== null) return row[field]
      }
    }
    const sourceRefs = inherited('source_refs', 'verified_local_bindings') ?? []
    if (!Array.isArray(sourceRefs)) throw new Error(`Invalid experiment sources for ${event.experiment_id}.`)
    return { id: event.experiment_id, title: readable(event.title ?? event.name ?? event.experiment_id), kind: event.record_kind ?? 'research_event', status: event.status ?? 'unknown', revision: event.revision ?? null, recordFormat: Object.hasOwn(event, 'revision') ? 'revisioned' : 'append-only', studyGroup: typeof event.study_id === 'string' ? safe(event.study_id) : null, externalGroupId, parentId: lineage[1]?.experiment_id ?? null,
      theory: readable(event.rule_theory ?? event.rule ?? event.outcome_summary ?? ''), retry: readable(inherited('retry_conditions', 'retry_condition', 'retry') ?? 'No retry condition recorded.'),
      protocol: readable(inherited('full_frozen_protocol', 'frozen_protocol', 'protocol') ?? 'No full protocol supplied.'),
      metrics: readable({ training_validation: event.training_validation_metrics ?? null, released_final: event.released_final_metrics ?? null, released_retrospective: event.released_retrospective_metrics ?? null, reported: event.exact_reported_metrics ?? event.metrics ?? null, outcome: event.outcome_summary ?? null, exposure: inherited('exposure') ?? null, audit: inherited('audit', 'audit_gaps') ?? null }),
      sources: sourceRefs.slice(0, 300).filter(ref => ref && typeof ref === 'object').map(ref => ({ name: path.basename(String(ref.path ?? ref.name ?? 'source')), sha256: /^[a-f0-9]{64}$/i.test(ref.sha256 ?? '') ? ref.sha256 : 'unverified' })), inheritedFrom: lineage.slice(1).map(row => row.experiment_id),
    }
  })
  return { status: pendingAppend ? 'append-in-progress' : 'available', experiments, historyCount, pendingAppend, hash: digest(text), importedAt: new Date().toISOString() }
}
