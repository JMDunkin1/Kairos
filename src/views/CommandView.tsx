import { useCallback, useEffect, useRef, useState } from 'react'
import { MetricRail } from '../components/MetricRail'
import { PerformanceChart } from '../components/PerformanceChart'
import { SourceDialog } from '../components/SourceDialog'
import { getCommandConnection, getLiveTelemetry, refreshLiveTelemetry } from '../runtime/client'
import { createTelemetryLoader } from '../runtime/telemetryLoader'
import { calculationVersion, finite, metricAvailability, paperPresentation } from '../runtime/paperPresentation'
import type { CommandConnection, LiveOrder, LiveTelemetry } from '../runtime/types'
import { classForSigned, formatNumber, signedPercent } from '../utils/format'

const money = (value: unknown) => finite(value) === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value as number)
const number = (value: unknown, digits = 2, suffix = '') => finite(value) === null ? '—' : `${formatNumber(value as number, digits)}${suffix}`
const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : 'Unavailable'
const display = (value: unknown) => value === null || value === undefined ? 'Unavailable' : typeof value === 'object' ? 'See runtime report' : String(value)

type Section = 'Performance' | 'Holdings' | 'Activity' | 'Data & execution'

function Orders({ orders, known, title }: { orders: LiveOrder[]; known: boolean; title: string }) {
  return <section className="data-section"><header className="section-header"><h2>{title}</h2><span className="plain-status">{known ? `${orders.length} recorded orders` : 'Unavailable'}</span></header>
    <div className="table-scroll" tabIndex={0} aria-label={title}><table><thead><tr><th>Submitted / filled (UTC)</th><th>Symbol</th><th>Side</th><th>Type</th><th>Quantity</th><th>Filled qty</th><th>Avg fill</th><th>Status</th></tr></thead><tbody>
      {orders.map((order, index) => <tr key={`${order.id}-${index}`}><td>{time(order.submittedAt)}<small>{time(order.filledAt)}</small></td><th scope="row">{order.symbol ?? '—'}</th><td>{order.side ?? '—'}</td><td>{order.type ?? '—'}</td><td>{number(order.quantity, 4)}</td><td>{number(order.filledQuantity, 4)}</td><td>{money(order.averageFillPriceUsd)}</td><td>{order.status ?? '—'}</td></tr>)}
      {!orders.length && <tr><td colSpan={8} className="table-empty">{known ? 'No orders in this recorded snapshot.' : 'Order history unavailable.'}</td></tr>}
    </tbody></table></div></section>
}

