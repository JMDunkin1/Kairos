export type Instrument = { id: string; kind: 'equity' | 'etf' | 'future' | 'option' | 'fx'; currency: 'USD'; multiplier: number }
// incomePerShare is an opening cash distribution paid to inventory entering the session.
export type Bar = { instrument: string; date: string; openAt: string; closeAt: string; availableAt: string; open: number; close: number; incomePerShare?: number }
export type Feed = { id: string; version: string; exposure: 'synthetic' | 'released-retrospective'; instruments: Instrument[]; bars: Bar[]; testStart: string }
export type DataFeedAdapter = { id: string; version: string; status: 'available' | 'unconfigured' | 'unsupported'; load: () => Feed }
export type StrategyKind = 'trend' | 'reversion' | 'spread' | 'ngas-all-year'
export type StrategyDefinition = { id: string; name: string; kind: StrategyKind; status: 'research' | 'paused'; instruments: string[]; allocation: number; parameters: { lookback: number; threshold: number; exposure: number } }
export type DecisionContext = { asOf: string; history: ReadonlyArray<Readonly<Bar>>; definition: Readonly<StrategyDefinition> }
export type Decision = { weights: Record<string, number>; reason: string; observedAt: string | null; status: 'ready' | 'warming' | 'paused' | 'unsupported' }
export type StrategyAdapter = { id: StrategyKind; version: string; decide: (context: DecisionContext) => Decision }
export type BrokerAdapter = { id: string; mode: 'simulation' | 'paper' | 'live'; status: 'available' | 'unconfigured' | 'unsupported'; products: Instrument['kind'][]; submit: (orders: NettedFill[]) => never | void }
export type Assumptions = { feeBps: number; slippageBps: number; borrowAprPct: number; lagSessions: number; maxAgeDays: number }
export type CashFlow = { date: string; amount: number; sleeveId: string }
export type RunRequest = { definitions: StrategyDefinition[]; capital: number; partition: 'development' | 'test'; assumptions: Assumptions; flows: CashFlow[] }
export type Sleeve = { id: string; name: string; cash: number; positions: Record<string, number>; contributed: number; fees: number; slippage: number; borrow: number; income: number; nav: number; pnl: number; twrPct: number }
export type NettedFill = { date: string; instrument: string; quantity: number; referencePrice: number; fillPrice: number; fee: number; slippage: number; internalCrossQuantity: number }
export type Trace = { date: string; sleeveId: string; asOf: string; status: Decision['status']; reason: string; weights: Record<string, number>; positions: Record<string, number>; cash: number; nav: number }
export type PortfolioPoint = { date: string; nav: number; cash: number; contributed: number; pnl: number; twrPct: number; drawdownPct: number; flow: number; reconciliationError: number; sleeves: Record<string, number> }
export type Simulation = { mode: 'paper-simulation'; feedId: string; feedVersion: string; exposure: Feed['exposure']; partition: RunRequest['partition']; assumptions: Assumptions; points: PortfolioPoint[]; sleeves: Sleeve[]; fills: NettedFill[]; traces: Trace[]; positions: Record<string, number>; summary: { nav: number; contributed: number; pnl: number; twrPct: number; drawdownPct: number; fees: number; slippage: number; borrow: number; income: number; reconciliationError: number } }
export type RunRecord = { id: string; createdAt: string; status: 'completed' | 'blocked'; request: RunRequest; requestHash: string; dataHash: string; codeHash: string; codeRevision: string; parentRunId: string | null; engineVersion: string; error?: string; result?: Simulation }
export type Experiment = { id: string; title: string; kind: string; status: string; revision: number; parentId: string | null; theory: string; retry: string; protocol: string; metrics: string; sources: { name: string; sha256: string }[]; inheritedFrom: string[] }
