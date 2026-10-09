# World Bank urea gas, grains and calendar forecasts

Stable ID: `niche-urea-worldbank-gas-grains-20261002-v1`. Status: **completed_selected_forecast_failed_no_trade**.

Selected gas/grains/calendar proxy failed the zero-change forecast baseline in validation and later data (direction: 7/18). Actual imports/planting hypotheses remain untested.

## What was tested

{
  "economic_primary_designs": 3,
  "candidate_configurations_including_lags": 9,
  "additional_lag_variants": 6,
  "registered_variants": 81,
  "completed_variants": 79,
  "source_blocked_unrun": 2,
  "development_prediction_rows": 2484,
  "holdout_prediction_rows": 162,
  "types": {
    "candidate": 3,
    "latency_diagnostic": 6,
    "baseline": 3,
    "blocked_candidate": 2,
    "inference_sensitivity": 6,
    "descriptive_deletion": 30,
    "cost_arithmetic": 27,
    "baseline_latency_bookkeeping": 4
  },
  "registered_groups_excluding_source_placeholder": 81,
  "declared_variants": 81
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [PROTOCOL.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/PROTOCOL.md), SHA256 `c5b6e055dcce21836db86995c19fae22b50cda5e671c84d78260161cbfdb68e5`.
- [PROTOCOL_AMENDMENT_01.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/PROTOCOL_AMENDMENT_01.md), SHA256 `15793986dadcfb90094ea210734a4368a84f474b2c3e12cd5f64d54be25a7dbf`.
- [PROTOCOL_AMENDMENT_02.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/PROTOCOL_AMENDMENT_02.md), SHA256 `dd089e592ac4ea509630bdf63c476a981f1cf9bdab19025264ed1caaf7487754`.
- [released_report_v1.html](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/coordinator/released_report_v1.html), SHA256 `ddbc00f0ac2c26bb7e60d4ea67327d2dfbc9130474eb10e1fc8a6cc2387b1fec`.
- [gate_events.jsonl](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/coordinator/gate_events.jsonl), SHA256 `1d141a69629e3228e8e84778a9fd92eab24829a48d4ad0d4e0ceb9d1c29351ef`.
- [raw_registry_integrity.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/coordinator/raw_registry_integrity.json), SHA256 `bf93c3dd68bc9fb7833b5a42fd374bde1024a3e0ac4503a2fad8245171770c13`.
- [multiple_testing.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/coordinator/multiple_testing.json), SHA256 `7efce2944f9e77dd5647762264de2b5501a47bbd5db4c1ee9b037218142ecd79`.
- [RESEARCH_NOTE.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/RESEARCH_NOTE.md), SHA256 `8fed14408de9e92204cb9e5c744a6a9bcbbbd59d5bf9573f655a936105a5f418`.
- [PROPOSED_MODELS.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/PROPOSED_MODELS.md), SHA256 `7b5552daeaab3d252e2347200c901dd1e0134f6e75669f6715f0d6d913a6f1f2`.
- [source_schema.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/source_schema.json), SHA256 `7e2e02b29faef40b1df42cf4131f1553701f13b0560ea1b97edcf4ce5c7afdeb`.
- [development_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/results/development_summary.json), SHA256 `802069a0c67d05348de660e907922df0a844b9f61c971bcba714c63187b15dbb`.
- [holdout_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/results/holdout_summary.json), SHA256 `457a24bd90377f24aefb21425efe727c3803191fc5e2378b5a6296ebea1b7750`.
- [selection_decision.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/selection_decision.json), SHA256 `5c0c4943025839e814d7645ff9510420ba791d4eb4d37b19ffa6d2806c8864a8`.
- [trial_status_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/trial_status_summary.json), SHA256 `5fcb5b3659e342f86735bbe375ce81b82f1f0eff1b9ec19524a7323677892ae0`.
- [registry_map.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/registry_map.json), SHA256 `0720c50bfdea992945ae74edb32420b2e5dbc33cf011c73ff50ac999608a9906`.
- [audit_chronology_correction.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/audit_chronology_correction.json), SHA256 `b3eaba870a064494dba7853bbc4ce40e07f0a0c8873d4f4b424432fcbb6dcb65`.
- [holdout_run_record.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/holdout_run_record.json), SHA256 `14e05ce168b9e740cea80af7db93948dcb0709d2385fcd5f8431560c0141c289`.
- [source_failures.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/urea/source_failures.json), SHA256 `808a52a644ab945655c9f51e1605130186adbd928e18874d486dd0f6070ce81e`.

**plain rules**: ["At target-month start, use source month t−2 or earlier under the declared month-end plus eight-day availability assumption.", "Fit expanding ridge models with fixed alpha 10: urea and gas changes; add grains and affordability; add calendar season. Lags two, three and four form nine configurations.", "Select the lowest 60-month validation MAE before later data; report zero-change, seasonal and lagged persistence baselines."]

**splits**: {"target_history_start": "1997-01", "primary_development_OOS_dates": ["2002-02", "2025-02"], "primary_development_OOS_months": 277, "selection_validation_dates": ["2020-03", "2025-02"], "selection_validation_months": 60, "holdout_dates": ["2025-03", "2026-08"], "holdout_months": 18, "source_exposure": "June–August2026 and2025 summary values seen duringPDF discovery premodel; sealed computationally,not investigator-blind/prospective."}

**costs timing**: {"MFV": {"size_short_tons": 10, "tick_dollars": 10, "paired_planning_RT_costs": [26, 52, 104], "launch": "2025-06-02", "first_expiry": "2025-07"}, "UFV": {"size_short_tons": 100, "tick_dollars": 25, "paired_planning_RT_costs": [56, 112, 224]}, "10MFV_exposurematched_to1UFV_RT_costs": [260, 520, 1040], "cost_arithmetic_scenarios": 27, "quote_margin_access": "unverified;no fractional futures; oldUFVnotMFVhistory"}

**exact reported metrics**: {"holdout_primary_lag2_all_baseline_comparisons": [{"model": "M1", "lag": 2, "forecast_trial": "U01", "split": "holdout", "baseline": "baseline_zero", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.13176038752101718, "rmse": 0.18024229960625682, "baseline_mae": 0.1273236363941501, "baseline_rmse": 0.18586241103146753, "relative_mae_improvement": -0.034846248917462797, "usd_mt_mae_expost": 71.23438887304108, "baseline_usd_mt_mae_expost": 69.2611111111111, "direction_accuracy": 0.3888888888888889}, {"model": "M1", "lag": 2, "forecast_trial": "U01", "split": "holdout", "baseline": "baseline_persistence", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.13176038752101718, "rmse": 0.18024229960625682, "baseline_mae": 0.2103304656711455, "baseline_rmse": 0.28227554185881093, "relative_mae_improvement": 0.37355538532859855, "usd_mt_mae_expost": 71.23438887304108, "baseline_usd_mt_mae_expost": 118.36533635338664, "direction_accuracy": 0.3888888888888889}, {"model": "M1", "lag": 2, "forecast_trial": "U01", "split": "holdout", "baseline": "baseline_season", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.13176038752101718, "rmse": 0.18024229960625682, "baseline_mae": 0.12931340887982762, "baseline_rmse": 0.19085973009912396, "relative_mae_improvement": -0.018922853108478188, "usd_mt_mae_expost": 71.23438887304108, "baseline_usd_mt_mae_expost": 70.62433990287144, "direction_accuracy": 0.3888888888888889}, {"model": "M2", "lag": 2, "forecast_trial": "U02", "split": "holdout", "baseline": "baseline_zero", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.12714621776608215, "rmse": 0.17627194782728853, "baseline_mae": 0.1273236363941501, "baseline_rmse": 0.18586241103146753, "relative_mae_improvement": 0.0013934461274630605, "usd_mt_mae_expost": 67.46311502899314, "baseline_usd_mt_mae_expost": 69.2611111111111, "direction_accuracy": 0.5555555555555556}, {"model": "M2", "lag": 2, "forecast_trial": "U02", "split": "holdout", "baseline": "baseline_persistence", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.12714621776608215, "rmse": 0.17627194782728853, "baseline_mae": 0.2103304656711455, "baseline_rmse": 0.28227554185881093, "relative_mae_improvement": 0.3954931000586621, "usd_mt_mae_expost": 67.46311502899314, "baseline_usd_mt_mae_expost": 118.36533635338664, "direction_accuracy": 0.5555555555555556}, {"model": "M2", "lag": 2, "forecast_trial": "U02", "split": "holdout", "baseline": "baseline_season", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.12714621776608215, "rmse": 0.17627194782728853, "baseline_mae": 0.12931340887982762, "baseline_rmse": 0.19085973009912396, "relative_mae_improvement": 0.016759214164398517, "usd_mt_mae_expost": 67.46311502899314, "baseline_usd_mt_mae_expost": 70.62433990287144, "direction_accuracy": 0.5555555555555556}, {"model": "M3", "lag": 2, "forecast_trial": "U03", "split": "holdout", "baseline": "baseline_zero", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.130331770124502, "rmse": 0.18092881970779218, "baseline_mae": 0.1273236363941501, "baseline_rmse": 0.18586241103146753, "relative_mae_improvement": -0.023625886092663695, "usd_mt_mae_expost": 69.31668052312816, "baseline_usd_mt_mae_expost": 69.2611111111111, "direction_accuracy": 0.4444444444444444}, {"model": "M3", "lag": 2, "forecast_trial": "U03", "split": "holdout", "baseline": "baseline_persistence", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.130331770124502, "rmse": 0.18092881970779218, "baseline_mae": 0.2103304656711455, "baseline_rmse": 0.28227554185881093, "relative_mae_improvement": 0.38034763671242244, "usd_mt_mae_expost": 69.31668052312816, "baseline_usd_mt_mae_expost": 118.36533635338664, "direction_accuracy": 0.4444444444444444}, {"model": "M3", "lag": 2, "forecast_trial": "U03", "split": "holdout", "baseline": "baseline_season", "n": 18, "first": "2025-03", "last": "2026-08", "mae": 0.130331770124502, "rmse": 0.18092881970779218, "baseline_mae": 0.12931340887982762, "baseline_rmse": 0.19085973009912396, "relative_mae_improvement": -0.007875140354707932, "usd_mt_mae_expost": 69.31668052312816, "baseline_usd_mt_mae_expost": 70.62433990287144, "direction_accuracy": 0.4444444444444444}], "holdout_selected_inference": {"trial_id": "U01", "model": "M1", "lag": 2, "stage": "holdout", "continuous_calendar_subset": true, "n": 18, "candidate_mae": 0.13176038752101718, "baseline_mae": 0.1273236363941501, "candidate_rmse": 0.18024229960625682, "baseline_rmse": 0.18586241103146753, "mae_improvement": -0.004436751126867095, "relative_mae_improvement": -0.03484624891746292, "direction_accuracy": 0.3888888888888889, "block_length": 6, "bootstraps": 2000, "seed": 20261002, "p_value": 1.0, "reason": "nonpositive observed loss benefit cannot pass superiority"}}

**exposure attribution**: MAE measures monthly index log-change error, not a trading return. Unselected M2 and longer-lag advantages cannot replace the candidate after seeing held-back results.

**failure scope**: selected_configuration_and_fixed_proxy_family_failure; blocked_source_hypotheses_not_rejected

**valid retry change**: Use original input and assessment vintages with an appropriate executable granular Gulf contract quote history. Freeze an economically distinct model and new future evaluation.

**untested future**: ["Causally available USimport/plantingfeatures", "MFVoriginalquote/assessment collector"]

**prior exposure**: Retrospective historical study. Computational sealing is not prospective blindness; lane-specific incidental exposure remains documented. This log reads only released summaries.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
