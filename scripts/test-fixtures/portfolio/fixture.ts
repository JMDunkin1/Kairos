import type { DataFeedAdapter, Feed } from '../../../src/hub/types.ts'

// Deliberately synthetic raw prices, never claimed as market evidence or adjusted data.
export function fixtureFeed(): Feed {
  const feed: Feed = { id: 'fixture-two-assets', version: '1', exposure: 'synthetic', testStart: '2026-03-30', instruments: ['MKT', 'ALT'].map(id => ({ id, kind: 'etf', currency: 'USD', multiplier: 1 })), bars: [] }
  let date = new Date('2026-01-05T00:00:00Z')
  for (let i = 0; i < 90; i++) {
    while ([0, 6].includes(date.getUTCDay())) date = new Date(+date + 86400000)
    const day = date.toISOString().slice(0, 10)
    for (const [id, offset] of [['MKT', 0], ['ALT', 1]] as const) {
      const base = 100 + i * .17 + 4 * Math.sin(i / 5 + offset) + 1.4 * Math.cos(i / 2 + offset)
      feed.bars.push({ instrument: id, date: day, openAt: `${day}T14:30:00Z`, closeAt: `${day}T21:00:00Z`, availableAt: `${day}T21:00:00Z`, open: base * (1 + .001 * Math.sin(i)), close: base * (1 + .002 * Math.cos(i + offset)), incomePerShare: i === 40 ? .2 : 0 })
    }
    date = new Date(+date + 86400000)
  }
  return feed
}

export const fixtureAdapter: DataFeedAdapter = { id: 'fixture-two-assets', version: '1', status: 'available', load: fixtureFeed }
