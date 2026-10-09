# GEFSv12 simple physical-demand-follow12-cell family

Stable ID: `qore-gefs-v12-fixed-model-reforecast-audit-v1`. Status: **released_validation_failed_protected_holdout_unopened**.

The fixed 12-cell physical-demand-follow family failed validation. The protected 2017–2019 GEFS holdout remains unopened; no routing/runtime change.

## What was tested

{
  "rule_family_designs": 1,
  "candidate_configurations": 12,
  "protected_holdout_evaluations": 0
}

Rules, exact windows, selection, costs, availability and source caveats are preserved in this machine record and its original frozen protocol.

## Evidence

- [gefs-v12-reforecast-audit.json](/Users/jamesdunkin/Documents/Local Automations/QORE/data/qore/research/gefs-v12-reforecast-audit.json), SHA256 `e31aa835ecf305c1c6f2e4919a4d70fcd5aac88d2ffce9cd233ac6e11bfe316c`.
- [strategy-audit-2026-07-21.md](/Users/jamesdunkin/Documents/Local Automations/QORE/docs/strategy-audit-2026-07-21.md), SHA256 `210008f28dafd6a6b09b53418bdd7453a74dae8dad7085eac4bcebbd3c7fd360`.

**plain rules**: ["For a broad hot Summer or cold Winter forecast, hold 35% UNG versus cash from the next trading-session adjusted open; otherwise remain in cash.", "Test anomaly 3/5/7°F, breadth 25/50% and hold one/three sessions. Lock the training winner before 2015–2016 confirmation."]

**splits**: {"instrument": "UNG", "comparison": "cash", "execution": "next trading-session adjusted open", "positionFraction": 0.35, "oneWayCostBps": 3.2, "candidateFamilyId": "gefs-v12-physical-demand-follow-12-cell-v1", "candidateCount": 12, "anomalyThresholdsF": [3, 5, 7], "breadthThresholds": [0.25, 0.5], "holdSessions": [1, 3], "directionRule": "summer hot anomaly long; winter cold anomaly long; otherwise cash", "trainEnd": "2014-12-31", "validationStart": "2015-01-01", "validationEnd": "2016-12-31", "hiddenHoldoutStart": "2017-01-01", "hiddenHoldoutEnd": "2019-12-31"}

**costs timing**: {"oneWayBps": 3.2, "execute": "nexttradablesessionadjustedopen"}

**exact reported metrics**: {"family": {"allCandidatesNegativeTrain": true, "trainReturnRangePct": [-44.4533, -3.2773], "positiveAggregateValidationCandidates": 6, "positiveBothValidationYearsCandidates": 2}, "selected": {"candidateId": "a7-b0p5-h1", "anomalyThresholdF": 7, "breadthThreshold": 0.5, "holdSessions": 1, "positionFraction": 0.35, "train": {"sessionCount": 1941, "activeSessions": 218, "entryCount": 126, "totalReturnPct": -3.2773, "cagrPct": -0.4317, "sharpe": -0.0524, "sortino": -0.0725, "maxDrawdownPct": -12.9263, "tradingCostPct": 2.8264}, "validation": {"sessionCount": 504, "activeSessions": 53, "entryCount": 25, "totalReturnPct": 3.0136, "cagrPct": 1.4956, "sharpe": 0.3749, "sortino": 0.5695, "maxDrawdownPct": -4.4538, "tradingCostPct": 0.5767}, "validationByYear": {"2015": {"totalReturnPct": 6.935, "sharpe": 1.4879}, "2016": {"totalReturnPct": -3.6671, "sharpe": -0.9765}}}, "gate": {"requiredFamilyAdjustedPValueMax": 0.2, "observedFamilyAdjustedPValue": 0.683658, "requiredPositiveEachValidationYear": true, "validationYearPositive": {"2015": true, "2016": false}, "passed": false}}

**exposure attribution**: Cash isolates the gas-follow sleeve. The locked 7°F/50%/one-session rule returned −3.2773% in training and +3.0136% in aggregate validation, but −3.6671% in 2016.

**failure scope**: 12-cell_simple_physical_follow_family_failure; currentpriceconfirmation/reversion/storageselectorsnottested

**valid retry change**: A separately frozen, different hypothesis must qualify before any protected target release. Failed validation does not authorize opening 2017–2019.

**untested future**: ["Protected2017–19stillunopenedforanycurrentlyqualifiedhypothesis"]

**audit status**: Source paths and hashes verified as listed. Released documents/summaries were read; underlying raw inputs, prediction ledgers and protected targets were not reopened. Any unverified later audit or source-version binding is flagged separately.
