"""Funded long-only leveraged-ETF NAV proxy with per-asset trading costs.

No source access, synthetic multiple-of-index returns, broker fills, margin,
nominal historical share affordability, or strategy fitting occurs here.
Returns come from the supplied audited total-NAV fund series themselves.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from engine import execution_plan, annual_returns, metrics as _base_metrics

UNIVERSE = ("SPY", "QQQ", "SHY", "TQQQ", "UPRO", "QLD")
LEVERED = ("TQQQ", "UPRO", "QLD")
BASE_BPS = {"SPY": 5., "QQQ": 5., "SHY": 5., "TQQQ": 15., "UPRO": 15., "QLD": 15.}
CONTRACT_MULTIPLES = {"SPY": 1., "QQQ": 1., "SHY": 0., "TQQQ": 3., "UPRO": 3., "QLD": 2.}


def _rates(columns, cost_multiplier):
    if (isinstance(cost_multiplier, (bool, np.bool_)) or
            not np.isfinite(cost_multiplier) or cost_multiplier not in (1, 2, 4)):
        raise ValueError("Frozen cost multipliers are 1, 2, and 4")
    return np.array([BASE_BPS[s] / 10000 * cost_multiplier for s in columns])


def _validate_panel(nav, targets, start, end, capital, delay):
    if not isinstance(nav, pd.DataFrame) or not isinstance(targets, pd.DataFrame):
        raise ValueError("NAV and targets must be DataFrames")
    idx = nav.index
    if (not isinstance(idx, pd.DatetimeIndex) or idx.tz is not None or idx.hasnans or
            not idx.is_unique or not idx.is_monotonic_increasing or not idx.equals(idx.normalize())):
        raise ValueError("Ordered unique timezone-naive midnight NAV dates required")
    if not nav.columns.is_unique or set(nav.columns) != set(UNIVERSE) or len(nav.columns) != len(UNIVERSE):
        raise ValueError("Exactly SPY, QQQ, SHY, TQQQ, UPRO, QLD required")
    if not idx.equals(targets.index) or not nav.columns.equals(targets.columns):
        raise ValueError("NAV/target alignment")
    if not np.isfinite(capital) or capital <= 0:
        raise ValueError("Finite positive capital required")
    if (isinstance(delay, (bool, np.bool_)) or not isinstance(delay, (int, np.integer)) or delay not in (0, 1, 2)):
        raise ValueError("Frozen additional NAV lags are integer 0, 1, and 2")
    values = nav.to_numpy(float)
    weights = targets.to_numpy(float)
    if not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError("Finite positive audited NAV required")
    if not np.isfinite(weights).all() or (weights < 0).any() or (weights.sum(axis=1) > 1 + 1e-12).any():
        raise ValueError("Funded nonnegative targets required")
    positions = np.flatnonzero((idx >= start) & (idx <= end))
    if len(positions) < 2:
        raise ValueError("Too few observed NAV sessions")
    return values, positions


def _funded_trade(holdings, cash, weights, rates):
    """Piecewise algebraic funding with distinct buy/sell rates by asset.

q = available - dot(rates, abs(weights*q - holdings)). For each sign
region, q = (available - dot(rates, signed_h)) /
(1 + dot(rates, signed_w)). All costs are per gross dollar traded.
"""
    available = float(holdings.sum() + cash)
    if not np.isfinite(available) or available < 0:
        raise ValueError("Invalid available cash/share funding")
    if available == 0:
        return np.zeros_like(holdings), 0., 0., 0.
    positive = weights > 0
    breaks = holdings[positive] / weights[positive]
    breaks = np.unique(breaks[(breaks > 0) & (breaks < available)])
    bounds = np.r_[0., breaks, available]
    tolerance = max(1e-9, available * 2e-13)
    funded = None
    for lower, upper in zip(bounds[:-1], bounds[1:]):
        probe = (lower + upper) / 2
        buying = weights * probe >= holdings
        signed_w = np.where(buying, weights, -weights)
        signed_h = np.where(buying, -holdings, holdings)
        q = (available - float(np.dot(rates, signed_h))) / (1 + float(np.dot(rates, signed_w)))
        if lower - tolerance <= q <= upper + tolerance:
            funded = float(np.clip(q, 0, available))
            break
    if funded is None:
        raise AssertionError("No exact funded per-asset cost solution")
    desired = weights * funded
    delta = desired - holdings
    fee = float(np.dot(rates, np.abs(delta)))
    gross = float(np.abs(delta).sum())
    remaining_cash = float(available - desired.sum() - fee)
    if remaining_cash < -tolerance:
        raise AssertionError("Borrowing in NAV proxy")
    if abs(remaining_cash) <= tolerance:
        remaining_cash = 0.
    return desired, remaining_cash, fee, gross


def _exposure(weights):
    return weights.mul(pd.Series(CONTRACT_MULTIPLES), axis=1).sum(axis=1)


def metrics(result):
    """Base sample conventions plus stated-daily-contract exposure proxies.