export function CommandView() {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null)
  const [connection, setConnection] = useState<CommandConnection | null>(null)
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [section, setSection] = useState<Section>('Performance')
  const [chart, setChart] = useState('return')
  const [now, setNow] = useState(Date.now)
  const loader = useRef<ReturnType<typeof createTelemetryLoader<LiveTelemetry>> | null>(null)
  const load = useCallback((refresh = false) => loader.current?.load(refresh), [])
  useEffect(() => {
    let active = true
    const coordinator = createTelemetryLoader(
      refresh => refresh ? refreshLiveTelemetry() : getLiveTelemetry(),
      {
        isActive: () => active,
        onResult: next => { setTelemetry(next); setError('') },
        onError: requestError => setError(requestError instanceof Error ? requestError.message : 'Telemetry unavailable.'),
        onBusy: setRefreshing,
      },
    )
    loader.current = coordinator
    let timer = 0
    const poll = async () => {
      try {
        const next = await getCommandConnection()
        if (!active) return
        setConnection(next); setConnectionError('')
      } catch {
        if (!active) return
        setConnection(null); setConnectionError('Read-only telemetry bridge unavailable.')
      }
      if (active) timer = window.setTimeout(poll, 15_000)
    }
    void poll()
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { active = false; coordinator.invalidate(); loader.current = null; window.clearTimeout(timer); window.clearInterval(clock) }
  }, [])
  useEffect(() => {
    if (!connection?.connected) return
    const timer = window.setTimeout(() => void load(), 0)
    const interval = window.setInterval(() => void load(), 60_000)
    return () => { window.clearTimeout(timer); window.clearInterval(interval) }
  }, [connection?.connected, load])

  const data = paperPresentation(telemetry, now)
  const mode = telemetry?.mode === 'paper' ? 'PAPER' : telemetry?.mode === 'live' ? 'LIVE' : telemetry?.mode === 'dry-run' ? 'DRY RUN' : 'MODE UNAVAILABLE'
  const title = telemetry?.mode === 'paper' ? 'Paper account' : telemetry?.mode === 'live' ? 'Live account' : 'Account overview'
  const intent = telemetry?.strategy?.intent
  const ordersKnown = Boolean(Array.isArray(telemetry?.openOrders) && Array.isArray(telemetry?.recentOrders) && telemetry && data.sourceStatus !== 'Unavailable' && data.sourceStatus !== 'Future timestamp')
  const openOrders = ordersKnown && Array.isArray(telemetry?.openOrders) ? telemetry.openOrders : []
  const recentOrders = ordersKnown && Array.isArray(telemetry?.recentOrders) ? telemetry.recentOrders : []
  const period = data.navHistory.length ? `${data.navHistory[0].date} – ${data.navHistory.at(-1)?.date}` : 'Period unavailable'
  const sources = <>
    <dl className="facts"><div><dt>Source</dt><dd>Alpaca via read-only local telemetry</dd></div><div><dt>Account as of</dt><dd>{time(telemetry?.sourceGeneratedAt)} · {data.sourceStatus}</dd></div><div><dt>History fetched</dt><dd>{time(telemetry?.portfolioHistory?.sourceGeneratedAt)} · {data.historyStatus}</dd></div><div><dt>Period / coverage</dt><dd>{period} · {data.navHistory.length} recorded NAV observations</dd></div><div><dt>Source freshness cap</dt><dd>{data.sourceCapSeconds} seconds · dashboard policy</dd></div><div><dt>Calculation version</dt><dd>{calculationVersion}</dd></div></dl>
    <h3>Metric availability</h3><table className="availability-table"><thead><tr><th>Metric</th><th>Required inputs / calculation</th></tr></thead><tbody>{metricAvailability.map(metric => <tr key={metric.name}><th scope="row">{metric.name}<small>Unavailable</small></th><td>{metric.reason}<small>{metric.formula}</small></td></tr>)}</tbody></table>
    <p className="section-note">Recorded NAV and current holding P&amp;L are broker observations. They do not establish strategy attribution or flow-adjusted account performance.</p>
  </>
  return <main className="view" id="command-view">
    <div className="breadcrumb">QORE / Account</div>
    <header className="view-header"><div className="view-heading"><h1>{title}</h1><div className="header-meta"><span className="mode-label">{mode}</span><span>{intent?.strategyId ?? 'Strategy version unavailable'}</span></div></div><SourceDialog title="Account data & calculations">{sources}</SourceDialog></header>
    <div className="control-strip"><div><span>Period</span><strong>{period}</strong></div><div><span>Source</span><strong>Recorded broker data</strong></div><div><span>As of</span><strong>{time(telemetry?.sourceGeneratedAt)}</strong></div><button className="text-button primary" type="button" disabled={refreshing || !connection?.connected} onClick={() => void load(true)}>{refreshing ? 'Refreshing…' : 'Refresh account'}</button></div>
    {(connectionError || connection?.error || !connection?.connected || error) && <div className="notice" role="status"><strong>Telemetry unavailable</strong><span>{error || connection?.error || connectionError || connection?.detail || 'Waiting for the read-only bridge.'}</span></div>}
    {telemetry && data.accountStale && <div className="notice warning" role="status"><strong>Account snapshot {data.sourceStatus.toLowerCase()}</strong><span>As of {time(telemetry.sourceGeneratedAt)}. The feed heartbeat does not refresh broker inputs.</span></div>}
    <div className={`execution-strip ${data.executionLabel === 'Running' ? '' : 'warning'}`}><strong>Execution: {data.executionLabel}</strong><span>Signal {data.signalStatus.toLowerCase()} · {time(telemetry?.execution?.lastSignalAt ?? intent?.generatedAt)}</span><button type="button" className="link-button" onClick={() => setSection('Data & execution')}>View gates</button></div>
    <nav className="section-tabs" aria-label="Account sections">{(['Performance', 'Holdings', 'Activity', 'Data & execution'] as Section[]).map(item => <button key={item} type="button" aria-current={section === item ? 'page' : undefined} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}</nav>
    {section === 'Performance' && <>
      <MetricRail ariaLabel="Account summary" metrics={[
        { label: 'Net asset value', value: money(data.nav), detail: data.nav === null ? 'Timestamped broker balance required' : `Recorded · ${data.sourceStatus.toLowerCase()}` },
        { label: 'Net account P&L', value: 'Unavailable', detail: 'External flow ledger required' },
        { label: 'Gas-only P&L', value: 'Unavailable', detail: 'Tagged fills and allocated costs required' },
        { label: 'Account return (TWR)', value: 'Unavailable', detail: 'Cash-flow valuations required' },
      ]} />
      <div className="chart-controls"><span>Performance measure</span><button type="button" className={chart === 'return' ? 'selected' : ''} aria-pressed={chart === 'return'} onClick={() => setChart('return')}>Cumulative return</button><button type="button" className={chart === 'nav' ? 'selected' : ''} aria-pressed={chart === 'nav'} onClick={() => setChart('nav')}>Recorded NAV</button></div>
      <PerformanceChart key={chart} title={chart === 'return' ? 'Cumulative performance' : 'Recorded net asset value'} meta={chart === 'return' ? 'Flow-adjusted account return' : `${period} · includes cash flows`} data={chart === 'nav' ? data.navHistory : []} series={[{ axis: 'left', color: '#1767a6', dataKey: 'navUsd', id: 'nav', label: 'Recorded NAV', mode: 'line', valueFormatter: money }]} empty={chart === 'return' ? 'Return unavailable · cash-flow valuations are missing' : 'NAV history unavailable · timestamped broker history required'} />
      <section className="drawdown-panel"><header className="section-header"><h2>Drawdown</h2><span>Flow-adjusted wealth</span></header><div className="empty-state">Unavailable · flow-adjusted wealth series required</div></section>
      <section className="data-section"><header className="section-header"><h2>Account attribution</h2><span className="plain-status">Period P&amp;L unavailable</span></header><div className="table-scroll" tabIndex={0} aria-label="Account attribution"><table><thead><tr><th>Sleeve</th><th>Gross exposure / NAV</th><th>Net P&amp;L</th><th>Coverage</th></tr></thead><tbody>
        <tr><th scope="row">Natural gas <small>UNG</small></th><td>{number(data.gasExposurePct, 1, '%')}</td><td>Unavailable</td><td>Tagged accounting ledger required</td></tr>
        <tr><th scope="row">Index fallback <small>VOO / QQQM</small></th><td>{number(data.basketExposurePct, 1, '%')}</td><td>Unavailable</td><td>Separate from gas performance</td></tr>
        <tr><th scope="row">Cash / costs</th><td>{data.nav !== null && data.nav > 0 && data.cash !== null ? number(data.cash / data.nav * 100, 1, '%') : '—'}</td><td>Unavailable</td><td>Income and fees unavailable</td></tr>
        <tr><th scope="row">Unreconciled difference</th><td>—</td><td>Unavailable</td><td>Requires complete account and sleeve P&amp;L</td></tr>
      </tbody></table></div></section>
    </>}
    {(section === 'Holdings' || section === 'Performance') && <section className="data-section"><header className="section-header"><h2>Holdings</h2><span className="plain-status">{data.holdingsKnown ? `${data.positions.length} recorded positions` : 'Unavailable'}</span></header><div className="table-scroll" tabIndex={0} aria-label="Recorded holdings"><table><thead><tr><th>Symbol</th><th>Sleeve</th><th>Side</th><th>Quantity</th><th>Market value</th><th>Open P&amp;L</th><th>Open return</th></tr></thead><tbody>{data.positions.map((position, index) => <tr key={`${position.symbol}-${index}`}><th scope="row">{position.symbol}</th><td>{position.symbol === 'UNG' ? 'Gas' : ['VOO', 'QQQM'].includes(position.symbol) ? 'Index fallback' : 'Other / untagged'}</td><td>{position.side ?? '—'}</td><td>{number(position.quantity, 4)}</td><td>{money(position.marketValueUsd)}</td><td className={finite(position.unrealizedPnlUsd) === null ? '' : classForSigned(position.unrealizedPnlUsd!)}>{money(position.unrealizedPnlUsd)}</td><td>{finite(position.unrealizedPnlPct) === null ? '—' : signedPercent(position.unrealizedPnlPct!)}</td></tr>)}{!data.positions.length && <tr><td colSpan={7} className="table-empty">{data.holdingsKnown ? 'No holdings in this recorded snapshot.' : 'Holdings unavailable · no timestamped broker snapshot.'}</td></tr>}</tbody></table></div><p className="section-note">Open P&amp;L is current unrealized holding P&amp;L; order-source attribution is unavailable.</p></section>}
    {section === 'Holdings' && <section className="data-section"><header className="section-header"><h2>Account balances</h2></header><dl className="facts"><div><dt>Cash</dt><dd>{money(data.cash)}</dd></div><div><dt>Buying power</dt><dd>{data.hasAccount ? money(telemetry?.account?.buyingPowerUsd) : 'Unavailable'}</dd></div><div><dt>Account status</dt><dd>{data.hasAccount ? display(telemetry?.account?.status) : 'Unavailable'}</dd></div><div><dt>Shorting enabled</dt><dd>{data.hasAccount ? display(telemetry?.account?.shortingEnabled) : 'Unavailable'}</dd></div></dl></section>}
    {section === 'Activity' && <><Orders orders={openOrders} known={ordersKnown} title="Open orders" /><Orders orders={recentOrders} known={ordersKnown} title="Recent orders & fills" /><p className="section-note">Recorded order snapshots; this is not a complete trade or fee ledger.</p></>}
    {section === 'Data & execution' && <>
      <div className="data-grid"><section className="data-section"><header className="section-header"><h2>Current target</h2><span className="plain-status">{data.signalStatus}</span></header><dl className="facts"><div><dt>Strategy</dt><dd>{intent?.strategyId ?? 'Unavailable'}</dd></div><div><dt>Gas target (UNG)</dt><dd>{number(intent?.gasPosition, 3, '×')}</dd></div><div><dt>Index / cash target</dt><dd>{number(finite(intent?.indexFraction) === null ? null : intent!.indexFraction! * 100, 1, '%')} / {number(finite(intent?.cashFraction) === null ? null : intent!.cashFraction! * 100, 1, '%')}</dd></div><div><dt>Target session</dt><dd>{intent?.targetDate ?? 'Unavailable'}</dd></div><div><dt>Inference</dt><dd>{time(telemetry?.execution?.lastInferenceAt)} · {data.inferenceStatus}</dd></div></dl></section>
      <section className="data-section"><header className="section-header"><h2>Trading safety</h2><span className="plain-status warning">{telemetry?.execution?.state ?? 'Unavailable'}</span></header><dl className="facts"><div><dt>Kill switch</dt><dd>{telemetry?.risk?.killSwitchEngaged === true ? 'Engaged' : telemetry?.risk?.killSwitchEngaged === false ? 'Clear' : 'Unavailable'}</dd></div><div><dt>Market</dt><dd>{telemetry?.marketClock?.isOpen === true ? 'Open' : telemetry?.marketClock?.isOpen === false ? 'Closed' : 'Unavailable'}</dd></div><div><dt>Market timestamp</dt><dd>{time(telemetry?.marketClock?.timestamp)}</dd></div><div><dt>Last reconcile</dt><dd>{time(telemetry?.execution?.lastReconcileAt)}</dd></div></dl></section></div>
      <section className="data-section"><header className="section-header"><h2>Execution gates &amp; warnings</h2></header>{[...(telemetry?.execution?.reasons ?? []), ...(telemetry?.risk?.blockedReasons ?? [])].map((reason, index) => <p className="gate-message negative" key={`${reason}-${index}`}>{reason}</p>)}{(telemetry?.risk?.warnings ?? []).map((reason, index) => <p className="gate-message warning" key={`${reason}-${index}`}>{reason}</p>)}<dl className="facts">{Object.entries(telemetry?.risk?.readiness ?? {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{display(value)}</dd></div>)}</dl>{!telemetry?.risk && <div className="inline-empty">Risk snapshot unavailable.</div>}</section>
      <section className="data-section"><header className="section-header"><h2>Data availability</h2></header>{sources}</section>
    </>}
    <footer className="view-footer"><span>Read-only account telemetry · {calculationVersion}</span><span>USD · timestamps UTC</span></footer>
  </main>
}
