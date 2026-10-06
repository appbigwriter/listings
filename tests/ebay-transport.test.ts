import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../lib/marketplaces/oauth',()=>({marketplaceToken:async()=> 'test-only-token',oauthConfigured:()=>true}));
import {assertEbayAccount,ebayRequest,EbayError} from '../lib/marketplaces/ebay';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('server eBay transport',()=>{
 it('uses production-only URLs, en-US mutation headers and accepts the documented empty PUT response',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);
  expect(await ebayRequest('/sell/inventory/v1/inventory_item/SKU','PUT',{condition:'NEW'})).toEqual({});
  expect(fetch).toHaveBeenCalledWith('https://api.ebay.com/sell/inventory/v1/inventory_item/SKU',expect.objectContaining({method:'PUT',redirect:'error',headers:expect.objectContaining({'content-language':'en-US','content-type':'application/json'})}));
  expect(()=>ebayRequest('//attacker.example/path')).toThrow('inválido');expect(()=>ebayRequest('https://attacker.example/path')).toThrow('inválido');
 });
 it('returns only the confirmed immutable account ID and discards contact information',async()=>{
  vi.stubEnv('EBAY_ACCOUNT_ID','immutable-id');const fetch=vi.fn().mockResolvedValue(Response.json({userId:'immutable-id',businessAccount:{email:'not-retained@example.com'},address:{city:'private'}}));vi.stubGlobal('fetch',fetch);
  expect(await assertEbayAccount()).toEqual({account_id:'immutable-id',marketplace_id:'EBAY_US'});expect(fetch.mock.calls[0][0]).toBe('https://apiz.ebay.com/commerce/identity/v1/user/');
 });
 it('rejects a foreign account and sanitizes provider errors without repeating their message',async()=>{
  vi.stubEnv('EBAY_ACCOUNT_ID','expected');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({userId:'foreign'})));await expect(assertEbayAccount()).rejects.toThrow('outra conta');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({errors:[{errorId:25702,message:'sensitive provider data'}]},{status:400})));
  await expect(ebayRequest('/sell/inventory/v1/inventory_item/SKU')).rejects.toEqual(new EbayError(400,[25702]));
 });
});
