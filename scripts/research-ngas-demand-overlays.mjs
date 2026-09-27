#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { DEMAND_OVERLAY_IDS, revisionFeature, latestSupplyVintage, demandDecision } from './lib/qore-simplification-demand.mjs'
import { loadResearchExecutionContract, loadExecutionCalendar, createExecutionState, targetWeightsForAllocation, applyExecutionStep } from './lib/qore-research-execution.mjs'
const root=process.cwd(), dir='.local/qore/research/ngas-simplification', recent='.local/qore/outage-counterfactual'
const inputs=new Set(['scripts/research-ngas-demand-overlays.mjs','scripts/lib/qore-simplification-demand.mjs','scripts/collect-ngas-supply-vintages.py','scripts/collect-ngas-simplification-revisions.py','config/qore-research-execution.json']), read=(p)=>{inputs.add(p);return JSON.parse(fs.readFileSync(p,'utf8'))}
const csv=(p)=>{inputs.add(p);const r=Papa.parse(fs.readFileSync(p,'utf8'),{header:true,skipEmptyLines:true});assert.equal(r.errors.length,0);return r.data}
const write=(p,x)=>fs.writeFileSync(`${dir}/${p}`,JSON.stringify(x,null,2)+'\n')
const frozenProtocol=read('docs/research/ngas-demand-overlay-protocol.json')
fs.mkdirSync(dir,{recursive:true})
if(!fs.existsSync(`${dir}/demand-protocol.json`))write('demand-protocol.json',frozenProtocol)
const protocol=read(`${dir}/demand-protocol.json`);assert.deepEqual(protocol,frozenProtocol);assert.equal(protocol.selectionEligible,false)
const supply=read(`${dir}/supply-vintages/observations.json`)
const historical=csv(`${dir}/targets.csv`).filter(r=>r.candidateId==='no-summer-fade'&&r.date<='2026-03-31').map(r=>({...r,gasPosition:Number(r.gasPosition),indexFraction:Number(r.indexFraction),summerGasPosition:Number(r.summerGasPosition),summerIndexFraction:Number(r.summerIndexFraction),storageDeficit:r.storageDeficit==='true'}))
const sources=[['gfs','noaa-gfs'],['gefs-mean','noaa-gefs']]
const current=[],previous=[]
for(const [sourceId,subdir] of sources){
 current.push(...csv(`data/qore/weather/${subdir}/${sourceId}-00z-daily-forecast-calendar-2021-05-01-2025-09-30-leads-7-hours-0-location-anomalies.csv`).map(r=>({...r,sourceId})))
 for(const date of [...new Set(historical.filter(r=>r.summerGasPosition>0).map(r=>r.signalDate))]){
  const base=`${dir}/revision-atoms/${sourceId}/${date}`
  const manifest=read(`${base}/weather/${subdir}/prior-manifest.json`);assert.equal(manifest.failures.length,0);assert.equal(manifest.finalCompleteRows,1)
  previous.push(...csv(`${base}/weather/${subdir}/prior-location-anomalies.csv`).map(r=>({...r,sourceId})))
 }
}
const features=new Map([...new Set(historical.filter(r=>r.summerGasPosition>0).map(r=>r.signalDate))].map(date=>[date,revisionFeature(date,current,previous,'0')]))
const output=[]
for(const variant of DEMAND_OVERLAY_IDS)for(const r of historical){
 if(r.summerGasPosition>0)assert.ok(r.storageDate&&r.storageReleaseAt,'Missing historical storage context')
 const vintage=latestSupplyVintage(supply,r.date), feature=features.get(r.signalDate)
 const passes=r.summerGasPosition<=0||demandDecision({variant,revision:feature,storageDeficit:r.storageDeficit,supply:vintage})
 const suppress=r.summerGasPosition>0&&!passes
 output.push({...r,candidateId:`no-summer-fade+${variant}`,gasPosition:suppress?0:r.gasPosition,indexFraction:suppress?1:r.indexFraction,summerGasPosition:suppress?0:r.summerGasPosition,summerIndexFraction:suppress?1:r.summerIndexFraction,suppressed:suppress,supplyReleaseDate:vintage?.releasedAt??null,supplyMonth:vintage?.month??null,productionYoYChangeBcfd:vintage?.productionYoYChangeBcfd??null,lngYoYChangeBcfd:vintage?.lngYoYChangeBcfd??null,revisionPass:feature?.passes??null,revisionCDD:feature?.consensusRevisionF??null,revisionBreadth:feature?.breadth??null})
}
fs.writeFileSync(`${dir}/demand-targets.csv`,Papa.unparse(output)+'\n')
write('historical-revision-features.json',[...features.values()])
const contract=loadResearchExecutionContract(root), days=loadExecutionCalendar(root,{startDate:historical[0].date,endDate:historical.at(-1).date,contract})
assert.equal(days.length,historical.length)
const candidateIds=[...new Set(output.map(r=>r.candidateId))], maps=new Map(candidateIds.map(id=>[id,new Map(output.filter(r=>r.candidateId===id).map(r=>[r.date,r]))]))
function simulate(id,lane,scenarioId){let state=createExecutionState(contract),equity=100000;return days.map(day=>{const t=maps.get(id)?.get(day.date),gas=lane==='fallback'?0:lane==='summer-only'?t.summerGasPosition:t.gasPosition,index=lane==='fallback'?1:lane==='summer-only'?t.summerIndexFraction:t.indexFraction;const step=applyExecutionStep({state,day,targetWeights:targetWeightsForAllocation(contract,{gasPosition:gas,investedIndexFraction:index}),contract,scenarioId});state=step.state;equity*=1+step.netReturnPct/100;return {candidateId:id,lane,scenarioId,date:day.date,gasPosition:gas,netReturnPct:step.netReturnPct,equity,costPct:step.tradingCostPct+step.borrowCostPct}})}
function metrics(rows){let wealth=1,peak=1,dd=0,episodes=0,prior=0;for(const r of rows){wealth*=1+r.netReturnPct/100;peak=Math.max(peak,wealth);dd=Math.min(dd,(wealth/peak-1)*100);if(r.gasPosition&&Math.sign(r.gasPosition)!==Math.sign(prior))episodes++;prior=r.gasPosition}return {sessions:rows.length,returnPct:(wealth-1)*100,maxDrawdownPct:dd,activeSessions:rows.filter(r=>r.gasPosition).length,episodes}}
const periods={train:r=>r.date<='2023-12-31',validation:r=>r.date>='2024-01-01'&&r.date<='2024-12-31',holdout:r=>r.date>='2025-01-01',...Object.fromEntries(['2021','2022','2023','2024','2025','2026'].map(y=>[y,r=>r.date.startsWith(y)]))},results=[],daily=[]
for(const scenarioId of Object.keys(contract.scenarios)){
 const fallback=simulate(null,'fallback',scenarioId)
 for(const id of candidateIds)for(const lane of ['summer-only','all-year']){
  const rows=simulate(id,lane,scenarioId);daily.push(...rows)
  for(const [period,filter]of Object.entries(periods)){const selected=rows.filter(filter);if(!selected.length)continue;const m=metrics(selected),b=metrics(fallback.filter(filter));results.push({candidateId:id,lane,scenarioId,period,...m,fallbackReturnPct:b.returnPct,edgePct:m.returnPct-b.returnPct})}
 }
}
fs.writeFileSync(`${dir}/demand-results.csv`,Papa.unparse(results)+'\n');fs.writeFileSync(`${dir}/demand-daily.csv`,Papa.unparse(daily)+'\n')
// Corrected recent forecasts are a distinct data contract and never spliced into historical fit.
const base=read(`${recent}/variants-targets.json`)['no-summer-shorts'], curr=[],prev=[]
for(const[sourceId,subdir]of sources){curr.push(...csv(`${recent}/noaa/weather/${subdir}/outage-${sourceId}-location-anomalies.csv`).map(r=>({...r,sourceId})));const m=read(`${recent}/revisions-noaa/weather/${subdir}/revision-${sourceId}-manifest.json`);assert.equal(m.failures.length,0);assert.equal(m.missingCompleteRows,0);prev.push(...csv(`${recent}/revisions-noaa/weather/${subdir}/revision-${sourceId}-location-anomalies.csv`).map(r=>({...r,sourceId})))}
const recentFeatures=new Map([...new Set(base.filter(r=>r.gasPosition>0).map(r=>r.signalDate))].map(date=>[date,revisionFeature(date,curr,prev,'6|12|18|24')]))
const extra={},recentAudit=[]
for(const variant of DEMAND_OVERLAY_IDS){const id=`no-summer-shorts+${variant}`;extra[id]=base.map(r=>{
 if(r.gasPosition>0)assert.ok(r.diagnostics.storage.storageDate,'Missing recent storage context')
 const vintage=latestSupplyVintage(supply,r.targetDate),feature=recentFeatures.get(r.signalDate)
 const passes=r.gasPosition<=0||demandDecision({variant,revision:feature,storageDeficit:r.diagnostics.storage.storageDeficit,supply:vintage})
 recentAudit.push({variant,date:r.targetDate,originalGasPosition:r.gasPosition,suppressed:!passes,revision:feature??null,supply:vintage,storage:r.diagnostics.storage})
 return {...r,gasPosition:passes?r.gasPosition:0,indexFraction:passes?r.indexFraction:1,cashFraction:0,executionEligible:false}
})}
write('recent-extra-targets.json',extra);write('recent-demand-audit.json',recentAudit)
write('demand-summary.json',{protocol,selectionEligible:false,firstDate:days[0].date,lastDate:days.at(-1).date,legacyFeatures:[...features.values()].length,recentFeatures:[...recentFeatures.values()],results,inputs:[...inputs].map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}))})
console.log(JSON.stringify({historicalBaselineScenario:results.filter(r=>r.lane==='summer-only'&&r.scenarioId==='baseline'&&['train','validation','2025'].includes(r.period)),recentFeatures:[...recentFeatures.values()],recentCounts:Object.fromEntries(Object.entries(extra).map(([id,rows])=>[id,rows.filter(r=>r.gasPosition>0).length]))},null,2))
