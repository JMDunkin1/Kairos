# Natural-gas simplification experiment — September 27, 2026

## Decision

The original summer rules won the frozen structural comparison on 2021–2023 training. Removing automatic summer shorts improved the recent outage replay but underperformed in 2024 validation and 2025 reporting. No challenger has established a reason to replace the running paper strategy. All changes in this study are research-only; the production strategy, broker routes, risk checks, and paper service were left unchanged.

## Chronological separation

- Structural selection: January 2021–December 2023 only. Candidate rules and ranking criterion were frozen before calculating outcomes.
- Validation: calendar 2024, with no search for a different candidate after seeing it.
- Withheld from this fitting: calendar 2025, with additional reporting through March 31, 2026. These dates never rank the candidates.
- The July 27–September 25, 2026 outage is retrospective explanatory reporting only. It motivated the hypotheses and is not an independent test.
- Earlier development already examined these historical years, and inherited summer parameters used 2024. This is exclusion from the present fitting, not pristine unseen evidence.
- Winter retains its own original later fitting dates, including validation through October 2025. The table below isolates summer changes by holding the index fallback outside summer. All-year ledgers with winter unchanged are retained separately; they are not labeled fully held out in 2025.
- The protected GEFS reforecast 2017–2019 holdout was not opened.

## Historical comparison

Returns include the UNG allocation, index fallback, 2% cash reserve, drift, overnight returns, deadband and modeled costs. Training spans three years; other columns each span one year.

| Variant | Training 2021–2023 | Validation 2024 | Withheld from fitting: 2025 |
|---|---:|---:|---:|
| Current summer rules | +53.99% | +31.24% | +37.96% |
| Use UNG for price signals | +51.72% | +27.76% | +35.09% |
| Remove summer automatic shorts | +43.94% | +21.84% | +28.45% |
| No shorts + forecast revisions | +54.78% | +24.96% | +12.96% |
| No shorts + storage filter | +48.67% | +24.61% | +26.77% |
| No shorts + revision + storage | +49.20% | +24.61% | +18.09% |
| No shorts + storage/production/LNG filter | +48.67% | +22.53% | +25.43% |
| Index fallback | +32.81% | +24.61% | +18.09% |

The revision and supply extensions were frozen diagnostics, not additional selection candidates. The revision-only extension has only two active episodes in 2024 and loses to fallback in 2025. The storage rule makes no summer gas trades in 2024, so its matching fallback return is not evidence of profitable gas trading. The production/LNG extension underperforms fallback in 2024. Combining UNG pricing with no shorts equals the no-short result because the modified price input only affects the disabled summer reversal gate. The optional all-year long-only diagnostic also remains unselected.

## Recent-period counterfactual

Every variant begins with identical actual holdings and $97,830.27 at the July 24 close. All reach the same $100,033.58 at the August 26 close, making the last-month comparison equal-start as well. P&L below is total portfolio change, including fallback holdings and costs, not gas-only profit. These are hypothetical daily-open fills; historical intraday fills cannot be recovered.

| Variant | Aug 27–Sep 25 P&L | July 27–Sep 25 P&L | Full-period ending equity |
|---|---:|---:|---:|
| Current strategy | $-2,464.79 | $-261.48 | $97,568.79 |
| Remove automatic summer shorts | $-996.65 | $+1,206.66 | $99,036.93 |
| Use UNG for price signals | $-994.63 | $+1,208.68 | $99,038.95 |
| No shorts + forecast revisions | $-996.65 | $+1,206.66 | $99,036.93 |
| No shorts + storage filter | $+1,661.14 | $+3,864.45 | $101,694.72 |
| No shorts + storage/production/LNG filter | $+1,661.14 | $+3,864.45 | $101,694.72 |
| Index fallback | $+1,661.14 | $+3,864.45 | $101,694.72 |

