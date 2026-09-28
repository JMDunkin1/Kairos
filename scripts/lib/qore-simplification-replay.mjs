import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Isolate the ablation in memory. This never modifies the executable strategy.
export async function loadNoSummerReversionEngine(repoRoot = process.cwd()) {
  const sourcePath = path.join(repoRoot, 'scripts/research-fixtures/ngas-simplification-baseline/qore-live-all-year-inference.mjs')
  const source = fs.readFileSync(sourcePath, 'utf8')
  const original = "summer: schedule(days, signalsFor(summerRows, SUMMER, 'summer'), SUMMER, 'summer'),"
  if (source.split(original).length !== 2) throw new Error('Expected exactly one reviewed Summer schedule call')
  const transformed = source.replace(original,
    "summer: schedule(days, signalsFor(summerRows, SUMMER, 'summer'), { ...SUMMER, reversionHoldDays: 0 }, 'summer'),")
    .replace(/from '(\.{1,2}\/[^']+)'/g,
      (_, relative) => `from '${pathToFileURL(path.resolve(path.dirname(sourcePath), relative)).href}'`)
  return {
    engine: await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`),
    sourcePath,
    source,
    transformed,
  }
}

export function causalSimplificationMarketDays({ rows, targetDate }) {
  const completed = rows.filter((row) => row.date < targetDate).map((row) => ({ date: row.date, gasClose: row.gasClose }))
  if (!completed.length) throw new Error('Completed prior-session prices are required')
  if (completed.some((row, index) => !(row.gasClose > 0) || (index && row.date <= completed[index - 1].date))) {
    throw new Error('Price rows must be positive and strictly chronological')
  }
  return [...completed, { date: targetDate, gasClose: completed.at(-1).gasClose, provisional: true }]
}
