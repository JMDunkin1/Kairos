import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const approvedHash = 'd5d76309adb225e172b339f1021b313575dfa34a11f3674205d11bc15d978dd0'
const root = fileURLToPath(new URL('../../assets/released-replay', import.meta.url))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const require = (condition, message) => { if (!condition) throw new Error(`Historical replay unavailable: ${message}`) }
export function parseReplayCSV(text) {
  const rows = [], fields = []
  let field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && (char === ',' || char === '\n')) {
      fields.push(field.replace(/\r$/, '')); field = ''
      if (char === '\n') { rows.push([...fields]); fields.length = 0 }
    } else field += char
  }
  require(!quoted, 'incomplete CSV quote')
  if (field || fields.length) { fields.push(field.replace(/\r$/, '')); rows.push([...fields]) }
  const header = rows.shift()
  require(header?.length && new Set(header).size === header.length, 'invalid CSV header')
  return rows.filter(row => row.some(Boolean)).map(row => { require(row.length === header.length, 'invalid CSV row width'); return Object.fromEntries(header.map((key, i) => [key, row[i]])) })
}

export function loadHistoricalReplay(directory = root) {
  // Only this self-contained, approved export is read. Provenance paths are
  // descriptive strings, never followed, and the frozen Python is not executed.
  const read = relative => {
    require(!path.isAbsolute(relative) && !relative.split('/').some(part => part === '..' || part.startsWith('.')), 'unsafe manifest path')
    const filename = path.join(directory, relative), stat = fs.lstatSync(filename)
    require(stat.isFile() && !stat.isSymbolicLink(), 'non-regular export file')
    return fs.readFileSync(filename)
  }
  const approvalBytes = read('RELEASED_REPLAY_APPROVAL.json')
  require(sha(approvalBytes) === approvedHash, 'approval changed')
  const approval = JSON.parse(approvalBytes)
  require(approval.status === 'APPROVED_READ_ONLY_HISTORICAL_REPLAY' && approval.permission.read_export_files === true && approval.permission.read_provenance_source_paths === false, 'missing read-only approval')
  for (const [filename, hash] of Object.entries(approval.approved_bindings)) require(sha(read(filename)) === hash, `approval binding ${filename}`)
  const manifest = JSON.parse(read('MANIFEST.json'))
  for (const [filename, metadata] of Object.entries(manifest.files)) {
    const bytes = read(filename)
    require(bytes.length === metadata.bytes && sha(bytes) === metadata.sha256, `manifest binding ${filename}`)
  }
  const contract = JSON.parse(read('contract.json')), audit = JSON.parse(read('HANDOFF_AUDIT.json'))
  require(contract.schema === 'qore-hub.released-nav-research-replay.v1' && audit.status === 'PASS_RELEASED_HISTORICAL_REPLAY_ONLY', 'contract or independent audit')
  require(contract.permissions.orders_authorized === false && contract.permissions.live_enabled === false && contract.permissions.paper_execution_enabled === false, 'execution scope')
  const rows = parseReplayCSV(read('daily_nav_replay.csv').toString()), targets = parseReplayCSV(read('targets_and_execution.csv').toString()), metrics = parseReplayCSV(read('metrics_reproduction.csv').toString())
  const rules = JSON.parse(read('rules.json'))
  require(rules.length === 2 && rows.length === 1380 && targets.length === 1380 && metrics.length === 2, 'released counts')
  const number = (row, key) => { const value = Number(row[key]); require(row[key] !== '' && Number.isFinite(value), `invalid ${key}`); return value }
  const definitions = rules.map(rule => {
    const daily = rows.filter(row => row.rule_id === rule.id), plans = targets.filter(row => row.rule_id === rule.id), metric = metrics.find(row => row.rule_id === rule.id)
    require(daily.length === 690 && plans.length === 690 && metric, `definition ${rule.id}`)
    require(daily[0].date === '2024-01-02' && daily.at(-1).date === '2026-10-01', 'released dates')
    const points = daily.map((row, i) => {
      require(number(row, 'session') === i + 1 && (!i || row.date > daily[i - 1].date) && row.latest_completed_signal_date < row.date && row.date === plans[i].execution_date, 'causal session ordering')
      const holdings = Object.fromEntries(contract.source_universe.map(symbol => [symbol, number(row, `posttrade_${symbol}_dollars`)]))
      const cash = number(row, 'cash_end'), equity = number(row, 'equity_end'), fees = number(row, 'fee_dollars')
      require(Math.abs(cash + Object.values(holdings).reduce((a, b) => a + b, 0) - equity) < 1e-6 && cash >= -1e-7, 'cash/holdings reconciliation')
      return { date: row.date, equity, returnPct: (equity / contract.funding.capital_dollars - 1) * 100, drawdownPct: number(row, 'drawdown') * 100, cash, fees, holdings,
        signalDate: row.latest_completed_signal_date, traded: row.allocation_trade_executed === 'True', terminal: row.terminal_liquidation === 'True',
        observationTargets: Object.fromEntries(contract.source_universe.map(symbol => [symbol, number(plans[i], `observation_target_${symbol}`)])),
        executionTargets: Object.fromEntries(contract.source_universe.map(symbol => [symbol, number(plans[i], `execution_target_${symbol}`)])) }
    })
    require(points.at(-1).terminal && Object.values(points.at(-1).holdings).every(value => value === 0), 'terminal liquidation')
    return { id: rule.id, name: rule.static_control ? '50% TQQQ / 50% QQQ exposure baseline' : 'Relative leverage sleeves · research candidate', classification: rule.classification,
      description: rule.description, baseline: rule.static_control, capital: contract.funding.capital_dollars, points,
      metrics: { returnPct: number(metric, 'net_return') * 100, cagrPct: number(metric, 'cagr') * 100, drawdownPct: number(metric, 'max_drawdown') * 100, fees: number(metric, 'fees_dollars'), exposure: number(metric, 'mean_contract_equity_exposure_proxy'), sharpe: number(metric, 'sharpe') } }
  })
  return { status: 'approved-historical-replay', classification: contract.classification, first: '2024-01-02', last: '2026-10-01', sessions: 690, independentMechanisms: 1,
    auditUtc: audit.audited_utc, approvalUtc: approval.approved_utc, definitions,
    hashes: { approval: approvedHash, ...approval.approved_bindings, daily: manifest.files['daily_nav_replay.csv'].sha256 },
    limitations: [...audit.limitations, 'Current source vintages, previously exposed regimes and survivor availability; no prospective blindness.', 'Captured-cash completeness gaps: TQQQ 2016/17, UPRO 2017, QLD 2021.', 'Funded $100,000 fractional NAV units; $2,000 whole-share feasibility is unverified.', 'Leveraged funds reset daily; contract exposure is a proxy, not realized beta.', 'No new trials or retuning; no future feed, broker, actual PAPER return or order endpoint.'] }
}
