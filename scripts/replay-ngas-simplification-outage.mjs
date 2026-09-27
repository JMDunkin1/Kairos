#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { loadNoSummerReversionEngine, causalSimplificationMarketDays } from './lib/qore-simplification-replay.mjs'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { enrichForecastRows, inferAllYearTarget } from './lib/qore-live-all-year-inference.mjs'
import { assertSummerForecastTemporalInputs } from './lib/qore-summer-forecast-contract.mjs'
import { summarizeSummerForecastLocationBreadth } from './lib/qore-summer-forecast-coverage.mjs'
import { rebalanceDecisionsForAllocation } from './lib/qore-rebalance-deadband.mjs'
import { eiaStorageReleaseAt } from './lib/eia-release-time.mjs'
import { eiaReportAvailableAtOpen } from './lib/qore-signal-availability.mjs'
import { adjustedBarFromYahooRow, loadResearchExecutionContract, applyExecutionStep, targetWeightsForAllocation } from './lib/qore-research-execution.mjs'
const dir='.local/qore/outage-counterfactual'
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8'))
const csv=(p)=>{const r=Papa.parse(fs.readFileSync(p,'utf8'),{header:true,skipEmptyLines:true});assert.equal(r.errors.length,0);return r.data}
const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
const symbols=['UNG','VOO','QQQM']
const bars={},rawBars={},inputs=[]
for(const symbol of [...symbols,'NG=F']) {
 const file=`${dir}/${symbol.replace('=','-')}-yahoo.json`; inputs.push(file)
 const r=read(file).payload.chart.result[0],q=r.indicators.quote[0],a=r.indicators.adjclose[0].adjclose
 const rows=r.timestamp.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],adjustedClose:a[i]})).filter(r=>r.date<='2026-09-25')
 rawBars[symbol]=new Map(rows.map(r=>[r.date,r]));bars[symbol]=new Map(rows.map(r=>[r.date,adjustedBarFromYahooRow(r,symbol)]))
}
const allDates=[...bars.VOO.keys()].filter(d=>['UNG','QQQM','NG=F'].every(s=>bars[s].has(d))).sort()
const dates=allDates.filter(d=>d>'2026-07-24')
assert.equal(dates[0],'2026-07-27');assert.equal(dates.at(-1),'2026-09-25')
const scores=[],locations=[]
for(const sourceId of ['gfs','gefs-mean']) {
 const weatherDir=sourceId==='gfs'?'noaa-gfs':'noaa-gefs'
 const files=[`${dir}/noaa/research/outage-${sourceId}-signal-scores.csv`,`${dir}/noaa/weather/${weatherDir}/outage-${sourceId}-location-anomalies.csv`,`${dir}/noaa/weather/${weatherDir}/outage-${sourceId}-manifest.json`]
 inputs.push(...files)
 const scoreRows=csv(files[0]),locationRows=csv(files[1]),manifest=read(files[2]);assert.equal(manifest.failures.length,0)
 assertSummerForecastTemporalInputs({sourceId,manifest,scoreRows,locationRows})
 for(const row of scoreRows) {
  const loc=locationRows.filter(l=>l.issueDate===row.issueDate&&l.targetDate===row.targetDate&&l.modelId===row.modelId&&l.leadDays===row.leadDays)
  assert.equal(summarizeSummerForecastLocationBreadth(loc).complete,true)
 }
 scores.push(...scoreRows.map(r=>({...r,sourceId})));locations.push(...locationRows.map(r=>({...r,sourceId})))
}
const forecasts=enrichForecastRows(scores,locations,'summer'),storage=read(`${dir}/storage.json`)
const snapshot=read(`${dir}/account-snapshot.json`),startEquity=97830.27,actualFinal=snapshot.account.equityUsd
const initialWeights=Object.fromEntries(snapshot.positions.map(p=>[p.symbol,p.quantity*rawBars[p.symbol].get('2026-07-24').close/startEquity]))
assert.ok(Math.abs(Object.values(initialWeights).reduce((a,b)=>a+b,0)*startEquity+snapshot.account.cashUsd-startEquity)<0.01)
const contract=loadResearchExecutionContract(process.cwd())
const {engine:{inferAllYearTarget:inferNoShort},sourcePath,source,transformed}=await loadNoSummerReversionEngine(process.cwd())
const shadowSourcePath=path.resolve(`${dir}/inference-no-summer-reversion.generated.mjs`)
fs.writeFileSync(shadowSourcePath,transformed)
const definitions=[
 {id:'current',label:'Current strategy',priceSymbol:'NG=F',noShort:false},
 {id:'no-summer-shorts',label:'Remove automatic Summer shorts',priceSymbol:'NG=F',noShort:true},
 {id:'ung-price',label:'Measure price moves in UNG',priceSymbol:'UNG',noShort:false},
 {id:'no-summer-shorts-ung-price',label:'No Summer shorts + UNG price',priceSymbol:'UNG',noShort:true},
 {id:'fallback',label:'Index fallback only',priceSymbol:'NG=F',fallback:true},
]
const targetsByVariant={}
for(const definition of definitions){
 const targetRows=[]
 for(const date of dates){
  assert.ok(date>='2026-05-01' && date<='2026-09-30','This ablation is scoped to Summer only')
  const scoped=forecasts.filter(r=>r.issueDate>=addDays(date,-16)&&r.issueDate<=date)
  for(let d=addDays(date,-16);d<=date;d=addDays(d,1))assert.equal(new Set(scoped.filter(r=>r.issueDate===d).map(r=>r.sourceId)).size,2,`Missing forecast ${d}`)
  const marketDays=causalSimplificationMarketDays({rows:allDates.map(d=>({date:d,gasClose:bars[definition.priceSymbol].get(d).close})),targetDate:date})
  const infer=definition.noShort?inferNoShort:inferAllYearTarget
  let t=infer({forecastRows:scoped,marketDays,storageRows:storage,targetDate:date})
  const releasedOnly=storage.filter(r=>eiaReportAvailableAtOpen(eiaStorageReleaseAt(r.date),date))
  assert.deepEqual(infer({forecastRows:scoped,marketDays,storageRows:releasedOnly,targetDate:date}),t,`Future storage changed ${definition.id} ${date}`)
  assert.ok(t.gasPosition===0 || t.signalDate<date)
  if(definition.noShort)assert.ok(t.gasPosition>=0)
  if(definition.fallback)t={...t,gasPosition:0,indexFraction:1,cashFraction:0,direction:'flat',windowId:'index-fallback',thesisKind:'index-fallback',componentStrategyId:'index-fallback'}
  targetRows.push({...t,researchVariantId:definition.id,executionEligible:false})
 }
 targetsByVariant[definition.id]=targetRows
}
const priorTargets=read(`${dir}/targets.json`)
assert.deepEqual(targetsByVariant.current.map(({researchVariantId,executionEligible,...t})=>t),priorTargets,'Current targets must exactly match prior replay')
assert.deepEqual(targetsByVariant['no-summer-shorts'].map(t=>t.gasPosition),targetsByVariant['no-summer-shorts-ung-price'].map(t=>t.gasPosition),'UNG price has no remaining effect after Summer shorts removed')
// Optional research-only overlays supplied by the parent study; no broker handoff is emitted.
const extraArg=process.argv.find(a=>a.startsWith('--extra-targets='))
if(extraArg){
 const extraPath=extraArg.slice('--extra-targets='.length),extra=read(extraPath)
 inputs.push(extraPath)
 for(const [id,targetRows] of Object.entries(extra)){
  assert.ok(!definitions.some(d=>d.id===id),`Duplicate variant ${id}`)
  assert.equal(targetRows.length,dates.length,`Incomplete target calendar ${id}`)
  targetRows.forEach((t,i)=>{
   assert.equal(t.targetDate,dates[i],`Misdated ${id}`)
   assert.ok(Number.isFinite(t.gasPosition)&&Math.abs(t.gasPosition)<=1)
   assert.ok(Math.abs(t.indexFraction-(1-Math.abs(t.gasPosition)))<1e-9)
   assert.equal(t.cashFraction,0)
   assert.ok(t.gasPosition===0||t.signalDate<t.targetDate)
   assert.equal(t.executionEligible,false)
  })
  definitions.push({id,label:id,externalResearchOverlay:true})
  targetsByVariant[id]=targetRows
 }
}
function dayFor(date){
 const previousDate=allDates[allDates.indexOf(date)-1],syms={}
 for(const s of symbols){const p=bars[s].get(previousDate),c=bars[s].get(date);syms[s]={overnightReturnPct:(c.open/p.close-1)*100,intradayReturnPct:(c.close/c.open-1)*100,closeToCloseReturnPct:(c.close/p.close-1)*100}}
 return {date,previousDate,calendarGapDays:(Date.parse(date)-Date.parse(previousDate))/86400000,symbols:syms}
}
function windowStats(rows,startingEquity){
 let peak=startingEquity,maxDrawdownPct=0
 for(const row of rows){peak=Math.max(peak,row.equity);maxDrawdownPct=Math.min(maxDrawdownPct,(row.equity/peak-1)*100)}
 const finalEquity=rows.at(-1).equity
 return {initialClose:allDates[allDates.indexOf(rows[0].date)-1],firstSession:rows[0].date,finalClose:rows.at(-1).date,sessions:rows.length,startingEquity,finalEquity,pnlUsd:finalEquity-startingEquity,returnPct:(finalEquity/startingEquity-1)*100,maxDrawdownPct,costUsd:rows.reduce((v,r)=>v+r.tradingCostUsd+r.borrowCostUsd,0),longDays:rows.filter(r=>r.gasPosition>0).length,shortDays:rows.filter(r=>r.gasPosition<0).length,fallbackDays:rows.filter(r=>r.gasPosition===0).length}
}
function simulate(definition,scenarioId){
 let state={closeWeights:{...initialWeights},previousDate:'2026-07-24'},equity=startEquity
 const rows=[]
 for(const t of targetsByVariant[definition.id]){
  const date=t.targetDate,before=equity
  const desired=targetWeightsForAllocation(contract,{gasPosition:t.gasPosition,investedIndexFraction:t.indexFraction})
  const step=applyExecutionStep({state,day:dayFor(date),targetWeights:desired,contract,scenarioId})
  equity*=1+step.netReturnPct/100
  rows.push({date,gasPosition:t.gasPosition,signalDate:t.signalDate,thesis:t.thesisKind,equity,netReturnPct:step.netReturnPct,tradingCostUsd:before*step.tradingCostPct/100,borrowCostUsd:before*step.borrowCostPct/100,turnover:step.totalTurnover,step})
  state=step.state
 }
 const recent=rows.filter(r=>r.date>='2026-08-27'),recentStart=rows.find(r=>r.date==='2026-08-26').equity
 return {variantId:definition.id,label:definition.label,scenarioId,fullPeriod:windowStats(rows,startEquity),lastMonth:windowStats(recent,recentStart),rows}
}
const simulations=definitions.flatMap(d=>['baseline','elevated','stress'].map(s=>simulate(d,s)))
for(const scenario of ['baseline','elevated','stress']){
 const starts=simulations.filter(s=>s.scenarioId===scenario).map(s=>s.lastMonth.startingEquity)
 assert.ok(starts.every(v=>v===starts[0]),'Last-month P&L comparison requires equal August26 starting wealth')
}
for(const sim of simulations){
 const fallback=simulations.find(s=>s.variantId==='fallback'&&s.scenarioId===sim.scenarioId)
 for(const key of ['fullPeriod','lastMonth'])sim[key].relativeToFallbackUsd=sim[key].pnlUsd-fallback[key].pnlUsd
}
const priorSummary=read(`${dir}/summary.json`)
for(const scenarioId of ['baseline','elevated','stress']){
 const prior=priorSummary.simulations.find(s=>s.scenarioId===scenarioId&&!s.fallback&&!s.delaySessions)
 assert.equal(simulations.find(s=>s.variantId==='current'&&s.scenarioId===scenarioId).fullPeriod.finalEquity,prior.finalEquity)
}
assert.equal(simulations.find(s=>s.variantId==='fallback'&&s.scenarioId==='baseline').fullPeriod.finalEquity,priorSummary.simulations.find(s=>s.fallback).finalEquity)
// Independently reconstruct every baseline candidate with cash + adjusted shares.
const verification={},gasEpisodesByVariant={},ordersByVariant={}
for(const definition of definitions){
 let cash=snapshot.account.cashUsd,shares=Object.fromEntries(symbols.map(s=>[s,initialWeights[s]*startEquity/bars[s].get('2026-07-24').close]))
 let maxDifference=0,episode={inherited:true,entryDate:'2026-07-24 close',side:'long',entryPrice:bars.UNG.get('2026-07-24').close,entryNotional:initialWeights.UNG*startEquity,cashFlow:-initialWeights.UNG*startEquity,costUsd:0}
 const episodes=[],orders=[],sim=simulations.find(s=>s.variantId===definition.id&&s.scenarioId==='baseline')
 for(let i=0;i<dates.length;i++){
  const date=dates[i],openEquity=cash+symbols.reduce((sum,s)=>sum+shares[s]*bars[s].get(date).open,0)
  const openWeights=Object.fromEntries(symbols.map(s=>[s,shares[s]*bars[s].get(date).open/openEquity]))
  const t=targetsByVariant[definition.id][i],target=targetWeightsForAllocation(contract,{gasPosition:t.gasPosition,investedIndexFraction:t.indexFraction})
  const decisions=rebalanceDecisionsForAllocation({legs:symbols.map(s=>({symbol:s,current:openWeights[s],target:target[s]})),deadband:contract.rebalanceDeadbandPct/100,forceRiskReduction:symbols.reduce((v,s)=>v+Math.abs(openWeights[s]),0)>contract.deploymentFraction+1e-12})
  for(const symbol of symbols)if(decisions[symbol].executes){
   const price=bars[symbol].get(date).open,value=target[symbol]*openEquity-shares[symbol]*price,delta=value/price,cost=Math.abs(value)*contract.scenarios.baseline.oneWayBps[symbol]/10000
   orders.push({date,symbol,side:delta>0?'buy':'sell',adjustedQuantity:Math.abs(delta),adjustedPrice:price,notionalUsd:Math.abs(value),costUsd:cost})
   if(symbol==='UNG'){
    const oldQty=shares.UNG,newQty=oldQty+delta
    const parts=Math.sign(oldQty)!==Math.sign(newQty)&&Math.abs(oldQty)>1e-8&&Math.abs(newQty)>1e-8?[-oldQty,newQty]:[delta]
    let qty=oldQty
    for(const part of parts){
     if(Math.abs(qty)<1e-8)episode={inherited:false,entryDate:date,side:part>0?'long':'short',entryPrice:price,entryNotional:Math.abs(part*price),cashFlow:0,costUsd:0}
     const tradeValue=part*price,tradeCost=Math.abs(tradeValue)*contract.scenarios.baseline.oneWayBps.UNG/10000
     episode.cashFlow-=tradeValue+tradeCost;episode.costUsd+=tradeCost;qty+=part
     if(Math.abs(qty)<1e-8){episodes.push({...episode,exitDate:date,exitPrice:price,pnlUsd:episode.cashFlow,entryToExitInstrumentReturnPct:(price/episode.entryPrice-1)*100});episode=null}
    }
   }
   shares[symbol]+=delta;cash-=value+cost
  }
  const checkEquity=cash+symbols.reduce((sum,s)=>sum+shares[s]*bars[s].get(date).close,0)
  maxDifference=Math.max(maxDifference,Math.abs(checkEquity-sim.rows[i].equity))
  assert.ok(Math.abs(checkEquity-sim.rows[i].equity)<0.01,`${definition.id} cash ledger differs on ${date}`)
 }
 assert.equal(episode,null,'No open gas episode expected at end')
 gasEpisodesByVariant[definition.id]=episodes;ordersByVariant[definition.id]=orders
 verification[definition.id]={largestCashLedgerDifferenceUsd:maxDifference,futureStorageRemovalInvariant:true}
}
const summary={generatedAt:new Date().toISOString(),researchOnly:true,executionEligible:false,selectionPolicy:'All variants frozen as ablations before this run; no recent-period winner selection. This period was already observed and motivated hypotheses, so this is not untouched holdout.',definitions,method:{startingEquity:startEquity,startingPositions:'Same actual July24 close positions as original replay',lastMonth:'Aug27–Sep25, continuous subwindow starting at each simulated Aug26 close; identical baseline-cost wealth at that boundary across variants',execution:'Adjusted open rebalance, prior-close holdings earn overnight returns; retained 2% cash and 80/20 VOO/QQQM fallback; original deadband and friction contract',noShortChange:'Summer schedule reversionHoldDays set to zero; Winter unchanged',ungPriceChange:'Completed UNG adjusted closes replace completed NG=F adjusted closes as summer price-gate input; no future closes'},simulations:simulations.map(({rows,...s})=>s),verification,baselineExactlyMatchesOriginal:true,inputDigests:{...priorSummary.inputDigests,...Object.fromEntries(inputs.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),[sourcePath]:crypto.createHash('sha256').update(source).digest('hex'),[shadowSourcePath]:crypto.createHash('sha256').update(transformed).digest('hex')},gasEpisodesByVariant}
fs.writeFileSync(`${dir}/variants-summary.json`,JSON.stringify(summary,null,2)+'\n')
fs.writeFileSync(`${dir}/variants-targets.json`,JSON.stringify(targetsByVariant,null,2)+'\n')
fs.writeFileSync(`${dir}/variants-curves.json`,JSON.stringify(simulations,null,2)+'\n')
fs.writeFileSync(`${dir}/variants-orders.json`,JSON.stringify(ordersByVariant,null,2)+'\n')
fs.writeFileSync(`${dir}/variants-trades.json`,JSON.stringify(gasEpisodesByVariant,null,2)+'\n')
const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
let report='# Recent-period Summer simplification replay\n\nResearch-only comparison. No production rule changed and no orders submitted. The outage was already observed and motivated these hypotheses: this is a retrospective diagnostic, not untouched validation and not a selection period.\n\n'
for(const [key,label] of [['fullPeriod','July 27–September 25 (44 sessions; July 24 close initial account)'],['lastMonth','August 27–September 25 (continuous last-month window; August 26 close initial value)']]){
 report+=`## ${label}\n\n| Variant | Starting equity | Ending equity | P&L | Return | Max daily drawdown | Versus fallback P&L | Long / short days |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`
 for(const sim of simulations.filter(s=>s.scenarioId==='baseline')){const w=sim[key];report+=`| ${sim.label} | $${fmt(w.startingEquity)} | $${fmt(w.finalEquity)} | $${fmt(w.pnlUsd)} | ${fmt(w.returnPct)}% | ${fmt(w.maxDrawdownPct)}% | $${fmt(w.relativeToFallbackUsd)} | ${w.longDays} / ${w.shortDays} |\n`}
 report+='\n'
}
report+='## Cost sensitivity (full period)\n\n| Variant | Baseline P&L | Elevated P&L | Stress P&L |\n|---|---:|---:|---:|\n'
for(const d of definitions)report+=`| ${d.label} | ${['baseline','elevated','stress'].map(c=>'$'+fmt(simulations.find(s=>s.variantId===d.id&&s.scenarioId===c).fullPeriod.pnlUsd)).join(' | ')} |\n`
report+='\n## Interpretation and verification\n\n- Removing Summer shorts and changing price to UNG are identical when combined because only the reversion gate consumes the Summer price move in this frozen contract.\n- Current strategy targets and all three cost-scenario endings exactly reproduce the original replay; fallback baseline does too.\n- Every candidate independently reconciles to a cash/share ledger within one cent. Removing all not-yet-released storage observations leaves every target unchanged.\n- Targets use only forecasts issued before the active trade, completed prior-session prices, and storage available by the target open. Forecast window and source validation match the original replay.\n- July24 inherited UNG exposure loses money before first rebalance; every variant shares that inherited position. It must not be attributed to a newly proposed rule.\n- UNG adjusted bars embed instrument tracking and roll effects; this model does not reconstruct actual quotes, intraday reassessment, partial fills, or borrow availability. Stress cost includes borrow financing.\n- Full targets, daily curves/steps, modeled order legs, and gas episodes are saved next to this report.\n'
fs.writeFileSync(`${dir}/variants-report.md`,report)
console.log(JSON.stringify(summary.simulations,null,2))
