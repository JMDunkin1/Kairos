import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { selectedContracts, executableLiveComponentActiveForDate } from './qore-live-contract.mjs'

// Export reviewed pure scheduling helpers into an isolated in-memory research module.
// Production files and production candidate contracts remain unchanged.
export async function loadSimplificationResearchEngine(repoRoot = process.cwd()) {
  const sourcePath = path.join(repoRoot, 'scripts/lib/qore-live-all-year-inference.mjs')
  const source = fs.readFileSync(sourcePath, 'utf8').replace(
    /from '(\.\/[^']+)'/g,
    (_, relative) => `from '${pathToFileURL(path.resolve(path.dirname(sourcePath), relative)).href}'`,
  ) + '\nexport { signalsFor, schedule, summerStorageContext, versionedStorageRows };\n'
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

export function simplificationSummerTargets({ engine, forecasts, marketDays, storageRows, storageReleaseCalendar, candidate }) {
  const released = engine.versionedStorageRows(storageRows, storageReleaseCalendar)
  const days = marketDays.map((day) => ({ ...day, ...engine.summerStorageContext(released, day.date) }))
  const scoped = forecasts.filter((row) => Number(row.targetDate.slice(5, 7)) >= 5 && Number(row.targetDate.slice(5, 7)) <= 9 && row.leadDays === 7)
  const settings = { ...selectedContracts.summer, ...(candidate.disableSummerFade ? { minRealizedMovePct: Infinity } : {}) }
  const schedule = engine.schedule(days, engine.signalsFor(scoped, settings, 'summer'), settings, 'summer')
  return new Map(days.map((day) => {
    const raw = executableLiveComponentActiveForDate({ season: 'summer', targetDate: day.date }) ? schedule.get(day.date) : null
    const gasPosition = engine.round(raw?.position ?? 0)
    return [day.date, { date: day.date, gasPosition, indexFraction: engine.round(1 - Math.abs(gasPosition)), signalDate: raw?.issueDate ?? day.date, thesisKind: raw?.thesisKind ?? 'index-fallback', windowId: raw?.windowId ?? 'index-fallback', realizedMovePct: raw?.realizedMovePct ?? null, storageDeficit: day.summerStorageDeficit, storageDate: day.storageDate, storageReleaseAt: day.storageReleaseAt, weightedAnomalyF: raw?.weightedAnomalyF ?? 0 }]
  }))
}
