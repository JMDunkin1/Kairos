import { eiaStorageReleaseAt } from './eia-release-time.mjs'

export const EIA_STORAGE_REPORT_URL = 'https://ir.eia.gov/ngs/wngsr.json'

// The report also contains a year-ago comparison, which is not a weekly
// observation on the current Friday grid. Admit only its two weekly rows.
export function storageRowsFromWeeklyReport(report, now = new Date()) {
  const series = report?.series?.find((row) => row.series_id === 'png.nw2_epg0_swo_r48_bcf.w')
  if (report?.release_name !== 'Weekly Natural Gas Storage Report' || series?.unitsshort !== 'bcf') {
    throw new Error('EIA weekly storage report has an unexpected series or unit.')
  }
  const dates = [report.current_week, report.week_ago]
  if (!dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)))
    || Date.parse(dates[0]) - Date.parse(dates[1]) !== 7 * 86400000) {
    throw new Error('EIA weekly storage report has invalid weekly dates.')
  }
  return dates.map((date) => {
    const observations = series.data?.filter((row) => row[0] === date) ?? []
    const value = observations[0]?.[1]
    const releasedAt = eiaStorageReleaseAt(date)
    if (observations.length !== 1 || typeof value !== 'number' || !Number.isFinite(value) || value <= 0
      || !releasedAt || Date.parse(releasedAt) > now.getTime()) {
      throw new Error(`EIA weekly storage observation is invalid or not yet released: ${date}`)
    }
    return { date, series: 'NW2_EPG0_SWO_R48_BCF', storageBcf: value, unit: 'Bcf', areaName: 'Lower 48', source: 'EIA Weekly Natural Gas Storage Report' }
  })
}

export function mergeStorageRows(previousRows, fetchedRows) {
  const rows = new Map()
  for (const row of [...(previousRows ?? []), ...(fetchedRows ?? [])]) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.date)) && Number.isFinite(Number(row.storageBcf)) && Number(row.storageBcf) > 0) {
      rows.set(row.date, row)
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-104)
}
