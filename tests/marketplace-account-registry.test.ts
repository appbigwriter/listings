import {describe,expect,it} from 'vitest';
import {validateMarketplaceAccount} from '../lib/marketplaces/account-registry';
describe('marketplace account registry',()=>{
 it('stores only scoped identifiers and a vault reference, refusing secrets and invalid channels',()=>{
  expect(validateMarketplaceAccount({channel:'amazon-us',account_id:'A1',marketplace_id:'ATVPDKIKX0DER',credential_ref:'vault://prelisting/amazon/a1',configuration:{region:'us-east-1'}})).toMatchObject({status:'configured',channel:'amazon-us'});
  expect(()=>validateMarketplaceAccount({channel:'mercado-livre',account_id:'A1',marketplace_id:'US',credential_ref:'vault://x'})).toThrow('Canal');
  expect(()=>validateMarketplaceAccount({channel:'amazon-us',account_id:'A1',marketplace_id:'US',credential_ref:'vault://x',configuration:{refresh_token:'secret'}})).toThrow('segredo');
 });
});