The revision filter retains all eight long sessions: the heat revisions were genuinely positive and broad. The storage and supply filters avoid all recent gas entries and remain invested in the fallback; their improvement here comes from avoiding losing gas exposure. The no-short version still loses on its long gas trades and trails fallback by $2,657.79 over the full outage. All three frozen cost scenarios were evaluated.

## What the new filters actually test

- Revision: compare yesterday’s lead-8 forecast with today’s lead-7 forecast for the identical weather target. Both GFS and GEFS must show positive cooling-demand revisions; their equal-weight average must be at least 1°F of cooling-degree-day change, with at least two-thirds of the location weight rising by 0.25°F or more. Apply to existing long targets, without rescheduling suppressed signals.
- Storage: suppress heat longs when the latest causally released storage observation is above the existing seasonal five-year comparison.
- Supply balance: suppress heat longs only when storage is above that comparison AND the latest available EIA vintage’s year-over-year dry-production increase exceeds its LNG-export increase, measured in Bcf/day. This is a partial gas balance, not a full demand model.
- Supply observations come from 70 archived EIA STEO vintages (December 2020–September 2026), using same-vintage monthly comparisons. Release-day inputs are admitted only on later dates; correction notices conservatively delay availability. These are published estimates, not finalized observations.

## Data and verification limits

Historical summer forecasts use the retained legacy midnight snapshot. The recent replay uses corrected 06/12/18/24 UTC daily sampling. Results from these different input contracts must not be represented as one validated live track record. No corrected historical multi-year backfill or retraining of production artifacts occurred.

Baseline checks reproduced 585 summer targets and 1,316 historical all-year allocations. The recent baseline reproduced the earlier outage replay, and an independent cash/share ledger reconciled every variant. Tests cover future-data poisoning/removal, pre-open price exclusion, storage publication timing, exact no-short behavior, complete weather atoms and matched weather targets.

## Files and reproduction

- `docs/research/ngas-simplification.md` and its frozen protocol describe the historical runner.
- `docs/research/ngas-demand-overlay-protocol.json` freezes the demand extensions.
- `scripts/collect-ngas-simplification-revisions.py` retrieves historical matching lead-8 atoms.
- `scripts/collect-ngas-supply-vintages.py` retrieves archived EIA monthly workbooks; requires Python with openpyxl.
- `node scripts/research-ngas-demand-overlays.mjs` rebuilds demand targets and metrics after the historical study and recent base replay.
- `node scripts/replay-ngas-simplification-outage.mjs --extra-targets=.local/qore/research/ngas-simplification/recent-extra-targets.json` rebuilds the recent comparison from retained inputs.
- Ignored detailed inputs, features, targets, costs and curves remain in `.local/qore/research/ngas-simplification/` and `.local/qore/outage-counterfactual/`.

Primary supply archive: https://www.eia.gov/outlooks/steo/outlook.php. Specific vintage URLs, workbook hashes, cell references, release dates and correction notices are retained with every supply observation.

## Forward measurement

A thread heartbeat named `QORE forward strategy comparison` is active at 09:00 and 17:00 America/New_York, Monday through Friday. It uses this retained worktree. Before the open it refreshes public inputs and appends frozen candidate predictions; after the close it settles only previously recorded predictions, including the same fallback and costs. Commands and integrity checks are in `ngas-simplification-forward.md`. Missing observations, incompatible source versions and unavailable candidates are reported explicitly. No research automation can submit orders.

The prospective start is September 28, 2026. Today's real public-data preparation and full candidate calculation passed in diagnostic mode, with no predictions fabricated for Sunday. There are no forward returns yet. Records are locally sealed and append-only, without an external timestamp/notary guarantee. The automation notifies on the first forward outcome, meaningful changes, or failures requiring attention.

Validation completed: `npm run lint`, `npm run build`, full `npm test`, and the four focused simplification/replay/demand/forward test scripts. An independent subagent reviewed the historical fitting, supply vintages, recent accounting and forward record/settlement integrity. The paper supervisor process was separately confirmed running on m1-server.
