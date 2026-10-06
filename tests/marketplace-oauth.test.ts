import {afterEach,describe,expect,it,vi} from 'vitest';
import {marketplaceToken,invalidateMarketplaceToken} from '../lib/marketplaces/oauth';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('marketplace token renewal',()=>{
  it('invalidates only the failed provider and refuses a refresh invalidated while in flight',async()=>{
    vi.stubEnv('EBAY_CLIENT_ID',crypto.randomUUID());vi.stubEnv('EBAY_CLIENT_SECRET','fixture');vi.stubEnv('EBAY_REFRESH_TOKEN','fixture');
    let release!:(response:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal('fetch',fetcher);
    const token=marketplaceToken('ebay');invalidateMarketplaceToken('ebay');release(Response.json({access_token:'obsolete',expires_in:3600}));
    await expect(token).rejects.toThrow('mudou durante');
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({access_token:'fresh',expires_in:3600})));expect(await marketplaceToken('ebay')).toBe('fresh');
    invalidateMarketplaceToken('walmart');expect(await marketplaceToken('ebay')).toBe('fresh');
  });
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
