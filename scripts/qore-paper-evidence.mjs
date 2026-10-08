import { paperCatalogue, savedPaperReplay, paperEvidence } from './lib/qore-hub-paper.mjs'
const args = process.argv.slice(2)
if (args.length > 3 || !['catalog', 'replay', 'evidence'].includes(args[0] ?? 'catalog')) throw new Error('Use: node scripts/qore-paper-evidence.mjs catalog | replay STRATEGY_ID [CASE_ID] | evidence DOCUMENT_ID')
const command = args[0] ?? 'catalog'
if (command === 'catalog' && args.length > 1) throw new Error('Catalog accepts no path or option.')
if (command !== 'catalog' && !args[1]) throw new Error('Provide the exact reviewed strategy/document identity.')
const value = command === 'catalog' ? paperCatalogue() : command === 'replay' ? savedPaperReplay(args[1], args[2]) : paperEvidence(args[1])
console.log(JSON.stringify(value, null, 2))
