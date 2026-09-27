import assert from 'node:assert/strict'
import { SUMMER_FORECAST_LOCATIONS } from './lib/qore-summer-location-universe.mjs'
import { revisionFeature, latestSupplyVintage, demandDecision } from './lib/qore-simplification-demand.mjs'
const rows = (issueDate, leadDays, temperature) => ['gfs','gefs-mean'].flatMap(sourceId => SUMMER_FORECAST_LOCATIONS.map(({id,weight}) => ({sourceId,issueDate,targetDate:'2026-09-09',leadDays,locationId:id,weight,forecastMeanF:temperature,sampledValidTimeOffsetsHours:'6|12|18|24'})))
const current = rows('2026-09-02',7,80), prior = rows('2026-09-01',8,77)
const feature = revisionFeature('2026-09-02',current,prior,'6|12|18|24')
assert.equal(feature.passes,true); assert.ok(Math.abs(feature.consensusRevisionF-3)<1e-9)
assert.deepEqual(revisionFeature('2026-09-02',[...current,...rows('2026-09-03',7,120)],prior,'6|12|18|24'),feature)
assert.throws(()=>revisionFeature('2026-09-02',current,prior.slice(1),'6|12|18|24'))
assert.throws(()=>revisionFeature('2026-09-02',current,prior,'0'))
const mixed=prior.map(r=>({...r,forecastMeanF:r.sourceId==='gfs'?85:70}))
assert.equal(revisionFeature('2026-09-02',current,mixed,'6|12|18|24').passes,false)
const supply=[{releaseDate:'2026-08-11',productionYoYChangeBcfd:3,lngYoYChangeBcfd:1},{releaseDate:'2026-09-09',productionYoYChangeBcfd:1,lngYoYChangeBcfd:3}]
assert.equal(latestSupplyVintage(supply,'2026-09-09').releaseDate,'2026-08-11')
assert.equal(latestSupplyVintage(supply,'2026-09-10').releaseDate,'2026-09-09')
assert.equal(demandDecision({variant:'supply-balance',storageDeficit:false,supply:supply[0]}),false)
assert.equal(demandDecision({variant:'supply-balance',storageDeficit:true,supply:supply[0]}),true)
assert.equal(demandDecision({variant:'supply-balance',storageDeficit:false,supply:supply[1]}),true)
assert.throws(()=>demandDecision({variant:'supply-balance',storageDeficit:false,supply:null}))
console.log('Demand overlay tests passed: missing atoms, matched dates/statistics, model agreement, future-data invariance and publication lag.')

assert.equal(latestSupplyVintage([{originalReleaseDate:'2026-08-11',releasedAt:'2026-09-12'}, {originalReleaseDate:'2026-09-09',releasedAt:'2026-09-09'}],'2026-09-14').originalReleaseDate,'2026-09-09')
