# Summer simplification research

This standalone experiment compares the selected baseline with three fixed Summer changes: disable automatic fades, measure the fade rally with UNG instead of NG=F, and combine both. A fifth all-year-long-only row is diagnostic only. Production inference, broker settings, orders, public strategy artifacts, and deployment are unchanged.

Run from the repository root with installed package dependencies:

```bash
node scripts/research-ngas-simplification.mjs
node scripts/test-qore-simplification.mjs
```

The runner copies the checked-in `ngas-simplification-protocol.json` to the ignored study directory if absent, before reading the outcome inputs. An existing local protocol must match exactly. Its recorded rule-freeze time predates the first result calculation in this study but is not externally attested. Do not describe local files as tamper-proof or their timestamps as immutable.

Outputs live in `.local/qore/research/ngas-simplification/`: target allocations with issue dates, enriched forecast rows, daily portfolio and fallback returns, split/year/cost summaries, source/input hashes, a training selection lock, and a readable report. A compact checked-in `data/qore/research/ngas-simplification-audit.json` retains the principal metrics and reconstructable artifact hashes.

Eligible variants are ranked only on cumulative baseline-cost summer-only portfolio return minus the persistent index fallback during 2021–2023. The first-ranked candidate is locked before calculating 2024 validation or 2025+ reporting results. A research nomination requires positive train and 2024 validation edges and at least 20 gas-active validation sessions; a validation failure does not select a replacement. Elevated/stress costs are reporting-only. Winter holdings are set to the fallback for the selection lane, so Summer changes are compared independently from Winter. In the all-year reporting lane, the original Winter targets stay fixed except for the explicit long-only diagnostic.

The baseline won this structural comparison. Disabling Summer fades lost to the fallback during 2024 validation; substituting UNG price confirmation also trailed the original baseline. The combined no-fade/UNG variant equals no-fade alone because the selected Summer contract uses prices only to decide fades (volatility targeting is disabled).

Important limitations:

- Historical Summer uses the legacy instantaneous hours-0 statistic; current live Summer uses the corrected four-sample daily approximation. Historical performance here is a controlled legacy diagnostic, not a full replay of the corrected live input contract.
- The inherited Summer parameters were originally selected with 2021–2024 history. The new structural-variant training selection uses only 2021–2023, but 2024 is not fresh validation of inherited parameters. Summer 2025 is withheld from this fitting only; prior strategy work has already observed these periods.
- Winter was selected on its original train through March 31,2024 and validation through October 31,2025. The all-year 2025 portfolio therefore is not wholly held out. Only its unchanged-Winter/changed-Summer comparison can be interpreted as a controlled allocation comparison.
- Historical reporting stops March 31,2026; absent Summer 2026 forecasts must not be mistaken for intentional fallback. The July 27–September 25,2026 corrected-weather outage replay is reported separately and never selects these variants.
- Three NG-only holiday dates use the preceding completed UNG close in the price-only challenger to retain the original schedule. ETF execution still uses common UNG/VOO/QQQM sessions. This isolates the price change from changing holding-day counts.
- Adjusted-open daily simulation includes overnight holdings, a 2% cash buffer, the frozen 80/20 VOO/QQQM basket, deadband/reduction policy and costs. It cannot reconstruct intraday routing, quote quality, actual fills, or borrow availability.

The research helper exports the reviewed pure scheduler from an isolated in-memory copy with only import resolution changed. It does not edit or replace the production module. Assertions require 585/585 checked Summer target matches and 1316/1316 all-year target matches before any results. Tests mutate future prices/weather/storage, poison current and future closes, remove future rows, and check causal entry dates, no-fade direction, and fallback allocation.
