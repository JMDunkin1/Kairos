import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseReplayCSV } from './qore-hub-replay.mjs'

const root = fileURLToPath(new URL('../../assets/offline-paper', import.meta.url))
const manifestHash = '5b9f5987e41c10b3931511a1d32b8d3210807c7f27267aec9e6461d28cb96a88'
export const paperIds = ['rv_xle_brent_residual', 'rv_ief_barbell_residual', 'BTC_PRIOR_CALENDAR_MONTH_LOSS_TO_CASH_01']
const names = ['Energy residual rotation', 'Treasury curve residual rotation', 'BTC monthly loss to cash']
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const require = (ok, message) => { if (!ok) throw new Error(`Offline paper evidence unavailable: ${message}`) }
const evidenceFiles = ['compact-definitions.json', 'relationship-contract.json', 'btc-contract.json', 'relationship-fidelity-audit.json', 'btc-fidelity-audit.json', 'relationship-window.json', 'relationship-observer.json', 'start-rationale.json', 'index-review.json', 'export-review.json', 'post-append-review.json', 'tested-ledger.json', 'btc-result-summary.json']

export function loadPaperBundle(directory = root) {
  // Only packaged files are read. Absolute provenance paths are never followed;
  // no Python, strategy engine, original market source or account is opened.
  const read = name => {
    require(typeof name === 'string' && !path.isAbsolute(name) && name.split('/').every(part => part && !part.startsWith('.') && !part.includes('\\')), 'unsafe bundle name')
    let current = directory
    for (const part of [null, ...name.split('/')]) {
      if (part) current = path.join(current, part)
      const stat = fs.lstatSync(current)
      require(!stat.isSymbolicLink(), 'symlink in bundle path')
    }
    const stat = fs.statSync(current)
    require(stat.isFile() && stat.size <= 24 * 1024 * 1024, 'nonregular or unbounded bundle file')
    return fs.readFileSync(current)
  }
  const manifestBytes = read('MANIFEST.json')
  require(sha(manifestBytes) === manifestHash, 'manifest changed')
  const manifest = JSON.parse(manifestBytes)
  require(manifest.schema === 'qore-hub.offline-paper-bundle.v1' && manifest.financial_engines_executed === false && manifest.orders_enabled === false && manifest.actual_owned_state === null, 'scope changed')
  const bytes = {}
  for (const [name, binding] of Object.entries(manifest.files)) {
    const content = read(name)
    require(content.length === binding.bytes && sha(content) === binding.sha256, `binding changed: ${name}`)
    bytes[name] = content
  }
  const json = name => JSON.parse(bytes[name])
  const index = json('index.json'), admission = json('index-admission.json'), review = json('index-review.json'), catalogue = json('catalogue.json')
  require(sha(bytes['index.json']) === '3611ce0a75b007f005d5cf1ae5c0a2181a52a063498941639c15495be2b9b1ec' && admission.index.sha256 === manifest.reviewed_index_sha256, 'reviewed index')
  require(review.status.startsWith('PASS') && admission.index_core_sha256 === review.index_core_sha256 && json('export-review.json').status.startsWith('PASS') && json('post-append-review.json').status.startsWith('PASS'), 'independent closure')
  require(catalogue.records.length === 5 && new Set(catalogue.records.map(r => r.id)).size === 5 && catalogue.new_strategy_count === 0 && catalogue.new_validation_count === 0 && catalogue.orders_enabled === false, 'stable catalogue')
  require(index.permissions.orders === false && index.permissions.network === false && index.permissions.actual_paper_account === false && index.permissions.runtime_changes === false, 'index activation scope')
  const definitions = json('compact-definitions.json').definitions.records
  const candidates = paperIds.map((id, i) => {
    const record = catalogue.records.find(r => r.id === id), definition = definitions.find(r => r.id === id)
    require(record?.role === 'PAPER_EVALUATION_CANDIDATE' && record.actual_paper_account === false && record.runtime_enabled === false && definition?.orders_enabled === false, 'paper identity')
    return { ...record, name: names[i], definition, actualOwnedState: null, actualFutureObservations: 0, observedAccountPerformance: false,
      sourceStatus: 'Qualified prospective inputs absent; window unstarted.', replayStatus: id.startsWith('rv_') ? '690 retained familiar sessions · primary 5bp reference wallet' : '1,096 retained familiar days · 14 funded account/cost paths',
      futureLaunchEnabled: false, futureInputRequirements: id.startsWith('rv_') ? json('start-rationale.json').actual_constraints : ['Original lawful spot daily packets with observation, available and recorded clocks.', 'Complete November 2026 calendar month and quote-volume capacity history.', 'December 3, 2026 00:00–00:05 UTC first reference and model invocation; no backdated fills.'],
      prospective: id.startsWith('rv_') ? { first: '2026-11-02T21:00:00Z', review: '2027-02-02', last: '2027-11-02', sessions: 252, implementationReviewSessions: 63 } : { first: '2026-12-03T00:00:00Z', last: '2027-11-03T00:00:00Z', terminalMark: '2027-11-30', decisions: 12 } }
  })
  return { directory, manifest, bytes, json, candidates, rationale: json('start-rationale.json'), evidenceFiles }
}

