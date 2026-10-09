# July gas composite historical baseline

Stable ID: `qore-gas-baseline-july21-2026-legacy-v1`. Status: **released_retrospective_baseline_not_promoted**.

Legacy development results did not meet promotion checks; the corrected Summer temperature measure removed its old edge. Keep this version separate from the September artifact and live performance.

## What was tested

{
  "fixed_composite_designs": 1,
  "independent_new_experiments_for_version_copy": 0
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [strategy-audit-2026-07-21.md](/Users/jamesdunkin/Documents/Local Automations/QORE/docs/strategy-audit-2026-07-21.md), SHA256 `210008f28dafd6a6b09b53418bdd7453a74dae8dad7085eac4bcebbd3c7fd360`.

**plain rules**: ["Combine the legacy Summer heat-follow/fade and Winter cold-follow/reversion components deterministically; otherwise use the index fallback.", "Preserve the July artifact as its own historical version. Do not splice its metrics with later changed artifacts or account performance."]

**splits**: {"summer_train_end": "2023-12-31", "summer_validation_end": "2024-12-31", "winter_train_end": "2024-03-31", "winter_validation_end": "2025-10-31", "all_year_public_holdout_start": "2025-11-01", "observed_all_year_end": "2026-07-14", "source_document_broad_audit_end": "2026-07-22"}

**costs timing contract**: {"schemaVersion": 1, "contractId": "qore-causal-etf-execution-v2", "selectionScenarioId": "baseline", "priceConvention": "Yahoo daily split-and-distribution-adjusted open and close", "signalTiming": "prior close holdings earn close-to-open returns; the current target becomes effective at the current adjusted open", "initialState": "already invested in the configured VOO/QQQM fallback at the prior close", "deploymentFraction": 0.98, "rebalanceDeadbandPct": 0.25, "rebalanceDeadbandPolicyId": "risk-reductions-and-ung-transitions-bypass-v1", "indexWeights": {"VOO": 0.8, "QQQM": 0.2}, "turnoverConvention": "absolute signed pre-trade weight to target weight, summed across UNG, VOO, and QQQM", "benchmarkConvention": "gross 80/20 VOO/QQQM daily target-weight close-to-close return", "selectionRule": "cost and execution parameters are frozen before candidate evaluation and must never be optimized for return", "costCalibration": "aggregate all-in research allowances; replace only with a separately versioned calibration built from stored historical quotes and fills", "scenarios": {"baseline": {"selectionEligible": true, "oneWayBps": {"UNG": 3.2, "VOO": 1, "QQQM": 1}, "annualBorrowRatePct": 0, "borrowBasis": "default live routing opens UNG shorts only when Alpaca reports easy-to-borrow status"}, "elevated": {"selectionEligible": false, "oneWayBps": {"UNG": 5, "VOO": 2, "QQQM": 2}, "annualBorrowRatePct": 0}, "stress": {"selectionEligible": false, "oneWayBps": {"UNG": 10, "VOO": 5, "QQQM": 5}, "annualBorrowRatePct": 10}}}

**exact reported metrics**: {"source_version": "July21auditdocumentwithJuly22passes;displayedroundedvalues", "train": {"returnPct": 66.05, "cagrPct": 18.54, "sharpe": 0.91, "maxDrawdownPct": -28.34}, "artifact_validation": {"returnPct": 100.97, "cagrPct": 46.47, "sharpe": 1.92, "maxDrawdownPct": -16.68}, "retrospective_evaluation": {"returnPct": 17.77, "cagrPct": 26.64, "sharpe": 1.44, "maxDrawdownPct": -9.38}, "full": {"returnPct": 293.02, "cagrPct": 28.13, "sharpe": 1.31, "maxDrawdownPct": -28.34}, "pre2025_bootstrap_p": 0.15414, "2024_returnPct": 25.91, "2024_indexPct": 25.17, "reportOnly_full_p": 0.0218}

**exposure attribution**: The composite includes gas and fallback holdings. July counterfactual totals were Summer-only 212.11%, Winter-only 175.48% and index-only 118.77%; these are dated portfolio results.

**failure scope**: retrospective_evidence_and_input_contract_failure; no proofallweathertheoriesfail

**valid retry change**: Correct the measurement contract and freeze one end-to-end hypothesis before collecting new prospective pre-open predictions and matched execution records.

**untested future**: ["Correctedstatistic prospective contract"]

**historical exposure**: Historical 2021–2026 years were already observed during development. Exclusion from a later fit is not investigator-wide blindness. This log opened no raw forecasts, protected 2017–2019 targets, normalized holdouts, credentials or runtime records.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
