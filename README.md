# Kairos

Kairos is a Mac application for researching and operating a growing symphony of strategies. Its registry can expand to dozens of diverse strategies through reviewed definitions and isolated adapters. Its name refers to the opportune moment: acting on available evidence at the right time. The existing QORE natural-gas subsystem uses `ngas-all-year-beta`, combining internal summer and winter engines, a VOO/QQQM fallback and `UNG` execution at Alpaca. The leverage strategy and three newer candidates retain their separate research and paper-evaluation contracts.

The natural-gas subsystem has two surfaces:

- **Command** shows actual Alpaca paper/live equity history, positions, open orders, the current all-year target, and fail-closed risk state. Its refresh action is read-only.
- **Backtest** shows the checked-in all-year research curve, train/validation/holdout results, block-bootstrap Monte Carlo, and weather diagnostics.

Summer and winter are internal components of the natural-gas strategy. The broader desktop catalogue lists natural gas, leverage and the three newer candidates without promoting seasonal components or comparison baselines into extra strategies.

## Open the Mac application

Open **Kairos** in Applications or search for **Kairos** in Spotlight. The installed app is `/Applications/Kairos.app`. It opens its own native window and starts and stops its bundled local research service automatically. No terminal, Node installation or browser is needed to use it. Existing saved hub runs stay in the same Application Support folder.

The starting catalogue includes natural gas, relative leverage sleeves, energy residual rotation, Treasury curve residual rotation and BTC monthly loss to cash. It has no fixed strategy-count limit. Leverage retains its reviewed historical replay and comparison baseline. The three newer candidates retain offline paper status and their fixed future windows. Natural gas opens its original Account and Backtests surfaces inside the same native window; Account uses the existing sanitized, read-only M1 connection.

Maintainers can quit Kairos and run `npm run app:install` to build and replace the installed app from this repository, including an existing QORE installation. The installer verifies the original evidence manifests, adds a release manifest and signs the app. It deletes the replaced app and temporary compiler files. No backup apps, terminal launchers or retained build archives are created. See [the desktop contract](docs/desktop/contract.md) for source, evidence and lifecycle boundaries.

The desktop icon uses the selected Offset artwork in `desktop/assets/offset-icon.png`: two staggered charcoal and slate bars on an ivory tile. Installation packages this image at all native icon sizes.

## Developer workflow

QORE requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

`npm run dev` binds the Vite dashboard and its telemetry service to loopback, chooses free local ports when necessary, and prints both URLs. Use `npm run dev:vite` only for UI work that does not need Command telemetry.

On the main Mac, `npm run dev` keeps the app and Backtest data local. Command alone uses the already-paired T3 route to `m1-server` over Tailscale, then reads a bounded, sanitized snapshot through the existing SSH identity. The connection meter reports the T3 route and M1 telemetry stages. It does not start or configure Tailscale, copy the M1 runtime directory, call Alpaca from the Mac, or expose an M1 port.

## Research workflow

```bash
npm run data:refresh
npm run data:forecasts:gfs
npm run data:forecasts:gefs
npm run data:forecasts:graphcast
npm run data:quality
npm run train
npm run backtest
```

`data:quality` rebuilds the narrow weather-quality summary used by Backtest. `train` refreshes the internal summer and winter component ledgers, then rebuilds the single public all-year artifact. Use `train:component:summer` or `train:component:winter` only when deliberately working on one internal engine. `backtest` refreshes weather QA and rebuilds the all-year artifact from the existing component ledgers.

The reproducible research artifacts live under `data/qore/`. In particular, the dashboard reads:

- `data/qore/research/strategy-agent-runs/ngas-all-year-beta/run-summary.json`
- `data/qore/research/strategy-agent-runs/ngas-all-year-beta/display-curve.csv`
- `data/qore/research/ngas-weather-quality-summary.json`

Optimizer commands update checked-in artifacts. Inspect those diffs before committing them.

`npm run backtest` also rebuilds the versioned overnight-risk audit. Run `npm run research:overnight-risk` by itself to reproduce that audit from the current all-year target ledger without retraining the seasonal components.

## Live and paper workflow

Start with dry-run, graduate to Alpaca paper, and treat live routing as a separate reviewed deployment step.

Run the commands in this section only from the deployed checkout on Linux host `m1-server`. The broker has a hard execution-host gate: any order-capable command invoked from the main Mac is rejected before broker access. The main Mac is for research, development, Backtest, and the read-only Command viewer.

```bash
npm run trade:prepare
npm run trade:readiness
npm run broker:status
npm run broker:dry-run
npm run broker:paper
```

`trade:prepare` refreshes or verifies the current weather, market, storage, inference, signal, and risk handoffs on their configured cadences without invoking the broker reconciler. It does not retrain the strategy. `trade:readiness` is the no-order preflight. Long-running operation uses `npm run trade:run`; one supervised pass uses `npm run trade:once`.

Real-money routing is intentionally harder to enable:

```bash
npm run broker:live
```

Credentials and confirmations belong in a mode-`600` `.env.local`, never in source control. See [the broker setup guide](docs/live-trading-broker-setup.md) for exact gates, paper-to-live promotion, the Linux service, and emergency stop commands.

## Daily and weekly portfolio reports

QORE can render a private PNG brief from exact-session Alpaca telemetry, including portfolio dollars and percentages, VOO and QQQM performance, and account performance versus the configured VOO/QQQM basket in percentage points and a clearly labeled hypothetical active-gap dollar amount.

```bash
npm run report:daily
npm run report:weekly
```

These commands refresh Alpaca with the read-only `--status` path and create local previews only. Configurable fan-out supports Discord, Telegram, and Resend email; all destinations and the external-send gate are disabled by default. See [the portfolio report guide](docs/portfolio-reports.md) for setup, privacy boundaries, delivery, and the independent scheduler.

## Data boundary

`data/qore/` contains versioned research inputs and reproducible outputs. `.local/qore/` contains mutable runtime state: rolling completed-session market history, live forecasts, inference, broker snapshots, order logs, supervisor status, and local validation output. `.local/` is ignored and must not be promoted into research data without an explicit, reproducible import step. `npm run trade:market-history` refreshes the local Yahoo `NG=F`/`UNG` histories and the VOO/QQQM basket; default live inference runs that refresh automatically and never reads a target-date daily bar.

The all-year research ledger uses Yahoo `UNG` ETF history for every gas return, matching the symbol Alpaca executes. Summer Alpha keeps Yahoo's `NG=F` continuous front-month proxy only as a price-confirmation signal input. The versioned artifact applies a causal adjusted-open rebalance and all-leg UNG/VOO/QQQM turnover costs, while remaining research evidence rather than a promise of exact live fills. QORE refuses `NG`, `MNG`, and `QG` orders until contract selection, expiry, roll, margin, and delivery controls exist.

## Validate changes

```bash
npm run lint
npm run build
npm test
```

Read [the strategy contract](docs/strategy.md) before changing signal logic and [AGENTS.md](AGENTS.md) before changing repository boundaries.
