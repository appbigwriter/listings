import {afterEach,describe,expect,it,vi} from 'vitest';
import {marketplaceToken} from '../lib/marketplaces/oauth';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('marketplace token renewal',()=>{
  it('shares eBay refresh, caches expiry and does not expose failed response contents',async()=>{
    vi.stubEnv('EBAY_CLIENT_ID',crypto.randomUUID());vi.stubEnv('EBAY_CLIENT_SECRET','fixture');vi.stubEnv('EBAY_REFRESH_TOKEN','fixture');
    const fetcher=vi.fn(async(_input:string|URL,_init?:RequestInit)=>Response.json({access_token:'fixture',expires_in:3600}));vi.stubGlobal('fetch',fetcher);
    expect(await Promise.all([marketplaceToken('ebay'),marketplaceToken('ebay')])).toEqual(['fixture','fixture']);expect(fetcher).toHaveBeenCalledTimes(1);
    await marketplaceToken('ebay');expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubEnv('EBAY_CLIENT_ID',crypto.randomUUID());vi.stubGlobal('fetch',vi.fn(async()=>Response.json({secret:'must not appear'},{status:401})));
    await expect(marketplaceToken('ebay')).rejects.toThrow('HTTP 401');
  });
  it('uses Walmart client credentials on its Marketplace endpoint',async()=>{
    vi.stubEnv('WALMART_CLIENT_ID',crypto.randomUUID());vi.stubEnv('WALMART_CLIENT_SECRET','fixture');
    const fetcher=vi.fn(async(_input:string|URL,_init?:RequestInit)=>Response.json({access_token:'fixture',expires_in:900}));vi.stubGlobal('fetch',fetcher);
    expect(await marketplaceToken('walmart')).toBe('fixture');expect(fetcher.mock.calls[0][0]).toBe('https://marketplace.walmartapis.com/v3/token');
  });
});
