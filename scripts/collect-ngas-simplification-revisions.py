#!/usr/bin/env python3
"""Collect matched legacy lead-8 atoms for historical heat-long signal dates only.

Selecting dates from a frozen target ledger uses no return information. The
collector preserves the legacy hours-0 statistic to match its lead-7 inputs;
these are developmental research and must never substitute for live calendars.
"""
import concurrent.futures
import csv
import datetime as dt
import json
import os
from pathlib import Path
import subprocess

ROOT = Path.cwd()
OUT = ROOT / '.local/qore/research/ngas-simplification/revision-atoms'
ledger = ROOT / 'data/qore/research/strategy-agent-runs/ngas-summer-alpha/selected-trades.csv'
with ledger.open() as handle:
    signals = sorted({r['signalDate'] for r in csv.DictReader(handle) if float(r['ungPosition']) > 0})
OUT.mkdir(parents=True, exist_ok=True)

def collect(task):
    source, signal = task
    issue = (dt.date.fromisoformat(signal) - dt.timedelta(days=1)).isoformat()
    target = (dt.date.fromisoformat(signal) + dt.timedelta(days=7)).isoformat()
    out = OUT / source / signal
    out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update({'QORE_FORECAST_SOURCE': source, 'QORE_GFS_OUTPUT_ROOT': str(out),
        'QORE_GFS_OUTPUT_BASENAME': 'prior', 'QORE_GFS_CALENDAR_START': issue,
        'QORE_GFS_CALENDAR_END': target, 'QORE_GFS_CALENDAR_ISSUE_END': issue,
        'QORE_GFS_LEAD_DAYS': '8', 'QORE_GFS_VALID_OFFSETS_HOURS': '0',
        'QORE_GFS_HEATING_SEASON_ONLY': 'false', 'QORE_GFS_COOLING_SEASON_ONLY': 'false',
        'QORE_GFS_PORTABLE_GRIB_PARSER': 'true', 'QORE_GFS_RESUME': 'true',
        'QORE_GFS_CONCURRENCY': '1'})
    with (out / 'collect.log').open('w') as log:
        result = subprocess.run(['node', 'scripts/build-gfs-forecast-calendar.mjs'], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    return {'source': source, 'signalDate': signal, 'priorIssueDate': issue, 'targetDate': target, 'exitCode': result.returncode, 'directory': str(out.relative_to(ROOT))}

tasks = [(s, d) for d in signals for s in ['gfs', 'gefs-mean']]
results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for result in pool.map(collect, tasks):
        results.append(result)
        print(json.dumps({'completed': len(results), 'total': len(tasks), **result}), flush=True)
(OUT / 'collection-summary.json').write_text(json.dumps(results, indent=2)+'\n')
if any(r['exitCode'] for r in results):
    raise SystemExit('Incomplete collection; inspect per-date logs; missing atoms cannot be treated as flat forecasts.')
