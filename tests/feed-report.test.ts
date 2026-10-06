import {describe,expect,it} from 'vitest';
import {interpretFeedReport} from '../lib/catalog/feed-report';
import {validateFeedDocument} from '../lib/marketplaces/feed-schema';
import {isAmazonDocumentUrl} from '../lib/marketplaces/amazon-feeds';
const manifest=[{sku:'A',hash:'a',updated_at:'2026-10-05',message_id:1},{sku:'B',hash:'b',updated_at:'2026-10-05',message_id:2}];
const report=()=>({header:{sellerId:'SELLER',version:'2.0',feedId:'FEED'},issues:[] as any[],summary:{errors:0,warnings:0,messagesProcessed:2,messagesAccepted:2,messagesInvalid:0}});
describe('official feed contract and per-message outcomes',()=>{
  it('marks accepted only after complete counts and never declares buyability',()=>{
    expect(interpretFeedReport(report(),manifest,'SELLER','FEED').map(row=>row.status)).toEqual(['accepted','accepted']);
    const partial=report();partial.summary.messagesProcessed=1;partial.summary.messagesAccepted=1;
    expect(interpretFeedReport(partial,manifest,'SELLER','FEED').map(row=>row.status)).toEqual(['unknown','unknown']);
  });
  it('maps mixed rejection without marking the whole feed successful',()=>{
    const mixed=report();mixed.summary.errors=1;mixed.summary.messagesAccepted=1;mixed.summary.messagesInvalid=1;mixed.issues=[{messageId:2,sku:'B',severity:'ERROR',message:'Invalid material'}];
    expect(interpretFeedReport(mixed,manifest,'SELLER','FEED').map(row=>row.status)).toEqual(['accepted','rejected']);
    mixed.issues[0].sku='A';expect(()=>interpretFeedReport(mixed,manifest,'SELLER','FEED')).toThrow('divergente');
  });
  it('rejects wrong account/feed, malformed official report and unknown messages',()=>{
    expect(()=>interpretFeedReport(report(),manifest,'OTHER','FEED')).toThrow('outra conta');
    expect(()=>interpretFeedReport({header:{}},manifest,'SELLER','FEED')).toThrow('schema oficial');
    const wrong=report();wrong.issues=[{messageId:99,severity:'WARNING',message:'Unknown'}];expect(()=>interpretFeedReport(wrong,manifest,'SELLER','FEED')).toThrow('desconhecido');
  });
  it('validates the official feed envelope and restricts presigned destinations',()=>{
    expect(()=>validateFeedDocument({header:{sellerId:'SELLER',version:'2.0'},messages:[{messageId:1,sku:'A',operationType:'UPDATE',productType:'SIGN',attributes:{item_name:[{value:'Sign'}]}}]})).not.toThrow();
    expect(()=>validateFeedDocument({header:{sellerId:'SELLER',version:'1.0'},messages:[]})).toThrow('schema oficial');
    expect(isAmazonDocumentUrl('https://bucket.s3.amazonaws.com/file?signature=fixture')).toBe(true);
    expect(isAmazonDocumentUrl('https://amazonaws.com.evil.example/file')).toBe(false);expect(isAmazonDocumentUrl('http://bucket.s3.amazonaws.com/file')).toBe(false);
  });
});