export function paperCatalogue(bundle = loadPaperBundle()) {
  return browserValue({ status: 'reviewed-offline-paper-evidence', identities: 5, retainedResearchCandidates: 1, retainedBaselines: 1, paperCandidates: 3, newValidatedStrategies: 0, liveReadyPortfolios: 0,
    candidates: bundle.candidates, startRationale: bundle.rationale, evidence: bundle.evidenceFiles.map(id => ({ id, sha256: bundle.manifest.files[evidencePath(id)].sha256 })),
    reviewedIndexSha256: bundle.manifest.reviewed_index_sha256, actualOwnedState: null, actualFutureObservations: 0, ordersEnabled: false, futureLaunchEnabled: false })
}

const numeric = (value, name) => { require(value !== '' && Number.isFinite(Number(value)), `invalid retained ${name}`); return Number(value) }
export function savedPaperReplay(id, caseId, bundle = loadPaperBundle()) {
  require(paperIds.includes(id), 'unknown paper identity')
  const candidate = bundle.candidates.find(c => c.id === id)
  let frames, cases, selectedCase
  if (id.startsWith('rv_')) {
    cases = [{ id: 'primary-5bp', name: 'Primary 5bp total-NAV reference wallet' }]
    selectedCase = caseId ?? cases[0].id
    require(selectedCase === cases[0].id, 'only primary 5bp state was released here')
    const rows = bundle.json(`states/${id}.json`)
    frames = rows.filter(row => row.date >= '2024-01-02' && row.modeled_owned_state !== null).map(row => {
      require(row.rule_id === id && row.stage === 'familiar_replay' && row.contract_sha256 === candidate.contract.sha256 && row.nominal_exchange_fill_claim === false, 'saved relationship scope')
      const state = row.modeled_owned_state
      return { date: row.date, mode: 'familiar_replay', wealth: state.wealth_reference_usd, cash: state.spendable_cash_reference_usd, units: state.funded_nav_unit_balances, unit: 'USD total-NAV reference', event: row.signal_event,
        referenceTarget: row.execution_target_at_this_reference, nextTarget: row.desired_target_for_next_observed_nav, decisionKnownAt: row.known_at_utc, pending: row.pending_execution, fees: state.fees_reference_usd, terminal: state.terminal_liquidation, actualAccount: false }
    })
    require(frames.length === 690 && frames[0].date === '2024-01-02' && frames.at(-1).date === '2026-10-01' && frames.at(-1).terminal && Object.values(frames.at(-1).units).every(v => v === 0), 'retained relationship calendar/terminal')
  } else {
    const rows = parseReplayCSV(bundle.bytes['btc/daily.csv'].toString())
    const accounts = ['strategy', 'btc_buyhold', 'monthly_50_cash', 'cash', 'portfolio_strategy', 'portfolio_mix', 'portfolio_cash']
    cases = ['primary', 'double'].flatMap(scenario => accounts.map(account => ({ id: `${scenario}:${account}`, name: `${scenario === 'primary' ? '10bp fee / 20bp impact' : '10bp fee / 40bp impact'} · ${account.replaceAll('_', ' ')}` })))
    selectedCase = caseId ?? 'primary:strategy'
    require(cases.some(c => c.id === selectedCase), 'unknown retained BTC account/cost path')
    const [scenario, account] = selectedCase.split(':')
    frames = rows.filter(row => row.scenario === scenario && row.account === account).map(row => ({ date: row.date, mode: 'familiar_replay', wealth: numeric(row.nav_usdt, 'NAV'), cash: numeric(row.cash_usdt, 'cash'), units: { BTC: row.btc_units, ETH: row.eth_units }, unit: 'USDT', event: 'Retained daily mark', fees: numeric(row.cumulative_fees_usdt, 'cumulative fees'), impact: numeric(row.cumulative_impact_usdt, 'cumulative impact'), feesCumulative: true, terminal: false, actualAccount: false,
      exactBalances: { nav: row.nav_usdt, cash: row.cash_usdt, BTC: row.btc_units, ETH: row.eth_units } }))
    require(frames.length === 1096 && frames[0].date === '2019-01-01' && frames.at(-1).date === '2021-12-31', 'retained BTC calendar')
  }
  require(frames.every((row, i) => Number.isFinite(row.wealth) && Number.isFinite(row.cash) && (!i || row.date > frames[i - 1].date)), 'nonfinite/unordered saved state')
  return browserValue({ id, name: candidate.name, mode: 'familiar_replay', status: 'saved-output-playback-only', frames, cases, selectedCase, actualOwnedState: null, actualFutureObservations: 0, ordersEnabled: false, observedAccountPerformance: false, financialEngineRerun: false,
    limitations: candidate.source_clock_limitations, note: 'Playback reads completed, independently audited output. It creates no trial, recalculates no targets and supplies no new validation. Displayed historical inventory is modeled reference ownership; actual current ownership remains null.' })
}

