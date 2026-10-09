# Gas return, sizing, source and measurement audit

Stable ID: `qore-gas-july21-22-multifamily-research-audit-v1`. Status: **released_historical_challengers_rejected**.

Historical return-optimized gas challengers were not promoted. Overlapping grids, sizing searches and replays must not be summed as independent strategies. This does not reject every future weather mechanism.

## What was tested

{
  "historical_family_counts_not_additive": true,
  "Summer_grid_history": [
    27648,
    103680
  ],
  "Winter_grid_history": [
    10,
    642
  ],
  "current_component_families_at_July_audit": {
    "Summer": 2,
    "Winter": 135
  },
  "exact_unique_six_leg_weights": 4115,
  "continuous_unique_scaling_vectors": 83951,
  "expanded_Summer_grid": 103680,
  "corrected_temperature_Summer_grid": 51840,
  "Winter_neighborhood": 2025,
  "overnight_policy_family": 50,
  "continuous_finalists": 16,
  "independent_total_unique_strategy_count": null,
  "count_caveat": "Overlappinggrids,replays,continuationsofsamefamiliesandmultipleartifactversions;reportediterationbudgetsareNOTadditiveindependentstrategies."
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [strategy-audit-2026-07-21.md](/Users/jamesdunkin/Documents/Local Automations/QORE/docs/strategy-audit-2026-07-21.md), SHA256 `210008f28dafd6a6b09b53418bdd7453a74dae8dad7085eac4bcebbd3c7fd360`.

**plain rules**: ["Audit source sets, component ablations, exact and continuous six-leg scaling, Summer fades and spatial/revision rules, Winter freshness/storage/risk, costs and temperature measurement.", "Keep within-run training, validation and later reporting separate, while disclosing that previous research had already exposed the historical years."]

**splits**: {"exact_weights_selection": "2021–2024", "continuous_weights_train": "2021–2023", "continuous_weights_validation": "2024", "reportOnly": "2025onwardalreadyseenpreviously", "SummerOriginal": "train<=2023/validation2024", "WinterOriginal": "train<=2024-03-31/validation<=2025-10-31"}

**costs timing contract**: {"schemaVersion": 1, "contractId": "qore-causal-etf-execution-v2", "selectionScenarioId": "baseline", "priceConvention": "Yahoo daily split-and-distribution-adjusted open and close", "signalTiming": "prior close holdings earn close-to-open returns; the current target becomes effective at the current adjusted open", "initialState": "already invested in the configured VOO/QQQM fallback at the prior close", "deploymentFraction": 0.98, "rebalanceDeadbandPct": 0.25, "rebalanceDeadbandPolicyId": "risk-reductions-and-ung-transitions-bypass-v1", "indexWeights": {"VOO": 0.8, "QQQM": 0.2}, "turnoverConvention": "absolute signed pre-trade weight to target weight, summed across UNG, VOO, and QQQM", "benchmarkConvention": "gross 80/20 VOO/QQQM daily target-weight close-to-close return", "selectionRule": "cost and execution parameters are frozen before candidate evaluation and must never be optimized for return", "costCalibration": "aggregate all-in research allowances; replace only with a separately versioned calibration built from stored historical quotes and fills", "scenarios": {"baseline": {"selectionEligible": true, "oneWayBps": {"UNG": 3.2, "VOO": 1, "QQQM": 1}, "annualBorrowRatePct": 0, "borrowBasis": "default live routing opens UNG shorts only when Alpaca reports easy-to-borrow status"}, "elevated": {"selectionEligible": false, "oneWayBps": {"UNG": 5, "VOO": 2, "QQQM": 2}, "annualBorrowRatePct": 0}, "stress": {"selectionEligible": false, "oneWayBps": {"UNG": 10, "VOO": 5, "QQQM": 5}, "annualBorrowRatePct": 10}}}

**exact reported metrics**: {"continuous_finalists": "All16trailedbaselinein2025andobserved2026;radicalfinalistsfull280.42–285.58%againstJulybaseline293.02%.", "corrected_Summer_unchanged_rules_all_year_returnPct": 176.55, "corrected_Summer_unchanged_rules_all_year_sharpe": 1.03, "corrected_Summer_unchanged_rules_all_year_maxDrawdownPct": -34.82, "corrected_best_GFS_neighborhood_all_year_returnPct": 222.04, "corrected_best_GFS_neighborhood_recent_increment_pp": -3.7, "Summer_grid_survivor_adjusted_p": 0.0758, "Summer_grid_survivor_family_size_only": 80, "Winter_simple_freshness_single_candidate_p": 0.0491, "Winter_neighborhood_family_p": 0.0899, "Winter_equal_core_all_year_returnPct": 318.0, "Winter_equal_core_validation_increment_pp": -2.372, "Winter_equal_core_top_episode_share_pct": 80.9, "forecast_RMSE_old_combined_F": 5.055, "forecast_RMSE_corrected_combined_F": 2.85, "forecast_event_Jaccard_old_vs_corrected": 0.185}

**exposure attribution**: Apparent fade gains concentrate in two or three episodes; the best fixed-core Winter episode dominates. Naive deadband gains disappear when mandatory risk reductions are respected.

**failure scope**: many_fixed_configuration_and_family_failures_with_historical_selection_contamination

**valid retry change**: Register a low-dimensional economic hypothesis with a causal measurement contract and new prospective episodes. Reusing opened 2021–2026 outcomes does not provide clean evidence.

**untested future**: ["Frozenfade-rampresearchshadow", "Same-targetrevision/breadth/pricegateprospectivecollector"]

**historical exposure**: Historical 2021–2026 years were already observed during development. Exclusion from a later fit is not investigator-wide blindness. This log opened no raw forecasts, protected 2017–2019 targets, normalized holdouts, credentials or runtime records.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
