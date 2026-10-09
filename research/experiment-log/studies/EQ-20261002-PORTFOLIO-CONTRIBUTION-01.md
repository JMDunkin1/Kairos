# Fixed released-ledger portfolio contribution assessment

Stable ID: `EQ-20261002-PORTFOLIO-CONTRIBUTION-01`. Status: **completed_exploratory_released**.

The predeclared25% initial VIX sleeve modestly reduces volatility and improves some carried2026 drawdowns versus matched controls, but worsens combined drawdown, recovery and down-SPY-month losses. Relative-base CAGR39.41%/DD−37.02% becomes35.96%/−39.87%; tech-base41.62%/−42.32% becomes37.70%/−43.70%. Correlations .868/.845 show shared equity exposure. At these fixed weights it is not an exceptionally stable diversifier; no general volatility-hypothesis rejection or CAGR-only exclusion.

## What was tested

{
  "profiles": 11,
  "solo_profiles": 5,
  "fixed_mix_profiles": 6,
  "metric_window_rows": 33,
  "new_economic_designs": 0,
  "nominee_weight_variants": 0,
  "outer_rebalance_variants": 0
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [PROTOCOL.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/PROTOCOL.json), SHA256 `671251dc908ccd36f5b3a09dc857563b3b647bc8f1e5a95e3bd4cd5ed4acc9ea`.
- [FREEZE.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/FREEZE.json), SHA256 `41016a1043ff08ac16ac75b7d4616124063c3f8bbef69b4dbabeec6e1578c4ed`.
- [portfolio_independent_audit.json](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/audit/portfolio_independent_audit.json), SHA256 `e4eb4c344a9e64150d7ca182c7d3cc5f52a4d96627f6574f4f46b2bb6fa7609d`.
- [portfolio_independent_audit.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/audit/portfolio_independent_audit.md), SHA256 `6072e1db156b60fd919002c6e52debf60d09354b1f8ce0a767e99fe0cbb8afc2`.
- [profile_metrics.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/profile_metrics.csv), SHA256 `7703425474f9742691bbc47c6822f6be51d6d46c81a3f24d1d9313888dd6424b`.
- [equities.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/equities.csv), SHA256 `2cb31afc617a0ee0de5c98b73a8beb5419ab0d3f1880ae4942847244b660be6f`.
- [daily_net_returns.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/daily_net_returns.csv), SHA256 `a4de8803e699bb9c465f6ed5f73653b538784e3e3173c9855c0dc43c60edd320`.
- [daily_return_correlations.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/daily_return_correlations.csv), SHA256 `da74235f00409fe8ec260195b5314b38c0e7396d25b987bfdaf724fb152eb33a`.
- [down_market_month_summary.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/down_market_month_summary.csv), SHA256 `63e51dd645d31d83ea04570cfa279a257d900ccc2e8a6ef436004fef5a119ac3`.
- [annual_carried_returns.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/annual_carried_returns.csv), SHA256 `4186fd5b1023289a112f81d08973d75ea94a1ada40827282629710056743af1b`.
- [monthly_net_returns.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/results/monthly_net_returns.csv), SHA256 `303fba82121b69e2a29aef73fee3d8e7256f54c838989e694b2e3997e735063b`.
- [monthly_view_labels.csv](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/monthly_view_labels.csv), SHA256 `5c0ed43e0a62d52bcee4a68afd619bd5907157ed42b79a483e7fef63d984a6cc`.
- [PORTFOLIO_REPORT.md](/Users/jamesdunkin/Documents/Codex/2026-10-02/task-4/research/portfolio_contribution/PORTFOLIO_REPORT.md), SHA256 `218fda1721dcb43155d5d7f7428d90690fd5c4aebfeedddbc00b5f48bf2902d8`.

**costs timing contract**: 75%/25% initial funded sleeve units; no outer rebalance, wealth weights drift. Proportional source entry/terminal/turnover fees retained; no netting discount. Calendar2026 is carried, not a fresh funded reset.

**exposure attribution**: Initial-sleeve-weighted full-combined source mean contract exposure, not dynamic realized beta or window-specific measured exposure. Three mix rules per two bases share substantial market risk.

**historical exposure**: All source ledgers/standalone outcomes were already released and seen. The finite mix plan preceded blend outcomes; no clean historical validation or prospective claim.

**hypothesis conclusion**: The predeclared25% initial VIX sleeve modestly reduces volatility and improves some carried2026 drawdowns versus matched controls, but worsens combined drawdown, recovery and down-SPY-month losses. Relative-base CAGR39.41%/DD−37.02% becomes35.96%/−39.87%; tech-base41.62%/−42.32% becomes37.70%/−43.70%. Correlations .868/.845 show shared equity exposure. At these fixed weights it is not an exceptionally stable diversifier; no general volatility-hypothesis rejection or CAGR-only exclusion.

**valid retry**: No weight optimization on these exposed periods as fresh proof; commit complementary mechanisms and prospective contribution plan.

**untested data**: Prospective portfolio behavior, executable fills, whole shares, broker accounting and actual netted app performance.

**audit status**: PASS;11profiles,33metricviews,dates,returns,underwater/recovery,cost scaling and down-month arithmetic independently reconstructed.
