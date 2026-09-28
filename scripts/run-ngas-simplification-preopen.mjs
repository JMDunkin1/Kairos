#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { simplificationNewYorkDate, simplificationPreopenTiming } from './lib/qore-simplification-forward.mjs'
import { EIA_STORAGE_REPORT_URL, storageRowsFromWeeklyReport, mergeStorageRows } from './lib/qore-eia-live-storage.mjs'

const prepareOnly = process.argv.includes('--prepare-only')
for (const arg of process.argv.slice(2)) if (arg !== '--prepare-only') throw new Error(`Unknown argument ${arg}`)
const now = new Date(), targetDate = simplificationNewYorkDate(now)
const timing = simplificationPreopenTiming(now, '2026-09-28')
if (!prepareOnly && !timing.eligible) { console.log(JSON.stringify({ written: false, reason: timing.reason, targetDate })); process.exit(0) }
const research = path.resolve('.local/qore/research/ngas-simplification')
const runtime = path.join(research, 'forward-runtime'), priorRoot = path.join(research, 'forward-inputs')
const addDays = (date, n) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10)
fs.mkdirSync(path.join(runtime, 'live-weather'), { recursive: true, mode: 0o700 })
function run(file, args = [], env = {}, command = process.execPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [file, ...args], { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)))
  })
}
const storagePath = path.join(runtime, 'live-weather/eia-storage-release-window.json')
const previous = fs.existsSync(storagePath) ? JSON.parse(fs.readFileSync(storagePath)) : {}
const response = await fetch(EIA_STORAGE_REPORT_URL, { signal: AbortSignal.timeout(30000) })
if (!response.ok) throw new Error(`EIA storage HTTP ${response.status}`)
const fetched = storageRowsFromWeeklyReport(await response.json(), now)
const storageRows = mergeStorageRows(previous.storageRows, fetched)
fs.writeFileSync(storagePath, JSON.stringify({ generatedAt: new Date().toISOString(), serviceId: 'qore-live-eia-storage-release-window', source: 'EIA Weekly Natural Gas Storage Report', latestStorage: storageRows.at(-1), storageRows }, null, 2) + '\n', { mode: 0o600 })
await run('scripts/qore-live-strategy-inference.mjs', [], {
  QORE_BROKER_MODE: 'dry-run', QORE_LIVE_INFERENCE_DATE: targetDate,
  QORE_LIVE_INFERENCE_STATE_DIR: path.join(runtime, 'live-inference'),
  QORE_LIVE_INFERENCE_FILE: path.join(runtime, 'live-inference/all-year-target.json'),
  QORE_LIVE_INFERENCE_EIA_SNAPSHOT_FILE: storagePath,
  QORE_LIVE_SUPPLY_CONTEXT_FILE: path.join(runtime, 'live-weather/eia-supply-context.json'),
  QORE_LIVE_MARKET_HISTORY_STATE_DIR: path.join(runtime, 'live-market-history'),
})
const snapshot = JSON.parse(fs.readFileSync(path.join(runtime, 'live-inference/all-year-target.json')))
if (snapshot.season === 'summer') {
  await Promise.all(['gfs', 'gefs-mean'].map(async source => {
    const root = path.join(priorRoot, source)
    try {
      await run('scripts/build-gfs-forecast-calendar.mjs', [], {
        QORE_FORECAST_SOURCE: source, QORE_GFS_OUTPUT_ROOT: root, QORE_GFS_OUTPUT_BASENAME: 'prior',
        QORE_GFS_CALENDAR_START: addDays(targetDate, -17), QORE_GFS_CALENDAR_ISSUE_END: addDays(targetDate, -1),
        QORE_GFS_CALENDAR_END: addDays(targetDate, 7), QORE_GFS_LEAD_DAYS: '8', QORE_GFS_RUN_HOUR: '00',
        QORE_GFS_VALID_OFFSETS_HOURS: '6,12,18,24', QORE_GFS_VALID_HOURS: '',
        QORE_GFS_HEATING_SEASON_ONLY: '0', QORE_GFS_COOLING_SEASON_ONLY: '0',
        QORE_GFS_PORTABLE_GRIB_PARSER: '1', QORE_GFS_RESUME: '1', QORE_GFS_CONCURRENCY: '4',
      })
      fs.copyFileSync(path.join(root, 'weather', source === 'gfs' ? 'noaa-gfs' : 'noaa-gefs', 'prior-location-anomalies.csv'), path.join(priorRoot, `prior-${source}-location-anomalies.csv`))
    } catch (error) { console.error(`Revision input unavailable for ${source}: ${error.message}`) }
  }))
}
if (prepareOnly) { console.log(JSON.stringify({ prepared: true, targetDate, runtime, priorRoot, predictionsWritten: false })); process.exit(0) }
await run('scripts/collect-ngas-simplification-forward.mjs', [`--runtime-root=${runtime}`, `--research-root=${research}`, `--prior-root=${priorRoot}`])
