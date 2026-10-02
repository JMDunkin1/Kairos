import type { CashFlow, StrategyDefinition } from './types'

type Sleeve = Pick<StrategyDefinition, 'id'>
const hasSleeve = (definitions: readonly Sleeve[], id: string) => id === 'reserve' || definitions.some(d => d.id === id)

export function selectedFlowSleeve(definitions: readonly Sleeve[], preferred: string): string {
  return hasSleeve(definitions, preferred) ? preferred : definitions[0]?.id ?? 'reserve'
}

export function createCashFlow(definitions: readonly Sleeve[], flow: CashFlow): CashFlow {
  if (!hasSleeve(definitions, flow.sleeveId)) throw new Error('Choose a current sleeve or unallocated cash before adding a flow.')
  return { ...flow }
}
