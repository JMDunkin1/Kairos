# NYISO Zone J day-ahead versus real-time spread

Stable ID: `niche-power-nyiso-zone-j-20261002-v1`. Status: **completed_selected_forecast_failed_no_trade**.

Selected NYISO calendar/AR proxy failed held-back forecast comparisons. No executable power edge; actual issued-load and PJM ideas remain untested.

## What was tested

{
  "economic_primary_designs": 3,
  "candidate_configurations_including_latency": 9,
  "latency_variants_additional": 6,
  "registered_variants": 61,
  "completed_variants": 58,
  "blocked_variants": 3,
  "candidate_by_stage_evaluations": 18,
  "candidate_prediction_rows": 25242,
  "types": {
    "candidate": 3,
    "latency_diagnostic": 6,
    "baseline": 3,
    "descriptive_deletion": 39,
    "cost_arithmetic": 3,
    "blocked_candidate": 3,
    "baseline_latency_bookkeeping": 4
  },
  "registered_groups_excluding_source_placeholder": 61,
  "declared_variants": 61
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
- [FINDINGS.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/FINDINGS.md), SHA256 `c3ff7ad1a0df3bf91468bb60d82677faa2d13760f22e9d6dd8c83dd807837a90`.
- [FROZEN_CANDIDATES.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/FROZEN_CANDIDATES.json), SHA256 `bbcd3c315fc1dabfddee0b9813433d903af587589c143a630274b2cab9d03f63`.
- [development_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/results/development_summary.json), SHA256 `c6e2eef0a501b69a3aea00cfffcf2d43c015bde482bdb2ec7f523b5874d13666`.
- [holdout_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/results/holdout_summary.json), SHA256 `caf14e0de695171dcc9c066eb1ea40a4ca61ba8df829a12cc49e99896de804d3`.
- [selection.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/results/selection.json), SHA256 `0a0eb7f3b51dd8fa54fe7cb85a8e3bd1b0cfa2351a78dd6a1275e5352869e4db`.
- [pre_run_record.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/power/pre_run_record.json), SHA256 `3d066581f6fe2fdd8bfdc038d3f58cfa8f57fb3b6661876f025db76e256503ed`.

**plain rules**: ["At 05:00 Eastern on day t−1, forecast delivery-day t day-ahead minus real-time electricity prices using prices from t−2 or earlier.", "Compare three expanding ridge models: lagged spreads and calendar; add archived load forecasts; add lagged daytime/offday structure. Fixed extra delays are one and two days.", "Select the lowest development MAE before the held-back evaluation. Report zero spread, last available spread and seasonal mean baselines."]

**splits**: {"development_valid_days": 2829, "development_common_origins": 2431, "minimum_prior_training_labels": 365, "holdout_source_days": 365, "holdout_start": "2025-10-01", "holdout_end": "2026-09-30", "holdout_common_origins_latency0": 363, "holdout_missing_comparison_dates": ["2026-03-13", "2026-07-19"], "latency1_and2_holdout_rows_each": 365}

**costs timing**: {"profit_not_tested": true, "planning_roundtrip_dollars_per_MWh": [0.5, 2, 5], "January2026_NJY_full_lot_MWh": 336, "planning_full_lot_costs": [168, 672, 1680], "fees_margin_quotes": "unverified; no fractional futures"}

**exact reported metrics**: {"holdout_latency0": {"candidate": {"C1": {"n": 363, "candidate_mae": 15.94769354711357, "baseline_mae": 15.20929267423889, "candidate_rmse": 46.84896085155087, "baseline_rmse": 45.734839036525244, "mae_improvement": -0.7384008728746804, "relative_mae_improvement": -0.04854932367271522, "direction_accuracy": 0.5151515151515151, "block_length": 14, "p_value": 1.0, "reason": "deletion diagnostic or gapped calendar; descriptive only; no bootstrap across gaps", "calendar_gaps": 2, "stage_first": "2025-10-01", "stage_last": "2026-09-30", "concentration": {"total_positive_loss_benefit": 561.6387585996056, "top3_share_of_positive_benefit": 0.09655016843081185, "net_loss_benefit": -268.039516853509}}, "C2": {"n": 363, "candidate_mae": 16.00648804798359, "baseline_mae": 15.20929267423889, "candidate_rmse": 46.995211886396305, "baseline_rmse": 45.734839036525244, "mae_improvement": -0.797195373744701, "relative_mae_improvement": -0.05241501960804331, "direction_accuracy": 0.49586776859504134, "block_length": 14, "p_value": 1.0, "reason": "deletion diagnostic or gapped calendar; descriptive only; no bootstrap across gaps", "calendar_gaps": 2, "stage_first": "2025-10-01", "stage_last": "2026-09-30", "concentration": {"total_positive_loss_benefit": 604.1048954254866, "top3_share_of_positive_benefit": 0.08112176122477956, "net_loss_benefit": -289.38192066932646}}, "C3": {"n": 363, "candidate_mae": 15.005889321910198, "baseline_mae": 15.20929267423889, "candidate_rmse": 44.37570231686381, "baseline_rmse": 45.734839036525244, "mae_improvement": 0.20340335232869386, "relative_mae_improvement": 0.013373623394940203, "direction_accuracy": 0.5234159779614325, "block_length": 14, "p_value": 1.0, "reason": "deletion diagnostic or gapped calendar; descriptive only; no bootstrap across gaps", "calendar_gaps": 2, "stage_first": "2025-10-01", "stage_last": "2026-09-30", "concentration": {"total_positive_loss_benefit": 722.1359324084381, "top3_share_of_positive_benefit": 0.2008244382937015, "net_loss_benefit": 73.83541689531587}}}, "baselines": {"B0": {"n": 363, "mae": 14.803821763626047, "rmse": 45.963165668041306}, "B1": {"n": 363, "mae": 21.088609298920804, "rmse": 55.69242435349079}, "B2": {"n": 363, "mae": 15.20929267423889, "rmse": 45.734839036525244}}, "latency_days": 0}, "development_selected_mae": 8.223267468859165, "development_reported_zero_mae": 7.9018, "development_reported_seasonal_mae": 8.5544}

**exposure attribution**: Forecast loss only. Unselected C3 had a small seasonal advantage but lost against zero, episode deletions and extra latency; it was never reselected.

**failure scope**: configuration_and_fixed_forecast_family_failure; source-blocked hypotheses not rejected

**valid retry change**: Collect original forecast issuance vintages and time-stamped quotes for the appropriate delivery contract or virtual bid, with fees, credit and execution latency. Freeze a new design and future evaluation.

**untested future**: ["Original-issued PJM forecasts", "Prospective NYISO issued-load errors linked to actual executable instruments"]

**prior exposure**: Retrospective historical study. Computational sealing is not prospective blindness; lane-specific incidental exposure remains documented. This log reads only released summaries.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
