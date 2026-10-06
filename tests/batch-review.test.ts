import { beforeEach,describe,expect,it,vi } from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../lib/catalog/executor',()=>({executeAction:execute}));
import { approveBatchReview,reviewSelection } from '../lib/catalog/batch-review';
import { CatalogError } from '../lib/catalog/repository';
const admin={userId:'owner',organizationId:'org',mode:'supabase-session' as const,roles:['admin'] as ('admin')[]};
const entry=(sku:string)=>({sku,expected_hash:'a'.repeat(64),updated_at:'2026-10-05T18:00:00.000Z'});
beforeEach(()=>execute.mockReset());
describe('version-bound batch review',()=>{
  it('rejects duplicate/oversized/invalid selection before processing',()=>{
    for(const selection of [[],['A','A'],[' '],Array.from({length:101},(_,index)=>String(index))])expect(()=>reviewSelection(selection)).toThrow();
  });
  it('requires reviewer permission and explicit confirmation before processing',async()=>{
    await expect(approveBatchReview({} as any,{...admin,roles:['operator']},[entry('A')],'amazon-us',true)).rejects.toMatchObject({status:403});
    await expect(approveBatchReview({} as any,admin,[entry('A')],'amazon-us',false)).rejects.toMatchObject({status:403});
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects a missing version/hash without partially approving other entries',async()=>{
    await expect(approveBatchReview({} as any,admin,[entry('A'),{sku:'B'}],'amazon-us',true)).rejects.toThrow('versão');
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps stale versions blocked while reporting each independently reviewed SKU',async()=>{
    execute.mockRejectedValueOnce(new CatalogError('A versão mudou.',409)).mockResolvedValueOnce({});
    const outcomes=await approveBatchReview({} as any,admin,[entry('A'),entry('B')],'amazon-us',true);
    expect(outcomes).toEqual([{sku:'A',status:'blocked',error:'A versão mudou.',code:409},{sku:'B',status:'approved'}]);
    expect(execute).toHaveBeenNthCalledWith(2,{},admin,'B','review',{channel:'amazon-us',expected_hash:entry('B').expected_hash,updated_at:entry('B').updated_at});
  });
});
