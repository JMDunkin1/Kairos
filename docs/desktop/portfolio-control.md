# Portfolio controls and prospective evaluation

Kairos → **Portfolio** lets you assign dollar budgets, include or exclude strategies, scale their proposed risk and set portfolio limits. The catalogue expands without a fixed sleeve count. Today it contains five genuine registered identities; only NGAS has a current target preview adapter. The other strategies keep their historical records and original prospective windows. Registration and budget assignment do not create executable strategies, establish an edge or authorize trading.

Saving creates a new local revision. Unsaved drafts survive navigation between hub tabs; quit/reload discards unsaved edits. A new session starts from the last saved configuration. Pausing the plan freezes new shadow rebalances; disabling an individual sleeve proposes zero exposure for that sleeve at the next valid modeled rebalance. Neither action changes actual Alpaca holdings, cancels orders, changes the NGAS supervisor or engages the operator kill switch.

## Capital and risk

Budgets, including budgets retained for disabled strategies, cannot exceed portfolio capital. Use current paper equity copies a fresh account observation into the draft; it does not keep increasing capital automatically. Risk scale ranges from zero to three, constrained by the sleeve's gross cap and portfolio caps. Gross and symbol caps count absolute sleeve exposures **before** netting. Cash reserve caps aggregate positive targets, and short-sale proceeds cannot increase the risk budget. Global caps proportionally scale all target sizes. Portfolio capital and proposed changes remain separate from current account positions and performance.

A complete rebalance preview requires a fresh active paper account, known reviewed ETF holdings, no pending orders, a fresh open venue clock, valid operator state and risk observations, and current targets for every funded participating sleeve. Daily loss, trailing drawdown and turnover breaches withhold all indicative changes. Missing targets never create a partial rebalance or inferred liquidation. These are indicative USD targets, not executable orders: quote quality, short borrow, delivery contracts and broker submission gates remain separate. No stock, futures, options or crypto execution capability is added by these dials.

## Local state and commands

Native installation points portfolio state to this repository's `.local/qore/portfolio-control/`; upgrades preserve it. The canonical experiment ledger and frozen artifacts are never written by these commands. Revision files are immutable, hash bound and linked to their predecessor. Saves use a shared exclusive lock and atomic rename/fsync; stale locks are never reclaimed automatically. Inspect the process and state before removing `operation.lock` after a crash.

```
.local/qore/portfolio-control/
  revisions/000000000001.json
  inputs/<strategy-id>.json
  telemetry.json
  quotes.json
  shadow/observations/000000000001.json
```

The CLI is independent of React. It defaults to a no-write target preview:

```bash
npm run portfolio:plan
npm run portfolio:status
node scripts/qore-portfolio-control.mjs save --file=.local/qore/desired-portfolio.json --expected-revision=0
node scripts/qore-portfolio-control.mjs restore --revision=1 --expected-revision=3
```

The save file contains only the `config` shape returned by the portfolio API/status command. Restoring creates a new revision and preserves the original records. `--state=.local/qore/<evaluation-name>` selects another isolated evaluation; state outside `.local/` is refused. Configuration changes require a current expected revision, including CLI changes.

Capture current sanitized telemetry without orders, and collect fresh ETF quotes with GET-only Alpaca market-data access:

```bash
npm run portfolio:capture
npm run portfolio:quotes
npm run portfolio:observe                 # dry-run; writes no observation
npm run portfolio:observe -- --paper-shadow
npm run portfolio:run -- --paper-shadow --interval=15
```

On the Mac, capture uses the existing read-only M1 bridge. On the execution host it reads the local sanitized dashboard snapshot. Quote collection requires existing Alpaca market-data credentials in the process environment or protected `.env.local`; the native app never receives credentials. Its only external request is GET to the fixed [Alpaca latest quotes endpoint](https://docs.alpaca.markets/us/reference/stocklatestquotes-1), with redirects refused, a bounded response and a timeout. IEX is the default; `--feed=sip` requires that subscription. Closed markets, stale quotes, unavailable credentials, blocked telemetry or unavailable current strategy adapters prevent modeled rebalances.

The observer runs on the host holding the selected local plan and quote credentials. Plans on the Mac are **not** silently synchronized to M1. Deploy a reviewed copy of the code and explicitly transfer the desired configuration to a separate M1 portfolio directory using its CLI save command before running there; doing so still does not change the existing NGAS trader. There is no automatic service installation or live-money promotion in this release. The installed desktop displays the journal in its configured local state directory.

## Shadow accounting

`--paper-shadow` records prospective virtual observations, never Alpaca orders. A decision commits target dollar amounts; fills require a subsequently observed quote newer than both the decision and its original quote packet. Repeated packets, future quotes, changed revisions, changed input bindings or stale pending decisions cannot generate retrospective fills. A concurrent saved pause invalidates an older snapshot under the same writer lock.

Each sleeve retains its own virtual cash, positions, contributions and costs, even when symbols overlap. New capital is an external contribution; movement between sleeves is an internal transfer. Neither becomes investment profit. The total ledger balances sleeve NAV plus unassigned cash, and P&L is NAV minus cumulative contributions. Risk controls re-check the virtual portfolio's own current equity after losses and proposed capital flows, with a conservative transaction-cost reserve before sizing. They do not borrow the real account's equity. Virtual turnover and loss stops are additional gates.

`config/qore-portfolio-shadow.json` freezes explicit fee, impact, short borrow and debit financing assumptions. Buys use ask plus impact; sells use bid minus impact. Costs apply to each virtual leg conservatively. The journal binds its cost policy; changing costs requires a separate evaluation directory. Distribution income, corporate actions, tax, borrow availability, order capacity, real exchange fills and instrument-specific execution details are **not established** by this model. Its results are exploratory reference accounting, separate from actual Alpaca paper performance and frozen historical replay. They cannot alone establish an edge or authorize live trading. Alpaca paper itself also has [simulation limitations](https://docs.alpaca.markets/us/docs/paper-trading).

## Adding a strategy

1. Register a genuine identity in `config/qore-desktop.json` with its theory, stage and reviewed evidence adapter, or `view: unconfigured` while evidence work is pending. Keep NGAS components and baselines internal.
2. Add a reviewed isolated producer of current target weights. Register its identity and version in `config/qore-portfolio-adapters.json` using `kind: weights-file`. Registration does not prove an edge or grant broker permissions. Retain chronological walk-forward testing, withheld reporting-only outcomes, costs, failed screens and documented exploratory uncertainty in the research owner's canonical ledger.
3. Write a bounded packet atomically to `inputs/<strategy-id>.json`. It must contain exactly `schemaVersion: 1`, the registered `strategyId` and `version`, ISO `generatedAt`/`expiresAt`, and finite `weights` for reviewed symbols. Expiry must follow generation, be at most one day after it and remain in the future. Malformed, stale, mismatched and unsupported packets fail closed. Current portfolio symbols are only UNG, VOO and QQQM. Broader instruments require their own reviewed contracts and adapters before implementation.
4. Fund the sleeve in a saved plan and run a separate prospective evaluation with lawful current input clocks. Existing candidate frozen windows are not reset or bypassed by a new adapter. Keep exploratory evaluation separate from live authorization.

The desktop remains unable to submit or reconcile orders. Actual multi-strategy Alpaca execution needs a separately reviewed broker portfolio adapter, attribution/reconciliation ledger, deployment contract and live authorization; no saved plan is consumed by the deployed NGAS order process.
