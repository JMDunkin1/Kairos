import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { executableLiveComponentContractDigestSha256 } from './qore-live-contract.mjs'
import { loadReviewedBrokerExecutionProfile } from './qore-broker-execution-profile.mjs'
import { loadAllYearStrategyArtifact, strategyArtifactBindingBlocks } from './qore-live-strategy-artifact.mjs'

export const PAPER_EXECUTION_POLICY = 'qore-paper-current-strategy-v1'

// Paper measures the executable strategy prospectively. Historical performance,
// research parity, and promotion approvals must not prevent that experiment.
// Bind the handoff to the actual implementation and configuration instead.
export function loadExecutionStrategy(repoDir, { mode = 'dry-run' } = {}) {
  if (mode === 'live') return loadAllYearStrategyArtifact(repoDir)
  if (!['paper', 'dry-run'].includes(mode)) throw new Error(`Unknown execution mode: ${mode}`)
  const files = new Map()
  function visit(relativePath) {
    const normalized = path.normalize(relativePath)
    if (files.has(normalized)) return
    const content = fs.readFileSync(path.join(repoDir, normalized), 'utf8')
    files.set(normalized, crypto.createHash('sha256').update(content).digest('hex'))
    for (const match of content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.mjs)['"]/g)) {
      visit(path.join(path.dirname(normalized), match[1]))
    }
  }
  visit('scripts/lib/qore-live-all-year-inference.mjs')
  const broker = loadReviewedBrokerExecutionProfile(repoDir)
  const contract = {
    policyId: PAPER_EXECUTION_POLICY,
    strategyId: 'ngas-all-year-beta',
    liveComponentContractDigestSha256: executableLiveComponentContractDigestSha256,
    brokerExecutionProfileDigestSha256: broker.profileDigestSha256,
    implementation: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
  }
  const binding = {
    policyId: PAPER_EXECUTION_POLICY,
    strategyId: contract.strategyId,
    digestSha256: crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
    liveComponentContractDigestSha256: contract.liveComponentContractDigestSha256,
    brokerExecutionProfileDigestSha256: contract.brokerExecutionProfileDigestSha256,
    paperEligible: true,
    liveEligible: false,
    promotionEligible: false,
  }
  return { binding, paperEligibilityFailures: [], liveEligibilityFailures: ['Paper execution policy cannot authorize live trading.'] }
}

export function executionStrategyBindingBlocks(provided, current, { mode = 'dry-run' } = {}) {
  if (mode === 'live') {
    if (provided?.policyId === PAPER_EXECUTION_POLICY) return ['Paper execution policy cannot authorize live trading.']
    return strategyArtifactBindingBlocks(provided, current, { mode })
  }
  if (!provided || typeof provided !== 'object') return ['inference is missing its execution strategy binding']
  return Object.entries(current.binding)
    .filter(([field, value]) => provided[field] !== value)
    .map(([field]) => `inference execution strategy ${field} does not match the current executable strategy`)
}

export function assertExecutionStrategy(repoDir, { mode = 'dry-run' } = {}) {
  const strategy = loadExecutionStrategy(repoDir, { mode })
  if (mode === 'live' && strategy.liveEligibilityFailures.length) {
    throw new Error(`The reviewed strategy is not live-eligible: ${strategy.liveEligibilityFailures.join('; ')}`)
  }
  return strategy
}