Weight*3 for TQQQ/UPRO, weight*2 for QLD, weight*1 for SPY/QQQ, and zero
for SHY. This is neither realized beta nor a return/path forecast.
"""
    out = _base_metrics(result)
    weights = result["weights"]
    levered = weights[list(LEVERED)].sum(axis=1)
    proxy = _exposure(weights)
    out.update(mean_levered_exposure=float(levered.mean()),
               max_levered_exposure=float(levered.max()),
               mean_contract_equity_exposure_proxy=float(proxy.mean()),
               max_contract_equity_exposure_proxy=float(proxy.max()))
    return out


def simulate(total_nav, targets, schedule, start, end, cost_multiplier=1, delay=0, capital=100000):
    values, positions = _validate_panel(total_nav, targets, start, end, capital, delay)
    rates = _rates(total_nav.columns, cost_multiplier)
    known, scheduled = execution_plan(targets, schedule, int(delay))
    desired_weights = known.to_numpy(float)
    flags = scheduled.to_numpy()
    holdings = np.zeros(len(total_nav.columns))
    cash = float(capital)
    dates, equities, expenses, turns, weights, cash_marks = [], [], [], [], [], []
    for j, i in enumerate(positions):
        if j:
            holdings *= values[i] / values[positions[j - 1]]
        before = float(holdings.sum() + cash)
        if not np.isfinite(before) or before <= 0:
            raise ValueError("Finite positive wealth required")
        fee = gross = 0.
        # Initial trade is at this NAV: no return into its first execution bar.
        # Endpoint sells old holdings; never acquire a zero-duration new target.
        if j < len(positions) - 1 and (j == 0 or flags[i]):
            holdings, cash, fee, gross = _funded_trade(holdings, cash, desired_weights[i], rates)
        wealth = float(holdings.sum() + cash)
        weights.append(holdings / wealth)
        if j == len(positions) - 1:
            fee += float(np.dot(rates, holdings))
            gross += float(holdings.sum())
            cash += float(holdings.sum() - np.dot(rates, holdings))
            holdings *= 0
            wealth = cash
        dates.append(total_nav.index[i]); equities.append(wealth); expenses.append(fee)
        turns.append(gross / before); cash_marks.append(cash)
    idx = pd.DatetimeIndex(dates)
    equity = pd.Series(equities, index=idx, name="equity")
    returns = equity.pct_change(fill_method=None)
    returns.iloc[0] = equity.iloc[0] / capital - 1
    weight_frame = pd.DataFrame(weights, index=idx, columns=total_nav.columns)
    return dict(equity=equity, returns=returns,
        fees=pd.Series(expenses, index=idx), turnover=pd.Series(turns, index=idx),
        weights=weight_frame, cash=pd.Series(cash_marks, index=idx), capital=capital,
        contract_equity_exposure_proxy=_exposure(weight_frame),
        execution_contract="Lagged observed total-NAV allocation proxy, funded long-only; no exchange fill or synthetic multiple-of-index return",
        exposure_contract="Stated daily objective multiples times funded holdings; not realized beta, margin borrowing or a path forecast")
