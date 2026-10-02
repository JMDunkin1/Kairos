# QORE Strategy Hub

A local Mac desktop research candidate for a portfolio of strategies. The first slice includes editable trend, mean-reversion and paired relative-value definitions, deterministic shared backtests, per-sleeve attribution and netted positions, decision/fill traces, frozen runs, the read-only canonical experiment ledger, and weekly JSON/CSV exports.

## Launch

Requires macOS 13+, Node 22.18+ (22.x) or Node 24+, and Xcode command-line tools to build. Packaging checks the runtime before bundling it. No new desktop framework.

```sh
npm ci
npm run desktop
```

Then double-click `.local/desktop/QORE Strategy Hub.app` whenever needed. Its native AppKit/WebKit window starts and stops the bundled loopback simulation service automatically; no terminal or browser is needed. The local build is ad-hoc signed, not notarized or publicly distributed. Runs persist in adjacent `hub-state`; keep that directory when moving the app. `npm run dev` is an optional CLI-only research service.

## Research boundary

The available bars are synthetic fixture prices, split into development and already-exposed test sessions. Three contrasting adapters exercise the software; they establish no real market edge. A decision uses completed information from the configured prior session, known strictly before execution, and trades at the next opening reference. Selected instruments must share one opening instant per session; asynchronous execution is unsupported. Fractional USD equity/ETF accounting includes explicit income, net fees/slippage, calendar-day short borrow, opening cash flows and flow-adjusted returns. Ending holdings are marked rather than liquidated. Sleeves share net execution costs by absolute changes; transfers cross internally at the reference price. Borrow accrues only on prior net account shorts and is shared by prior sleeve short quantities. Overnight borrow and opening cash distributions on entering inventory are recorded before external opening flows. These are synthetic cash events, not a broker dividend/settlement model. No margin, cash interest, short-locate/fill guarantees or derivatives execution is simulated.

Every run freezes its protocol before computation and stores immutable result JSON plus append-only events, including negative/blocked trials. The canonical `research/experiment-log/experiments.jsonl` in the original QORE directory is read-only; revisions and inheritance are resolved without opening linked raw data. Missing metrics remain unavailable. Weekly exports use actual run ledgers; no email scheduler or sender is activated.

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
