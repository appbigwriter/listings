import {describe,it,expect,vi,afterEach} from 'vitest';
import {assertOfferAuthority,recordOfferAuthority} from '../lib/catalog/offer-authority';
import {createCatalog} from '../lib/catalog/model';
const auth={userId:'owner',organizationId:'org',roles:['admin' as const],mode:'supabase-session' as const},account={sellerId:'SELLER',marketplaceId:'ATVPDKIKX0DER'},now=Date.parse('2026-10-06T02:30:00Z');
function product(){const item={sku:'OFFER-001',title:'Sign',price:20,qty:0,asin:'B012345678',fulfillment:'FBM',_catalog:createCatalog({sku:'OFFER-001'})};item._catalog.channels['amazon-us']!.offer_authority=recordOfferAuthority(item,auth,account,['price','qty'],{enabled:true,reason:'Confirmed pricing and stock worksheet.',expires_hours:24},now);return item;}
afterEach(()=>vi.unstubAllEnvs());
describe('signed account-scoped offer authority',()=>{
 it('requires persistent field permission, preserves zero stock and binds the exact account/version',()=>{
  const item=product();expect(assertOfferAuthority(item,auth,account,['qty'],now)).toMatchObject({status:'active',fields:['qty']});
  expect(()=>assertOfferAuthority({...item,price:21},auth,account,['qty'],now)).toThrow('versão');
  expect(()=>assertOfferAuthority({...item,title:'Changed'},auth,account,['price'],now)).toThrow('versão');
  expect(()=>assertOfferAuthority(item,{...auth,userId:'other'},account,['price'],now)).toThrow('proprietário');
  expect(()=>assertOfferAuthority(item,auth,{...account,sellerId:'OTHER'},['price'],now)).toThrow('conta');
 });
 it('rejects omitted, expired, paused, unsupported-field and tampered authority',()=>{
  const item=product();expect(()=>assertOfferAuthority(item,auth,account,['price'],now+86400001)).toThrow('vencida');
  item._catalog.channels['amazon-us']!.offer_authority=recordOfferAuthority(item,auth,account,['price'],{enabled:true,reason:'Price only'},now);
  expect(()=>assertOfferAuthority(item,auth,account,['qty'],now)).toThrow('Campos');
  item._catalog.channels['amazon-us']!.offer_authority.reason='Forged';expect(()=>assertOfferAuthority(item,auth,account,['price'],now)).toThrow('Autoridade não corresponde');
  item._catalog.channels['amazon-us']!.offer_authority=recordOfferAuthority(item,auth,account,['price'],{enabled:false,reason:'Pause until inventory reconciled'},now);
  expect(()=>assertOfferAuthority(item,auth,account,['price'],now)).toThrow('pausada');
  delete item._catalog.channels['amazon-us']!.offer_authority;expect(()=>assertOfferAuthority(item,auth,account,['price'],now)).toThrow('Registre');
 });
 it('requires admin, a reason and bounded duration and survives signing-key rotation fail closed',()=>{
  const item=product();expect(()=>recordOfferAuthority(item,{...auth,roles:['operator']},account,['price'],{enabled:true,reason:'Approved'},now)).toThrow('papel');
  expect(()=>recordOfferAuthority(item,auth,{...account,sellerId:''},['price'],{enabled:true,reason:'Approved'},now)).toThrow('conta vendedora');
  expect(()=>recordOfferAuthority(item,auth,account,['price'],{enabled:true,reason:''},now)).toThrow('motivo');
  expect(()=>recordOfferAuthority(item,auth,account,['price'],{enabled:true,reason:'Approved',expires_hours:169},now)).toThrow('168');
  vi.stubEnv('PRELISTING_REVIEW_SECRET','different-test-signing-key');expect(()=>assertOfferAuthority(item,auth,account,['price'],now)).toThrow('Autoridade não corresponde');
 });
});
