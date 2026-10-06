import {describe,expect,it} from 'vitest';
import {getActiveListingSkus} from '../lib/catalog/active-listing';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
function database(count:number) {
  const scopes:any[]=[];
  return {scopes,db:{from:()=>{const builder:any={select:()=>builder,eq:(...args:any[])=>{scopes.push(args);return builder;},neq:()=>builder,order:()=>builder,range:async(from:number,to:number)=>({data:Array.from({length:Math.max(0,Math.min(to+1,count)-from)},(_,index)=>({sku:`A-${index+from}`})),error:null})};return builder;}}};
}
describe('catalog pagination boundaries',()=>{
  it('reads beyond the default API row limit without losing owner/org scope',async()=>{
    const {db,scopes}=database(1501),result=await getActiveListingSkus(db,auth);
    expect(result.skus).toHaveLength(1501);expect(result.skus.at(-1)).toBe('A-1500');expect(scopes.filter(item=>item[0]==='owner_id')).toHaveLength(4);
  });
  it('accepts exactly 5000 and rejects a truncated selection above the limit',async()=>{
    expect((await getActiveListingSkus(database(5000).db,auth)).skus).toHaveLength(5000);
    const excess=await getActiveListingSkus(database(5001).db,auth);expect(excess.error).toBeInstanceOf(Error);expect(excess.skus).toEqual([]);
  });
});
