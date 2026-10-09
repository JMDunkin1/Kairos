# Rights and warrants contractual parity and deadline mechanics

Stable ID: `niche-rights-warrants-contract-mechanics-20261002-v1`. Status: **completed_mechanics_only_empirical_tests_data_blocked**.

Rights/warrant conservation and deadline mechanics passed synthetic checks. Historical alpha remains untested because essential quotes/contracts are missing. The 11,340 synthetic cells are not market trials.

## What was tested

{
  "empirical_candidate_configurations_tested": 0,
  "empirical_quote_observations": 0,
  "mechanical_study_designs": 2,
  "source_event_studies": 1,
  "rights_synthetic_scenarios": 10368,
  "warrant_synthetic_scenarios": 972,
  "total_synthetic_scenarios": 11340,
  "registered_declared_variants": 11341,
  "types": {
    "mechanical_sensitivity": 11340,
    "source_diagnostic": 1
  },
  "registered_groups_excluding_source_placeholder": 3,
  "declared_variants": 11341
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
- [README.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/rights_warrants/README.md), SHA256 `eb2e28b1108bd4e0d63cd586020573d7a07df5ca3f253fcc5766858480e9c70c`.
- [SOURCE_PLAN.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/rights_warrants/SOURCE_PLAN.md), SHA256 `f32df8dbdb020f9c16e497ac22b7d6de76119ff04a4b695969ce7d31fcc216b3`.
- [algebra_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/rights_warrants/derived/algebra_summary.json), SHA256 `a4e9a608d43891f5191a124f7d315ae52d60747445e5027daa53d3b476b866b9`.
- [source_summary.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/rights_warrants/derived/source_summary.json), SHA256 `44ab646f05e8b12be98c2465e426ceb34f3f23ccbf635b327fbd6ede06157510`.
- [source_manifest.jsonl](/Users/jamesdunkin/Documents/Codex/2026-10-02/task/niche_markets_20261002/rights_warrants/source_manifest.jsonl), SHA256 `6b7a84092bb28fb57ad92cd15c5f31577dd2c41bcaae215f960e4322b479a9a3`.

**plain rules**: ["Check theoretical ex-rights stock price and fixed-subscription-price parity, including whole-share sizing, costs and hypothetical delivery stress.", "Check warrant exercise eligibility, amendments, cashless delivery, expiry, calls and broker deadlines before interpreting intrinsic value.", "Retain all 10,368 rights and 972 warrant mechanical scenarios. No empirical quote forecasts or trading P&L were tested."]

**splits**: {"proposed_terms_reserve": "2025", "actual_statistical_holdout_tested": false, "prior_exposure": "2025BRWrights-terms snippet andLucidstockclose seen in source discovery;notcleanheldoutterms/priceevidence.", "walk_forward": null, "selection": null}

**costs timing**: {"planning_spread_impact_RT_pct": [1, 3, 10], "planning_fee_dollars": [2, 5, 10], "capacity_dollars": [2000, 100000], "capacity_reserves_full_costs": true, "cash_availability": "T+1planning;broker/agentdeadline andactualdeliveryunverified", "borrow": "No nakedshortleg assumedavailable"}

**exact reported metrics**: {"algebra": {"rights": {"scenarios": 10368, "identity_max_absolute_error": 4.547473508864641e-13, "parity_max_absolute_error": 8.881784197001252e-16, "capacity_zero_cases": 3888, "profitable_synthetic_cases": 0, "note": "No empirical prices; at theoretical parity exercising and liquidating has zero gross edge before delay/cost. Delay0 neutralizes adverse-move parameter. Delay1/2 use same declared move stress, not estimated volatility."}, "warrants": {"scenarios": 972, "note": "Value calculation is conditional intrinsic, not warrant option fair value or a tradable lower bound. No warrant purchase price/contract verified. Stock delivery delay alone has no modeled price change; delay1/2 require future synchronized quotes. Expiry0/call$0.01 branches apply only to corresponding hypothetical contract provisions, not every listed warrant."}, "source_only": true, "alpha_tests_run": 0, "empirical_trade_observations": 0, "interpretation": "11340cost/lag mechanicalscenario cells, not11340fitted models or11340independent empirical observations."}, "source_checks": {"rights_matching_index_documents": 469, "rights_matching_index_unique_CIKs": 172, "rights_frozen_screening_documents": 90, "rights_original_terms_downloaded": 0, "rights_eligibility_verified_events": 0, "rights_screening_status": "unrun: Archives403 stoppedbeforefirstdocument;90unknown—not90ineligible", "warrant_fixed_CIK_cases": 6, "warrant_completed_search_queries": 11, "warrant_planned_search_queries": 12, "warrant_index_hits": 57, "warrant_unique_matching_documents": 57, "warrant_frozen_filing_candidates": 21, "historical_submission_rows_2016_2024": 3653, "submission_rows_with_acceptance_datetime": 3653, "issuer_original_event_notices": 2, "issuer_web_extraction_event_notices": 1, "unique_instruments_with_terms_notices": 2, "raw_success_snapshots": 28, "raw_success_bytes": 1773690, "logged_source_failures": 6, "empirical_quote_observations": 0, "alpha_tests": 0, "statistical_holdout_claim": false, "trade_gate": "NO_TRADE", "current_empty_ticker_case_count": 3, "note": "Currentnames/tickers are explicitly non-PIT annotations. Allsource/grids retrospective. No source completeness, predictability, tradableprofit, or blind validation claim."}}

**exposure attribution**: Buying at constructed parity creates zero gross edge before costs. Negative synthetic net values follow costs and stress assumptions, not measured trading losses.

**failure scope**: mechanical_check_pass_and_empirical_data_block; no empirical strategyfailure inferred

**valid retry change**: Collect a dead-inclusive instrument master, original contracts and amendments, synchronized quotes, and exercise, delivery and borrow states. Freeze price rules before future outcomes.

**untested future**: ["Prospective rights/warrant lifecycle collector", "Actual transferable-rightquote test", "Cashlesscall cutoff test"]

**prior exposure**: Retrospective historical study. Computational sealing is not prospective blindness; lane-specific incidental exposure remains documented. This log reads only released summaries.

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
