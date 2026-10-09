export type PortfolioTelemetry = {
  generatedAt: string | null; sourceGeneratedAt: string | null; stale?: boolean; staleAfterSeconds?: number | null
  mode: 'dry-run' | 'paper' | 'live' | 'unknown'; brokerConnected: boolean
  account: { equityUsd: number | null; cashUsd: number | null; dayPnlPct: number | null; trailingDrawdownPct: number | null; status: string; shortingEnabled: boolean | null } | null
  positions: { symbol: string; marketValueUsd: number | null; currentPriceUsd: number | null }[] | null
  openOrders: unknown[] | null
  marketClock: { isOpen: boolean | null; timestamp: string | null } | null
  execution: { state: 'blocked' | 'running' | 'waiting'; lastInferenceAt: string | null } | null
  risk: { killSwitchEngaged: boolean | null; blockedReasons: string[] } | null
  strategy: { intent: { strategyId: string | null; generatedAt: string | null; targetDate: string | null; gasPosition: number | null; indexFraction: number | null; cashFraction: number | null } | null; inference: { strategyId: string | null; validated: boolean | null; liveForecastAppliedToTarget: boolean | null; generatedAt: string | null; target: { targetDate: string | null; gasPosition: number | null; indexFraction: number | null; cashFraction: number | null } | null } | null }
}

export type PortfolioStrategy = { id: string; name: string; stage: string; label: string }
export type Allocation = { strategyId: string; enabled: boolean; capitalUsd: number; riskScale: number; maxGrossPct: number }
export type PortfolioLimits = { cashReservePct: number; maxGrossPct: number; maxSymbolPct: number; maxTurnoverPct: number; maxDailyLossPct: number; maxDrawdownPct: number }
export type PortfolioConfig = { schemaVersion: 1; capitalUsd: number; paused: boolean; limits: PortfolioLimits; allocations: Allocation[] }
export type PortfolioRevision = { revision: number; updatedAt: string | null; config: PortfolioConfig }
export type TargetInput = { strategyId: string; version: string; generatedAt: string | null; expiresAt: string | null; weights: Record<string, number> | null; reason: string }
export type SleeveTarget = Allocation & { name: string; status: 'paused' | 'unfunded' | 'unavailable' | 'ready'; reason: string; targets: Record<string, number>; grossUsd: number }
export type PortfolioPlan = { generatedAt: string; mode: 'target-preview'; ordersEnabled: false; status: 'ready' | 'blocked' | 'paused'; reasons: string[]; sleeves: SleeveTarget[]; targets: { symbol: string; targetUsd: number; currentUsd: number | null; deltaUsd: number | null; sleeveGrossUsd: number }[]; allocatedUsd: number; participatingUsd: number; grossUsd: number; netUsd: number; modeledCashUsd: number; riskScaleApplied: number; turnoverUsd: number | null; accountEquityUsd: number | null }

export const portfolioSymbols: readonly ['UNG', 'VOO', 'QQQM']
export function money(value: number): number
export function defaultPortfolio(strategies: PortfolioStrategy[]): PortfolioConfig
export function validatePortfolio(value: unknown, strategies: PortfolioStrategy[]): PortfolioConfig
export function fresh(timestamp: unknown, now: number, maxAgeMs: number): boolean
export function ngasTargetInput(telemetry: PortfolioTelemetry | null, basket: Record<string, number>, now?: number): TargetInput
export function targetInputReady(input: TargetInput | undefined, now: number): boolean
export function planPortfolio(config: PortfolioConfig, strategies: PortfolioStrategy[], inputs: TargetInput[], telemetry: PortfolioTelemetry | null, now?: number): PortfolioPlan
