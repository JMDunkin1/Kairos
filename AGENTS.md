# Kairos Agent Contract

## Strategy mandate

Build a higher-risk symphony of theory-driven, niche and creative strategies that target market-beating returns, accept greater volatility for greater reward, explore unconventional data and arbitrage opportunities, avoid concentration in repeated approaches, earn inclusion through rigorous training and chronological walk-forward testing with genuinely withheld data and overfitting controls, admit underperformers only for exceptional stability and portfolio benefit, and never reject strong results merely because they are strong when sound testing supports them.

Use a practical burden of proof appropriate to a personal, higher-risk research portfolio rather than requiring institutional-grade certainty: promising strategies may advance with transparently documented assumptions, incomplete evidence and residual uncertainty, while retaining honest testing for overfitting, look-ahead bias and realistic costs. Clearly label exploratory and paper evaluation; unresolved research uncertainty alone does not block those stages. Preserve locked historical outcomes and keep live-trading authorization separate.

## Existing NGAS subsystem

Preserve the existing all-year natural-gas engine and its accounting/security contracts. Extend Kairos's broader strategy research and portfolio hub through isolated adapters; do not silently change deployed runtime.

## Desktop hub

- `/Applications/Kairos.app` is the single installed application; build it from this repository with `npm run app:install`. Installation deletes its temporary files and the replaced app rather than retaining archives or alternate app bundles. Preserve `QORE` protocol identifiers, runtime paths and historical evidence when changing the product brand.
- `config/qore-desktop.json` is the expandable product registry. Build toward diverse symphonies of dozens of strategies without a fixed catalogue or sleeve count. Add new reviewed definitions through isolated adapters; comparison baselines and seasonal components remain supporting records. Registration alone never establishes an edge or authorizes trading.
- The desktop entry point is `desktop.html` and `src/hub/`. The isolated NGAS entry point keeps its existing `command` and `backtest` routes. Do not mix account telemetry with historical or simulated results.
- The desktop has no strategy execution endpoint. Its only POST proxies the existing read-only broker status refresh; it must never submit or reconcile orders.
- Read the canonical experiment ledger through `scripts/lib/qore-hub-ledger.mjs`; its research owner controls appends. Preserve failed, blocked, skipped and successful outcomes and their retry conditions.
- Preserve exact evidence manifests, contracts, reviews and approved frozen exports under `assets/` and `docs/desktop/provenance/`. Never edit an old manifest to describe a new release.
- Synthetic examples belong only in `scripts/test-fixtures/portfolio/`. They must not appear as selectable products or be packaged in the native app.
- Obtain fresh independent review for broad desktop changes. Validate hub, ledger, historical replay, paper evidence, portfolio accounting and UI tests alongside the standard checks.

## NGAS product invariants

These invariants apply to the existing NGAS subsystem.

- `ngas-all-year-beta` is the only public strategy.
- `ngas-summer-alpha` and `ngas-winter-alpha` are internal component ledgers, not navigation items, selectable strategies, or independently promoted products.
- The UI has exactly two routes: `command` and `backtest`.
- Command consumes local runtime telemetry only. Do not mix research returns into live account performance.
- Backtest consumes versioned all-year artifacts only. Label `NG=F` research and `UNG` execution as different instrument contracts.
- The dashboard telemetry API stays read-only with respect to orders. `POST /api/live/refresh` may run broker `--status`; it must never reconcile or submit.
- Browser DTOs must not contain credentials, account identifiers, raw broker payloads, or unbounded log content.
- Alpaca execution is limited to `UNG`, `VOO`, and `QQQM`. Futures symbols remain blocked.
- Paper execution must not depend on research performance, historical artifact parity, or promotion approval. Bind it to the current executable strategy; keep real-money promotion gates separate.
- Paper and live routes fail closed on stale/missing inference, risk limits, broker/account state, quote quality, venue state, or the operator kill switch.

## Code map

| Area | Responsibility |
| --- | --- |
| `src/views/CommandView.tsx` | Actual Alpaca account performance and operational state |
| `src/views/BacktestView.tsx` | Checked-in all-year research and validation |
| `src/data/allYearBacktest.ts` | Narrow parser/adapter for displayed research artifacts |
| `src/runtime/` | Typed client boundary for the local telemetry API |
| `scripts/optimize-ngas-*-alpha.mjs` | Internal seasonal component training |
| `scripts/optimize-ngas-all-year-beta.mjs` | Deterministic all-year selector and display artifact generation |
| `scripts/summarize-ngas-weather-quality.mjs` | Reproducible narrow weather-QA artifact for Backtest |
| `scripts/lib/qore-live-all-year-inference.mjs` | Shared live seasonal scoring and selector logic |
| `scripts/qore-live-*.mjs` | Current inputs, inference, risk, and supervision |
| `scripts/qore-alpaca-broker.mjs` | Authoritative Alpaca status, preflight, reconciliation, and order boundary |
| `scripts/qore-dashboard-service.mjs` | Loopback, sanitized, read-only Command telemetry |
| `config/qore-live-*.json` | Reviewed cadence and broker/risk defaults |

Prefer narrow modules with explicit inputs and outputs. Keep the runtime scripts usable without the React app so an agent can inspect, test, and operate the system from the command line.

## State and generated files

Versioned research lives in `data/qore/`. Optimizers intentionally update their own directory under `data/qore/research/strategy-agent-runs/`; review summaries, selected rows, and display curves together. Never hand-edit a generated performance curve to improve a result.

Mutable operational state belongs under `.local/qore/` and remains untracked. This includes live weather, selected-contract NOAA calendars, current inference, signal/risk handoffs, broker snapshots, order logs, supervisor locks/status, and live-weather comparison output. Tests should use temporary directories or `.local/`, never overwrite checked-in research artifacts.

Secrets belong only in the process environment or `.env.local`. Never print them, include them in a browser response, or commit them.

## Change workflow

1. Read `docs/strategy.md` and the affected script before changing a signal contract.
2. Preserve no-lookahead timing, component-specific split boundaries, costs, and the rule that holdout is reporting-only.
3. Rebuild the narrowest affected artifact. If a component changes, rebuild the all-year artifact afterward.
4. Run `npm run lint`, `npm run build`, and the relevant test command. Run `npm test` before a broad handoff.
5. Inspect `git diff --check`, generated-artifact diffs, and any `.local`/tracked-state boundary changes.

For trading code, also run `npm run test:live-inference`, `npm run test:live-trading`, and `npm run test:dashboard-service`. Never use paper or live order commands as automated tests.

## Safety rules

- Default to `dry-run`; paper routing requires an explicit flag; live requires all three live confirmations.
- `trade:prepare` may refresh runtime handoffs but must not submit orders or retrain checked-in research.
- The kill switch blocks new Kairos submissions; it does not cancel existing orders or liquidate positions.
- Treat a dirty code/config worktree as a live-mode blocker until it is reviewed and committed.
- Preserve loopback binding and strict allowed origins for the dashboard service.
- Any proposed futures adapter requires a new reviewed contract for delivery month, expiry, rolling, margin, price limits, and delivery risk before implementation.
