import { useState } from 'react'
import type { AllocationSlice } from './allocationCharts'

const dollars = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const percentage = (value: number, total: number) => `${(value / total * 100).toFixed(1)}%`

export function AllocationChart({ title, caption, slices, empty }: { title: string; caption: string; slices: AllocationSlice[] | null; empty: string }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const total = slices?.reduce((sum, s) => sum + s.value, 0) ?? 0
  const active = slices?.find(s => s.id === activeId)
  const circumference = 2 * Math.PI * 72
  return <section className="allocation-card" aria-label={title}>
    <header><h2>{title}</h2><p>{caption}</p></header>
    {total > 0 ? <div className="allocation-content">
      <div className="allocation-donut"><svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${slices!.map(s => `${s.name}${s.paused ? ' (paused budget)' : ''} ${percentage(s.value, total)}`).join(', ')}`}>
        <circle cx="100" cy="100" r="72" fill="none" stroke="#eef2f6" strokeWidth="25" />
        {slices!.map((s, index) => {
          const length = s.value / total * circumference
          const start = slices!.slice(0, index).reduce((sum, preceding) => sum + preceding.value, 0) / total * circumference
          return <circle key={s.id} cx="100" cy="100" r="72" fill="none" stroke={s.color} strokeWidth={activeId === s.id ? 30 : 25} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" opacity={s.paused ? 0.45 : activeId && activeId !== s.id ? 0.4 : 1} onMouseEnter={() => setActiveId(s.id)} onMouseLeave={() => setActiveId(null)}><title>{s.name}: {percentage(s.value, total)} · {dollars(s.value)}{s.paused ? ' · paused budget' : ''}</title></circle>
        })}
      </svg><div className="allocation-center" aria-hidden="true"><strong>{active ? percentage(active.value, total) : dollars(total)}</strong><span>{active ? active.name : 'Total'}</span></div></div>
      <ul className="allocation-legend">{slices!.map(s => <li key={s.id}><button onMouseEnter={() => setActiveId(s.id)} onMouseLeave={() => setActiveId(null)} onFocus={() => setActiveId(s.id)} onBlur={() => setActiveId(null)} onClick={() => setActiveId(activeId === s.id ? null : s.id)} aria-pressed={activeId === s.id}><i style={{ background: s.color, opacity: s.paused ? 0.45 : 1 }} /><span>{s.name}{s.paused && <small>Paused budget</small>}</span><strong>{percentage(s.value, total)}<small>{dollars(s.value)}</small></strong></button></li>)}</ul>
    </div> : <div className="allocation-empty"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="72" fill="none" stroke="#edf1f5" strokeWidth="25" /></svg><p>{empty}</p></div>}
  </section>
}
