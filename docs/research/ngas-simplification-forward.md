# Natural-gas simplification forward research

These commands collect a separate paper-research comparison. They do not submit broker orders, write production handoffs, stop the deployed paper service, or select a strategy from newly observed results.

## Commands

Run from the repository root, with its existing Node dependencies:

```bash
# Each NYSE session around 08:30 America/New_York:
node scripts/run-ngas-simplification-preopen.mjs

# After 16:15 America/New_York, or next morning for missed settlements:
node scripts/settle-ngas-simplification-forward.mjs

# Verify public acquisition on any day without writing predictions:
node scripts/run-ngas-simplification-preopen.mjs --prepare-only
node scripts/collect-ngas-simplification-forward.mjs --check-only --runtime-root=.local/qore/research/ngas-simplification/forward-runtime
```

`--check-only` may run outside the collection window: it verifies fresh inputs and candidate computation but never appends a prediction.

The pre-open wrapper downloads the official EIA storage JSON, runs the existing current-strategy inference collector in `dry-run` mode with isolated research state, collects matching prior-day lead-8 NOAA forecasts, refreshes archived EIA supply vintages, and invokes the strict pre-open writer. Inference refresh collects current NOAA and adjusted Yahoo market data. None of these commands calls the broker. The Python supply collector requires `openpyxl`; set `QORE_RESEARCH_PYTHON` to the bundled runtime Python if necessary. The wrapper automatically detects the conventional Codex bundled runtime path before falling back to `python3`.

Do not use the prepare option as a historical prediction generator. The writer has no supplied clock or target-date option, only admits the current reviewed NYSE session before 09:30 New York, starts September 28, 2026, and creates at most one immutable prediction per date and implementation seal. Weekends, holidays, the session open, stale caches, and attempts to overwrite a record are rejected. A later code change starts a different seal and series. Settlement skips old series whose implementation/config hashes no longer match; it never reevaluates an old prediction with changed code. Retained raw Yahoo payloads must reproduce each settlement bar exactly.

## Inputs and output

All mutable state stays below `.local/qore/research/ngas-simplification/`:

- `forward-runtime/`: isolated current NOAA/inference/Yahoo/EIA caches.
- `forward-inputs/`: matched corrected four-sample lead-8 forecast atoms.
- `forward-supply-vintages/`: archived production/LNG release vintages.
- `forward/payloads/<sha256>`: exact input bytes retained before rolling caches can overwrite them.
- `forward/<seal>/targets/YYYY-MM-DD.json`: pre-open decisions and input/code hashes.
- `forward/<seal>/settlements/YYYY-MM-DD.json`: retained Yahoo payloads and adjusted bars for an existing prediction.
- `forward/<seal>/report.json`: cumulative research return/drawdown and daily curves under baseline, elevated, and stress friction.

Every candidate starts its forward comparison with the same hypothetical $100,000 and 98%-deployed 80/20 VOO/QQQM basket at the preceding close. The shared execution engine carries overnight holdings, rebalances at the adjusted open, retains the cash buffer and deadband, and accounts for costs. Missing predictions break the continuous evaluated prefix; unavailable overlay inputs never become invented flat positions. The report remains provisional while outcomes are missing.

## Frozen comparisons

The writer records the current strategy, no automatic Summer shorts, UNG-based Summer price gates, both changes together, and the index fallback. Revision, storage, revision-plus-storage, and supply-balance filters each apply to the no-Summer-short base. Their fixed rules are in `scripts/lib/qore-simplification-demand.mjs` and the local demand protocol. None of the proposed ablations changes Winter decisions; outside active Summer dates those candidates preserve the current all-year target.

When a gas-long target requires unavailable lead-8 weather or a sufficiently recent released supply vintage, that overlay is explicitly unavailable. Other candidates continue collecting. A baseline that cannot be reproduced from fresh retained runtime inputs blocks that day's research snapshot; it does not affect paper execution.

The record hashes implementation/acquisition/settlement code, frozen configurations and the protocol. Retained input hashes and append-only files provide local auditability, but no external chronology anchor proves when a local record existed. Describe this as local prospective research, not pristine authenticated out-of-sample evidence. No current recommendation is automatically promoted from these returns.
