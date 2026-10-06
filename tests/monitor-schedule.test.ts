import {describe,expect,it} from 'vitest';
import {monitorSchedule} from '../lib/catalog/monitor-schedule';
const now=Date.parse('2026-10-06T13:00:00Z'),old=new Date(now-3600000).toISOString(),target={channel:'amazon-us' as const,account_id:'seller',marketplace_id:'ATVPDKIKX0DER'};
function row(patch:Record<string,unknown>={}){return {id:'id',owner_id:'owner',organization_id:'org',sku:'SKU',channel:'amazon-us',status:'accepted',target:{seller_id:'seller',marketplace_id:target.marketplace_id},created_at:old,updated_at:old,...patch};}
describe('bounded read-only polling plan',()=>{
 it('uses only configured account/marketplace and scoped owned receipts, never preparing or publishing',()=>{
  const result=monitorSchedule([row(),row({sku:'foreign',target:{seller_id:'another',marketplace_id:target.marketplace_id}}),row({sku:'unowned',owner_id:null}),row({sku:'new',status:'submitting',updated_at:new Date(now).toISOString()})],[target],now,15);
  expect(result).toHaveLength(1);expect(result[0]).toMatchObject({sku:'SKU',channel:'amazon-us',owner_id:'owner'});expect(result[0].idempotency_identity).not.toHaveProperty('version');
 });
 it('keeps one newest claim and a stable per-window identity despite observation timestamps changing',()=>{
  const first=monitorSchedule([row(),row({id:'new',created_at:new Date(now-3500000).toISOString(),updated_at:new Date(now-2000000).toISOString()})],[target],now,15)[0];
  const refreshed=monitorSchedule([row({id:'new',updated_at:new Date(now-1900000).toISOString()})],[target],now,15)[0];expect(first.idempotency_identity).toEqual(refreshed.idempotency_identity);
  expect(monitorSchedule([row({updated_at:new Date(now-1000).toISOString()})],[target],now,15)).toEqual([]);
  expect(monitorSchedule([row(),row({created_at:new Date(now-1000).toISOString(),status:'rejected'})],[target],now,15)).toEqual([]);
  expect(()=>monitorSchedule([],[target],now,1)).toThrow();
 });
});
