import { money, type Allocation, type PortfolioStrategy } from '../../scripts/lib/qore-portfolio-plan.mjs'

export const allocationColors = ['#1767a6', '#589e9c', '#8066a0', '#bd9147', '#a15c72', '#6e8aa2']
export type AllocationSlice = { id: string; name: string; value: number; color: string; paused?: boolean }

export function budgetSlices(capital: number, allocations: Allocation[], strategies: PortfolioStrategy[]): AllocationSlice[] | null {
  if (!Number.isFinite(capital) || capital <= 0 || allocations.some(a => !Number.isFinite(a.capitalUsd) || a.capitalUsd < 0)) return null
  const assigned = money(allocations.reduce((sum, a) => sum + a.capitalUsd, 0))
  // A budget chart must never silently normalize an overallocated draft to 100%.
  if (assigned > capital) return null
  const slices = allocations.flatMap(a => {
    const index = strategies.findIndex(s => s.id === a.strategyId)
    return a.capitalUsd > 0 ? [{ id: a.strategyId, name: strategies[index]?.name ?? a.strategyId, value: a.capitalUsd, color: allocationColors[Math.max(index, 0) % allocationColors.length], paused: !a.enabled }] : []
  })
  if (capital > assigned) slices.push({ id: 'unassigned', name: 'Unassigned', value: capital - assigned, color: '#cbd5df', paused: false })
  return slices
}

export function exposureSlices(targets: { symbol: string; sleeveGrossUsd: number }[]): AllocationSlice[] | null {
  if (targets.some(t => !Number.isFinite(t.sleeveGrossUsd) || t.sleeveGrossUsd < 0)) return null
  return targets.filter(t => t.sleeveGrossUsd > 0).map((t, i) => ({ id: t.symbol, name: t.symbol, value: t.sleeveGrossUsd, color: allocationColors[i % allocationColors.length] }))
}

export function unavailableExposureSleeves(sleeves: { name: string; status: string; enabled: boolean; capitalUsd: number }[]): string[] {
  return sleeves.filter(s => s.enabled && s.capitalUsd > 0 && s.status === 'unavailable').map(s => s.name)
}
