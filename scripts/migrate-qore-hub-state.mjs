import path from 'node:path'
import os from 'node:os'
import { migrateLegacyHubState } from './lib/qore-hub-state-migration.mjs'

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--source') throw new Error('Usage: node scripts/migrate-qore-hub-state.mjs --source /path/to/old/hub-state')
const receipt = migrateLegacyHubState({ sourceRoot: path.resolve(args[1]), destinationRoot: path.join(os.homedir(), 'Library/Application Support/QORE Strategy Hub Candidate') })
console.log(JSON.stringify(receipt, null, 2))
if (['conflict', 'attention'].includes(receipt.status)) process.exitCode = 1
