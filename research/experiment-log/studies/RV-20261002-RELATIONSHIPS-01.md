# Two funded NAV relationship experiments

Stable ID: `RV-20261002-RELATIONSHIPS-01`. Status: **development_aborted_source_schema_failure**.

First two-rule development attempt stopped. XLE/Brent failed before outcomes because availability_date was both an index name and column label. Bond/barbell completed four independently verified partial-batch rows: validation CAGR −1.52%, drawdown −15.08%, 13 round trips, and −1.74 percentage points versus its own static control (−2.07 points at doubled cost). No shortlist or final release was allowed. Original failed attempt, partial outcomes and immutable 117-file freeze preserved; metadata-only bridge passes invented-data regression but has never rerun real data.

## What was tested

{
  "candidate_configurations": 2,
  "economic_designs": 2,
  "threshold_variants": 0,
  "attempted_configurations": 2,
  "configurations_with_partial_batch_outputs": 1,
  "metric_rows": 4,
  "failed_configurations": 1,
  "selected": 0,
  "empirical_retries": 0
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [PROTOCOL_PLAN.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/PROTOCOL_PLAN.json), SHA256 `05691a9d3ddf567fc4407f2b325eb37e8b9ab1e744245012a7cf25a1d4b57ac2`.
- [PROTOCOL.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/PROTOCOL.json), SHA256 `5ffc9de50b162656ac81d25cd7c6cfcdf5580029cc36c9fca9d2fbf797a0bec3`.
- [FREEZE.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/FREEZE.json), SHA256 `364eb5e006a3d2ab2792b95411ab970429d631f571e860fd81fabf71a60cb1c4`.
- [catalog.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/catalog.json), SHA256 `b0f66534aeb06a066cd399897f6c733a90af9a4ded4da3480ee4395c3c0b6788`.
- [source_download_manifest.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/source_download_manifest.json), SHA256 `e132eac31e647ba5d6820f2adccdf9d9c4b39b8f14ecbfbb51f838a4d139e6e8`.
- [normalization_manifest.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/normalization_manifest.json), SHA256 `c74eacf5afbbedf2802d12eae5427362cee8b23e70295c3fba210f2cfaba3be3`.
- [rules_notes.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/rules_notes.md), SHA256 `c67a6ef502911b813004469bdfb1cd5c306e3f4f0ae482ea6f5563a119988abc`.
- [rv_source_audit.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_source_audit.md), SHA256 `4d7623f2cac4faa1f829b2232ab7bd9e1b2d94acaa0147a0262a77fba0b6f5dc`.
- [rv_source_audit.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_source_audit.json), SHA256 `f3bf3c096e0f4fbe856cd98363efb6dc6b8fd509fc25de58fd5d9e8bb66b4cec`.
- [rv_execution_audit.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_execution_audit.md), SHA256 `071da37b847f0a4306bde0e6da4bd9eff9a1e21e794ac9ac959bfc53f61477dc`.
- [rv_execution_audit.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_execution_audit.json), SHA256 `8a64345d972c88a4bb56d5996161f84bc522af63f5d17ff715df77763624c899`.
- [rv_independent_preparation_snapshot.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_independent_preparation_snapshot.json), SHA256 `9c60396448542941cb33de8206e5d22d14d98157fa4ab21181daaa58b552c4b3`.
- [rv_independent_preparation_checker.py](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_independent_preparation_checker.py), SHA256 `c91a0e2f61ef351d008dca4aca250e8c4a4f0ed54cf2b2ad654891f89ec71db1`.
- [rv_independent_audit.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_independent_audit.md), SHA256 `1913e96cc8c97b4b25d89dac731f803329624d1ff9d0d1b775931b38cd60b1df`.
- [rv_independent_audit.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/audit/rv_independent_audit.json), SHA256 `8392926358bae81809ab6cf51fa82893fd8150d265d6e10a353d1bf110ecb684`.
- [development_all_trials.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/results/development_all_trials.csv), SHA256 `518c6d7fd1a3ba5677f1f7c99c7d0f694a7dd92abc8049a4a49054d8a1e8c3f7`.
- [development_failures.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/results/development_failures.json), SHA256 `bacc1101c1cfebe2b806326444b0c2f45038ea4d2183754f55847bb10999374c`.
- [develop_abort.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/results/develop_abort.json), SHA256 `e95576fbb061e10cab1b122d58c7643bab0c891d400d7233d36c4fb2e26139f7`.
- [development_started.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/results/development_started.json), SHA256 `e245ab035e491d21667c8e83bbf1ec09ac594a5fc7cfae26846800b206956f56`.
- [SCHEMA_REPAIR_PROPOSAL.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/relative/SCHEMA_REPAIR_PROPOSAL.json), SHA256 `c2670f85c430c168e8452b563f07ee1c19e5840cc31eca72a7d46580eb4d15c5`.
- [rv_schema_bridge.py](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/rv_schema_bridge.py), SHA256 `6b4ce0a16499e9a9002fd0fb8fab398840d67cf06270b40a396e578b2015027a`.

**costs timing contract**: All NAV-derived signals at close execute NEXT observed equity NAV close; old holdings earn the interval into execution, new holdings earn the following interval. Entry/exit ages reference scheduled baseline execution dates. Extra0/1/2 execution lags stress frozen signal states rather than a broker-fill-feedback model. Read-only audited13-fund normalized totalNAV and distributions, including existing split/dividend/calendar/issuer tie-out caveats. NAV relationship measures are not executable quotes or arbitrage. Ordinary5bps pergrossdollartraded; costs1/2/4multipliers;100000 funded fractional dollars; actualSHYreturn when held, zero residualcashyield; no short borrow, margin, options, paiddata, accounts or orders.2000 whole-share/exchangefill feasibility unverified.

**failure scope**: Interface integration failure, not a rejection of the economic XLE/Brent hypothesis. Bond outputs do not rescue the incomplete batch or create a nominated winner.

**historical exposure**: Independent source/chronology check and immutable code/protocol/data freeze beforeoutcomes; parentreceivesexactlocked metadata beforeoncefinaloutputevaluation. Familiar2024–2026prices/source/regimesalreadyexposed, so retrospective exploration only.

**valid retry**: Use a deliberate separately frozen schema-repair version with identical economic parameters and independent named-index coverage; preserve and link this failed version and all partial results. Do not count the same rules as new discoveries or claim prospective blindness.

**untested data**: XLE original portfolio outputs uncomputed; both new final models uncomputed; source historical EIA vintages, market fills and2000dollar whole-share feasibility unverified.

**audit status**: Source/execution/preparation PASS; independent partial bond arithmetic/chronology PASS. Study completion/selection failed. Named-index regression demonstrates proposed repair only.
