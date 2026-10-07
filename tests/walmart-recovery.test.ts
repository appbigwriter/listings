import {describe,expect,it} from 'vitest';
import {validateWalmartRecoveryInput} from '../lib/catalog/walmart-executor';
const created='2026-10-06T20:00:00.000Z';
function record(patch:Record<string,unknown>={}){return {sku:'WM-1',status:'unknown',created_at:created,response:{stage:'feed_request_started'},request_payload:{MPItem:[{Orderable:{sku:'WM-1',productIdentifiers:{productIdType:'GTIN',productId:'00012345678905'}}}]},...patch};}
describe('Walmart uncertain-feed recovery',()=>{
 it('requires exact manifest SKU/GTIN and a compatible audited observation while preserving unknown status',()=>{
  const result=validateWalmartRecoveryInput(record(),{feed_id:'F@US',evidence:'Operador conferiu o recibo no portal Walmart.',observed_at:'2026-10-06T20:04:00.000Z'},Date.parse('2026-10-06T20:06:00.000Z'));
  expect(result).toMatchObject({feedId:'F@US',gtin:'00012345678905'});
  expect(()=>validateWalmartRecoveryInput(record({response:{stage:'feed_request_started',feed_id:'known'}}),{feed_id:'F@US',evidence:'Operador conferiu o recibo no portal Walmart.',observed_at:'2026-10-06T20:04:00.000Z'},Date.parse('2026-10-06T20:06:00.000Z'))).toThrow('incerto');
  expect(()=>validateWalmartRecoveryInput(record({request_payload:{MPItem:[{Orderable:{sku:'OTHER',productIdentifiers:{productIdType:'GTIN',productId:'00012345678905'}}}]}}),{feed_id:'F@US',evidence:'Operador conferiu o recibo no portal Walmart.',observed_at:'2026-10-06T20:04:00.000Z'},Date.parse('2026-10-06T20:06:00.000Z'))).toThrow('SKU e GTIN');
 });
});