export function paperEvidence(id, bundle = loadPaperBundle()) {
  require(bundle.evidenceFiles.includes(id), 'unknown evidence document')
  const filename = evidencePath(id)
  return browserValue({ id, sha256: bundle.manifest.files[filename].sha256, mode: 'reviewed_research_provenance', actualAccount: false, document: bundle.json(filename) })
}

function browserValue(value, depth = 0) {
  if (depth > 12) return '[Nested provenance truncated]'
  if (Array.isArray(value)) return value.slice(0, 4096).map(item => browserValue(item, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 1024).filter(([key]) => !['path', 'source_path', 'absolute_path', 'absolute_source_path'].includes(key) && !/password|secret|credential|api.?key|access.?token|account.?id/i.test(key) && !key.includes('/Users/')).map(([key, item]) => [key, browserValue(item, depth + 1)]))
  if (typeof value === 'string' && value.includes('/Users/')) return '[Local provenance path withheld from browser]'
  return value
}

export function paperReadResponse(url, bundle) {
  if (url.pathname === '/api/hub/paper-candidates') return { status: 200, body: paperCatalogue(bundle) }
  const replay = url.pathname.match(/^\/api\/hub\/paper-candidates\/([A-Za-z0-9_-]+)\/replay$/)
  if (replay) return { status: 200, body: savedPaperReplay(replay[1], url.searchParams.get('case') ?? undefined, bundle) }
  const evidence = url.pathname.match(/^\/api\/hub\/paper-evidence\/([a-z-]+\.json)$/)
  if (evidence) return { status: 200, body: paperEvidence(evidence[1], bundle) }
  return null
}

function evidencePath(id) { return id === 'btc-result-summary.json' ? 'btc/summary.json' : id }
