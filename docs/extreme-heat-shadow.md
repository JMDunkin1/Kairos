# Extreme-heat treatment shadow

## Status

This is a focused, historical research shadow of `ngas-all-year-beta`. It does not modify the Summer optimizer, selected component or all-year artifacts, live inference, dashboard telemetry, readiness, broker handoffs, or order routing. Every candidate is execution- and promotion-ineligible, and all three requested gates are rejected for inclusion.

The study was prompted by the supplied observation that two heat signals lost roughly $440 during July 15–24, 2026 while record heat was anticipated and supply remained abundant. The checked all-year comparator ends on July 14, 2026. The incident is therefore context, not an outcome silently backfilled into the research ledger.

## Question

The narrow question is whether selected `summer-heat-long` exposure should be reduced, vetoed, delayed, or faded when the forecast is unusually hot but causal market and storage state suggest that the demand effect may already be absorbed.

An extreme-heat row requires both:

- cooling-demand anomaly of at least 8F; and
- at least eight reviewed locations with an extreme cooling-demand anomaly.

The study also checks aggregate-anomaly thresholds of 6F with at least six and 10F with at least ten locations. The retained ledger precomputes every location count at the fixed 8F per-location threshold, so these are partial regime sensitivities rather than fully redefined 6F/10F location tests.

## Tested treatments

The frozen 16-member family tests:

- full veto, 25% retention, and 50% retention;
- first selected session only, or skipping the first selected session;
- full or half veto when causally released EIA storage is not below its five-year seasonal average;
- full or half veto when the latest completed `NG=F` issue-session return is positive;
- three-session `NG=F` already-priced gates at 0% and 2%;
- a combined storage-deficit and non-positive-issue-return proxy for unexpected heat;
- 10% and 20% gas-short fades only when both storage is above seasonal average and the issue-session `NG=F` return is positive; and
- broader and narrower aggregate/count sensitivities using the ledger's fixed 8F per-location extreme count.

The three focal rows are the storage-deficit gate, issue-price veto, and three-session price veto. For them, a missing required observation fails closed to the index basket. The storage comparison is strictly below zero; equality is not a deficit. Flat price passes because both price rules veto only a positive return.

The price session grid is the authoritative VOO/QQQM execution-session grid. The focal issue-price rule requires a completed session on the issue date itself. Five of 16 historical issues fall on weekends or holidays; that observation is unavailable and the focal gate fails closed. A separate sensitivity maps those issues to the preceding completed session and labels the result as an anticipatory-pricing proxy, not a reaction to the newly issued forecast. The three-session rule compounds the three authoritative close-to-close sessions ending on the latest completed session on or before the issue date. Duplicate or missing required `NG=F` closes invalidate the context, and no target-session close is used.

Storage is independently reconstructed from the EIA series and versioned release calendar at every affected session open. A normal Thursday 10:30 New York release is therefore first available at Friday's open. All 48 extreme-heat held rows match the reconstructed report, five seasonal peers, average, and deviation. Release timing is causal, but the checked EIA values are current-vintage and later historical revisions cannot be excluded.

Released gas exposure returns to the existing VOO/QQQM index basket. Every focal alternative is replayed through the shared causal UNG/VOO/QQQM execution engine under baseline, elevated, and stress friction. The audit also checks 1/5/10/20/60-session centered circular blocks with exact remainders, fixed-candidate and family-adjusted inference, ten-session-embargoed causal episodes, exact episode sign flips, leave-one-changed-year deletion, removal of the best one and three episodes, an extra-session price-lag negative control, an alternative storage-season match, and the partial aggregate/count regime sensitivities described above.

## What cannot be reconstructed

The exact economic claim is stronger than the retained history:

- Historical Summer calendars do not retain complete same-target lead-8 and lead-7 forecast vintages, so a true fresh multi-model demand revision cannot be reconstructed.
- The historical extreme rows use the legacy hours-0 Summer temperature snapshot, not the corrected four-sample target-local-day contract; the regime itself has not been reproduced under the executable temporal input.
- Kairos does not retain point-in-time production forecasts or production-surprise vintages for 2021–2025.
- A causal estimate of what the futures curve had already priced would require a separately reviewed curve and fundamentals history, not a fitted residual over revised data.
- Live inference does not currently carry the historical `coolingDemandExtremeCount` field needed to reproduce the 8F/eight-location definition.

Those missing features are not replaced with later actuals or synthetic values. The existing `spatial-demand-revision-breadth-price-gate-v1` prospective shadow is the exact lane for lead-8-to-lead-7 GFS/GEFS demand revisions plus an issue-session price veto.

## Results

The baseline replay ties the 1,387-session all-year ledger through July 14, 2026 within the checked four-decimal ledger-rounding tolerance; the maximum daily difference is below 0.00005 percentage points.

| Requested gate | Changed forecasts | Independent causal clusters | Increment through 2024 | Increment in 2025 | Full increment |
| --- | ---: | ---: | ---: | ---: | ---: |
| Storage deficit | 9 | 4 | +8.67 pp | -2.42 pp | +6.25 pp |
| Issue price did not rise | 11 | 8 | +1.95 pp | +3.76 pp | +5.71 pp |
| Three-session price did not rise | 11 | 9 | +0.60 pp | +3.76 pp | +4.35 pp |

“Increment” is the sum of daily return differences versus the active comparator after causal execution and friction; it is not a dollar forecast.

The storage gate is the descriptive through-2024 leader. Its fixed block-10 p-value is 0.019 and its three-requested-rule family-adjusted value is 0.143, but the complete 16-rule sensitivity-family value is 0.401. More importantly, it reverses in report-only 2025, has only four independent causal clusters, exceeds the 50% top-episode concentration reference in the selection prefix, and becomes negative after removing the best three clusters.

The issue-price and three-session gates have fixed block-10 p-values of 0.364 and 0.480 and requested-family adjusted values of 0.586 and 0.699. The exact-session issue rule changes six forecasts because price rose and five because the issue-date observation is unavailable; the separate preceding-session proxy changes ten forecasts and adds only +0.44 points through 2024 and +4.20 points over the full ledger. Both focal price rules fail leave-one-changed-year stability. Their apparent 2025 gains come from one independent cluster, and removing their best three clusters makes the full result negative. Their extra-session-lag controls add +7.67 and +2.39 points through 2024, versus +1.95 and +0.60 for the intended timing, so the historical result is not specific to the proposed price window.

All cost scenarios leave the focal full-period increments positive because the vetoes reduce turnover relative to the active comparator. That friction robustness does not overcome the sample, timing-specificity, regime-reproducibility, multiplicity, and prospective-evidence failures.

## Decision

Do not include any of the three requested gates. The audit contains only 16 extreme forecasts in total, 9–11 changed forecasts per gate, and 4–9 independent causal clusters. The historical inputs were development-visible, none represents the corrected executable Summer calendar, and the current one-candidate prospective registry forbids promotion from this post-hoc family.

The most credible next test remains the narrower prospective rule already isolated in Kairos: require a material same-target multi-model demand revision, broad location agreement, and no same-direction issue-session price move. Reconsideration requires a separately sealed candidate, corrected Summer temporal coverage, at least 15 independent changed Summer episodes across two complete prospective Summers, positive leave-one-season-out evidence, acceptable family-adjusted inference, live parity, and a restarted prospective validation window. Until then, storage and recent price are diagnostics, not executable vetoes.

Reproduce the audit with:

```bash
node scripts/evaluate-qore-extreme-heat-shadow.mjs \
  --output=data/qore/research/extreme-heat-shadow-audit.json
node scripts/test-qore-extreme-heat-shadow.mjs
```
