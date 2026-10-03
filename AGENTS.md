# QORE

## Strategy mandate

Build a higher-risk symphony of theory-driven, niche and creative strategies that target market-beating returns, accept greater volatility for greater reward, explore unconventional data and arbitrage opportunities, avoid concentration in repeated approaches, earn inclusion through rigorous training and chronological walk-forward testing with genuinely withheld data and overfitting controls, admit underperformers only for exceptional stability and portfolio benefit, and never reject strong results merely because they are strong when sound testing supports them.

## Hub implementation

Build a professional desktop strategy research and portfolio hub, designed for 12–24 diverse strategies. Favor lean typed contracts, pure target logic, useful visual tools and creative hypotheses. High returns require sound evidence, not arbitrary rejection.

- Default to local paper simulation. The hub has no broker submission path; live setup/use and deployment need separate authorization.
- Preserve the existing NGAS engine and accounting/security contracts. Integrate through isolated adapters; never silently change deployed runtime.
- A shared clock exposes only available information. Freeze code/data hashes, splits, parameters, timing and costs before outcomes; retain negative, blocked and skipped trials and explicit retry conditions.
- Never read protected GEFS targets or unreleased heldouts. Label exposed historical data honestly; test reruns are not fresh evidence.
- Reconcile sleeve cash/positions/NAV/P&L to one net account. Deduct costs once; exclude deposits from profit and value external flows for TWR.
- Keep connectors capability-specific; unsupported products and unconfigured brokers must be explicit. No arbitrary executable plugins, secrets in UI, or network access from strategies.
- Read the canonical experiment-log JSONL through the hub reader only; its research owner controls writes. Never duplicate or overwrite it.
- Mutable CLI state belongs in ignored `.local/`; the native app uses its dedicated Application Support folder. Keep instructions and README short.
- Validate with `npm run lint`, `npm run build`, `npm run test:hub`, and the two `test:ui-*` checks. Use relevant legacy regressions when their inputs are released; do not unlock hidden data for tests.
- Obtain fresh independent review for broad changes. Preserve unrelated source work. No public push/merge or live-server deployment without authorization.
