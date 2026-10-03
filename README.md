# QORE Strategy Hub

A local Mac desktop research candidate for a portfolio of strategies. The first slice includes editable trend, mean-reversion and paired relative-value definitions, deterministic shared backtests, per-sleeve attribution and netted positions, decision/fill traces, frozen runs, the read-only canonical experiment ledger, and weekly JSON/CSV exports.

## Launch

Requires macOS 13+, Node 22.18+ (22.x) or Node 24+, and Xcode command-line tools to build. Packaging checks the runtime before bundling it. No new desktop framework.

```sh
npm ci
npm run desktop
```

Then double-click `.local/desktop/QORE Strategy Hub.app` whenever needed. Its native AppKit/WebKit window starts and stops the bundled loopback simulation service automatically; no terminal or browser is needed. The local build is ad-hoc signed, not notarized or publicly distributed. Runs persist in `~/Library/Application Support/QORE Strategy Hub Candidate`; moving the app preserves them. On launch, old adjacent `hub-state` runs and registry events are imported without deleting originals or replacing conflicting records. Conflicts, incomplete files or a busy/stale writer lock stop import and new trials with an explicit notice. If the old folder is elsewhere, run `node scripts/migrate-qore-hub-state.mjs --source /path/to/old/hub-state` after quitting QORE; keep the originals. Inspect a stale `.hub-write.lock` only after confirming all QORE windows/processes have stopped. `npm run dev` builds and starts an optional CLI research service.

## Research boundary

The available bars are synthetic fixture prices, split into development and already-exposed test sessions. Three contrasting adapters exercise the software; they establish no real market edge. A decision uses completed information from the configured prior session, known strictly before execution, and trades at the next opening reference. Selected instruments must share one opening instant per session; asynchronous execution is unsupported. Fractional USD equity/ETF accounting includes explicit income, net fees/slippage, calendar-day short borrow, opening cash flows and flow-adjusted returns. Ending holdings are marked rather than liquidated. Sleeves share net execution costs by absolute changes; transfers cross internally at the reference price. Borrow accrues only on prior net account shorts and is shared by prior sleeve short quantities. Overnight borrow and opening cash distributions on entering inventory are recorded before external opening flows. These are synthetic cash events, not a broker dividend/settlement model. No margin, cash interest, short-locate/fill guarantees or derivatives execution is simulated.

Every run freezes its protocol before computation and stores immutable result JSON plus append-only events, including negative/blocked trials. Opening Experiments reads the canonical `research/experiment-log/experiments.jsonl` in the original QORE directory; macOS may request Documents access. Revisions and inheritance are resolved without opening linked raw data. Missing metrics remain unavailable. Weekly exports use actual run ledgers; no email scheduler or sender is activated.

Actual PAPER reporting has no reviewed native export yet. Its owner’s contract is surfaced as unavailable with scheduled email inactive; integration will reuse `buildWeeklyPerformance`, `weeklyCaption` and `renderWeeklyBriefSvg` from the separate reporting package after approved collection/export setup. It requires complete lineage, RAW marks, fresh provenance and ledger/position reconciliation; simulation exports cannot satisfy that contract.

Alpaca is unconfigured; futures/options/FX and exogenous feeds are explicitly unsupported. The existing NGAS scripts, telemetry service and broker gates are preserved; an isolated adapter awaits an approved released-target feed. This desktop app never calls the legacy runtime, reads credentials, accesses M1, places orders, or unlocks heldouts. Real-data replay and read-only broker reconciliation are the next integration slices.

## Validate

```sh
npm run lint
npm run build
npm run test:hub
npm run test:ui-accounting
npm run test:ui-requests
```

The full legacy research suite needs additional released inputs; protected data must remain excluded. Keep this candidate local until the expanded scope is approved for delivery.

## Released historical replay

Historical replay shows the separately approved, independently audited exports for `lev_core_relative_leverage_sleeves_v3` and its 50% TQQQ / 50% QQQ static exposure baseline, 2024-01-02 through 2026-10-01 (690 observed NAV sessions). It verifies the exact approval/manifest/audit closure and reads only bundled exports, never their descriptive provenance paths or original data. Frozen Python definitions are retained as provenance but are not executed. The candidate returned less than the baseline with smaller historical drawdown; this is one mechanism plus its exposure control, not two independent edges. Current-vintage, exposed-regime, survivor, NAV/cash completeness, leveraged-fund and fractional-capital limits remain visible. There is no historical execution endpoint or future feed.

Verify migration and replay with `npm run test:hub-migration` and `npm run test:hub-replay`, alongside the required hub/UI checks.

In a restricted executor, `node scripts/test-qore-hub.mjs --offline`, `node scripts/test-qore-hub-replay.mjs --offline`, and `node scripts/test-qore-native-qa.mjs --state-only` run only their named pure/headless checks. They deliberately skip HTTP/process/native GUI coverage; default test modes still require those facilities.
