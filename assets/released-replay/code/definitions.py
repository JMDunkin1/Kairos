"""Reviewed historical NAV definitions; no data retrieval, broker or live feed.

Only two released definitions are exposed. Supply the exact ordered six-asset
audited total-NAV panel; actual fund paths are required. These methods are
historical replay helpers, not an executable exchange-order integration.
"""
import builtins
import copy
import importlib.util
from pathlib import Path
import numpy as np
import pandas as pd

_HERE = Path(__file__).resolve().parent
UNIVERSE = ("SPY", "QQQ", "SHY", "TQQQ", "UPRO", "QLD")
_IDS = {
    "lev_core_relative_leverage_sleeves_v3": "lev_core_relative_leverage_sleeves_v3",
    "TQQQ_50_QQQ_static": "lev_core_fixed_tech_leverage_mix_v2",
}

def _load(name, filename, local_imports=None):
    spec = importlib.util.spec_from_file_location(name, _HERE / filename)
    module = importlib.util.module_from_spec(spec)
    if local_imports:
        def local_import(name, globals=None, locals=None, fromlist=(), level=0):
            if level == 0 and name in local_imports:
                return local_imports[name]
            return builtins.__import__(name, globals, locals, fromlist, level)
        module.__dict__["__builtins__"] = dict(vars(builtins), __import__=local_import)
    spec.loader.exec_module(module)
    return module

_engine = _load("hub_released_schedule", "engine.py")
_core = _load("hub_released_core", "lev_families_core.py")
_ledger = _load("hub_released_ledger", "lev_engine.py", {"engine": _engine})
_configs = {c["id"]: c for c in _core.configs()}

def catalog():
    out = []
    for exposed, source in _IDS.items():
        c = copy.deepcopy(_configs[source])
        c.update(id=exposed, frozen_source_id=source,
                 classification="HIGH_RISK_RETROSPECTIVE_NAV_RESEARCH_CANDIDATE" if exposed.startswith("lev_core_relative") else "EXPOSURE_BASELINE_NO_TIMING_EDGE",
                 preferred_research_candidate=exposed.startswith("lev_core_relative"))
        out.append(c)
    return out

def targets(rule_id, total_nav):
    if rule_id not in _IDS:
        raise ValueError("Only the two released definitions are exposed")
    if not isinstance(total_nav, pd.DataFrame) or tuple(total_nav.columns) != UNIVERSE:
        raise ValueError("Exact audited six-asset total-NAV order required")
    idx = total_nav.index
    if (not isinstance(idx, pd.DatetimeIndex) or idx.tz is not None or idx.hasnans or
        not idx.is_unique or not idx.is_monotonic_increasing or not idx.equals(idx.normalize())):
        raise ValueError("Ordered unique naive midnight NAV dates required")
    if len(idx) < 2 or idx[0] < pd.Timestamp("2016-09-01") or idx[-1] > pd.Timestamp("2026-10-01"):
        raise ValueError("This contract exposes historical released replay only; future feeds are unconfigured")
    x = total_nav.to_numpy(float)
    if not np.isfinite(x).all() or (x <= 0).any():
        raise ValueError("Finite positive actual-fund total-NAV history required")
    return _core.targets(_configs[_IDS[rule_id]], total_nav)

def execution_plan(rule_id, total_nav):
    return _engine.execution_plan(targets(rule_id, total_nav), "monthly", 0)

def replay(rule_id, total_nav):
    return _ledger.simulate(total_nav, targets(rule_id, total_nav), "monthly",
                            pd.Timestamp("2024-01-02"), pd.Timestamp("2026-10-01"),
                            cost_multiplier=1, delay=0, capital=100000.0)
