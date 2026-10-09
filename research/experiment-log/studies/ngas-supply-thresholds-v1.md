# Gas supply-veto threshold9-cell test

Stable ID: `ngas-supply-thresholds-v1`. Status: **released_no_optimized_threshold_identified**.

No nonzero threshold met the frozen identification requirements across nine cells. The zero/zero convention is not a proven optimum.

## What was tested

{
  "threshold_designs": 1,
  "candidate_configurations": 9,
  "result_rows_including_years_lanes_costs": 324,
  "cost_scenarios": 3,
  "economic_zero_zero_overlaps_previous_supply_filter": true
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [ngas-supply-threshold-protocol.json](/Users/jamesdunkin/Documents/Local Automations/QORE/docs/research/ngas-supply-threshold-protocol.json), SHA256 `a68ce9c8da71954f3c15b987d7fc5b3ed3f2bb5897f632b5835489dc237b677d`.
- [ngas-supply-threshold-audit.json](/Users/jamesdunkin/Documents/Local Automations/QORE/data/qore/research/ngas-supply-threshold-audit.json), SHA256 `d2f84f7db08ecffd83aa6525b5996b17390408486ce654b293355bf199f46616`.
- [ngas-simplification-results.md](/Users/jamesdunkin/Documents/Local Automations/QORE/docs/research/ngas-simplification-results.md), SHA256 `02a5afee30683520555178bb6193dc22a03a64c5f12f44a125680a149522786f`.

**plain rules**: ["Veto a Summer long only when storage surplus exceeds its threshold and production growth minus LNG growth exceeds its threshold.", "Use zero, positive training-feature median and positive training-feature 75th percentile for each dimension, giving nine fixed cells.", "Replace zero/zero only if the frozen confidence, year, benchmark and affected-episode requirements pass. Equality does not veto."]

**splits**: {"trainStart": "2021-01-01", "trainEnd": "2023-12-31", "validationStart": "2024-01-01", "validationEnd": "2024-12-31", "holdoutStart": "2025-01-01", "holdoutEnd": "2025-12-31", "excluded": "All2026 observations/outcomes; especially July27-September25 outage."}

**costs timing contract**: {"schemaVersion": 1, "contractId": "qore-causal-etf-execution-v2", "selectionScenarioId": "baseline", "priceConvention": "Yahoo daily split-and-distribution-adjusted open and close", "signalTiming": "prior close holdings earn close-to-open returns; the current target becomes effective at the current adjusted open", "initialState": "already invested in the configured VOO/QQQM fallback at the prior close", "deploymentFraction": 0.98, "rebalanceDeadbandPct": 0.25, "rebalanceDeadbandPolicyId": "risk-reductions-and-ung-transitions-bypass-v1", "indexWeights": {"VOO": 0.8, "QQQM": 0.2}, "turnoverConvention": "absolute signed pre-trade weight to target weight, summed across UNG, VOO, and QQQM", "benchmarkConvention": "gross 80/20 VOO/QQQM daily target-weight close-to-close return", "selectionRule": "cost and execution parameters are frozen before candidate evaluation and must never be optimized for return", "costCalibration": "aggregate all-in research allowances; replace only with a separately versioned calibration built from stored historical quotes and fills", "scenarios": {"baseline": {"selectionEligible": true, "oneWayBps": {"UNG": 3.2, "VOO": 1, "QQQM": 1}, "annualBorrowRatePct": 0, "borrowBasis": "default live routing opens UNG shorts only when Alpaca reports easy-to-borrow status"}, "elevated": {"selectionEligible": false, "oneWayBps": {"UNG": 5, "VOO": 2, "QQQM": 2}, "annualBorrowRatePct": 0}, "stress": {"selectionEligible": false, "oneWayBps": {"UNG": 10, "VOO": 5, "QQQM": 5}, "annualBorrowRatePct": 10}}}

**exact reported metrics**: {"selected_baseline_cost_summer_only": [{"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "2021", "sessions": 252, "returnPct": 37.16719395254238, "maxDrawdownPct": -5.109610902195905, "activeSessions": 27, "fallbackReturnPct": 27.957812098932866, "excessVsFallbackPct": 9.20938185360951, "unfilteredReturnPct": 37.16719395254238, "excessVsUnfilteredPct": 0}, {"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "2022", "sessions": 251, "returnPct": -17.23036123246522, "maxDrawdownPct": -22.726743783097525, "activeSessions": 32, "fallbackReturnPct": -20.739315824761174, "excessVsFallbackPct": 3.5089545922959537, "unfilteredReturnPct": -17.23036123246522, "excessVsUnfilteredPct": 0}, {"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "2023", "sessions": 250, "returnPct": 30.952777897061633, "maxDrawdownPct": -9.742712231822836, "activeSessions": 0, "fallbackReturnPct": 30.952777897061633, "excessVsFallbackPct": 0, "unfilteredReturnPct": 26.786328445002148, "excessVsUnfilteredPct": 4.166449452059485}, {"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "train", "sessions": 753, "returnPct": 48.67434356272169, "maxDrawdownPct": -22.72674378309738, "activeSessions": 59, "fallbackReturnPct": 32.81261812724785, "excessVsFallbackPct": 15.861725435473836, "unfilteredReturnPct": 43.94405721660733, "excessVsUnfilteredPct": 4.730286346114362}, {"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "validation", "sessions": 252, "returnPct": 22.52688739278903, "maxDrawdownPct": -10.768257041024532, "activeSessions": 12, "fallbackReturnPct": 24.612382536037146, "excessVsFallbackPct": -2.0854951432481172, "unfilteredReturnPct": 21.841353942487917, "excessVsUnfilteredPct": 0.6855334503011115}, {"candidateId": "storage-0-flow-0", "lane": "summer-only", "scenarioId": "baseline", "period": "holdout2025", "sessions": 250, "returnPct": 25.43184363793525, "maxDrawdownPct": -19.124363748602637, "activeSessions": 16, "fallbackReturnPct": 18.085535772829566, "excessVsFallbackPct": 7.346307865105683, "unfilteredReturnPct": 28.44662786364365, "excessVsUnfilteredPct": -3.0147842257084}], "training_best": {"id": "storage-0-flow-1", "storageThresholdPct": 0, "flowThresholdBcfd": 2.3945205049999956, "returnPct": 58.32333675968479, "excessVsUnfilteredPct": 14.379279543077466, "excessVsFallbackPct": 25.51071863243694, "positiveYears": 1, "bootstrap": {"id": "storage-0-flow-1", "meanDailyLogExcess": 8.350740608993315e-05, "pairedBlockStandardError": 6.673898731599668e-05, "simultaneousLower": -4.640573098838259e-05, "simultaneousUpper": 0.0002134205431682489, "familyAdjustedP": 0.17691154422788605, "zeroVariance": false}, "eligible": false}, "training_best_affected_independent_episodes": 2, "grid_storage_thresholds_pct": [0, 14.901960784313717, 18.101840521747725], "grid_flow_thresholds_bcfd": [0, 2.3945205049999956, 2.753611644800003]}

**exposure attribution**: The zero/zero rule uses fallback when it suppresses gas. Its 2024 return 22.526887% trails fallback 24.612383%; a training advantage does not prove general threshold superiority.

**failure scope**: 9-cell_threshold_optimization_failure; zero_zero_operator_convention_not_proven_optimum

**valid retry change**: Collect new prospective supply-vintage episodes with frozen rules. Do not relax the episode or confidence criteria in response to observed results.

**untested future**: ["Prospectivezeroconventionvsfallbackmeasurement"]

**historical exposure**: Historical 2021–2026 years were already observed during development. Exclusion from a later fit is not investigator-wide blindness. This log opened no raw forecasts, protected 2017–2019 targets, normalized holdouts, credentials or runtime records.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
