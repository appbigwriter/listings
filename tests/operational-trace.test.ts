import {describe,it,expect} from 'vitest';
import {traceEvent,traceHash,traceSnapshot,traceRequest,withTrace} from '../lib/operations/trace';
describe('sanitized operation traces',()=>{
 it('keeps parallel requests separate and inherits job/correlation IDs across asynchronous child spans',async()=>{
  const lines:string[]=[],job='00000000-0000-4000-8000-000000000001',contexts:any[]=[];
  await Promise.all(['first','second'].map(label=>withTrace('request',{job_id:job,sku_hash:traceHash(label)},async()=>{
   const root=traceSnapshot();await new Promise(resolve=>setTimeout(resolve,label==='first'?5:1));
   await withTrace('catalog.action',{},async()=>{const child=traceSnapshot();expect(child.correlation_id).toBe(root.correlation_id);expect(child.parent_span_id).toBe(root.span_id);expect(child.job_id).toBe(job);expect(child.span_id).not.toBe(root.span_id);contexts.push(child);});
  },line=>lines.push(line))));
  expect(contexts[0].correlation_id).not.toBe(contexts[1].correlation_id);expect(traceSnapshot()).toEqual({});expect(lines.map(line=>JSON.parse(line).event)).toContain('catalog.action.finished');
 });
 it('omits tokens, personal text, URLs, errors and coerced provider objects from logs and durable snapshots',async()=>{
  const lines:string[]=[],spoof={secret:'DO_NOT_LOG',toString:()=> 'amazon'};
  await withTrace('request',{authorization:'Bearer DO_NOT_LOG',email:'private@example.com',sku:'private@example.com',provider:spoof,error_kind:{message:'DO_NOT_LOG'},correlation_id:'not-a-uuid'},async()=>{
   expect(traceSnapshot()).not.toHaveProperty('authorization');traceEvent('provider.response',{provider:spoof,request_body:{secret:'DO_NOT_LOG'},error_message:'DO_NOT_LOG',url:'https://secret.example/token',http_status:403});
  },line=>lines.push(line));
  expect(lines.join('\n')).not.toContain('DO_NOT_LOG');expect(lines.join('\n')).not.toContain('private@example.com');expect(lines.join('\n')).not.toContain('secret.example');expect(JSON.parse(lines[1])).toMatchObject({event:'provider.response',http_status:403});expect(JSON.parse(lines[1])).not.toHaveProperty('provider');
 });
 it('never turns logger failure into a retryable operation error and preserves original failures',async()=>{
  expect(await withTrace('request',{},async()=>42,()=>{throw new Error('logger unavailable');})).toBe(42);
  const original=new Error('DO_NOT_LOG');const lines:string[]=[];
  await expect(withTrace('request',{},async()=>{throw original;},line=>lines.push(line))).rejects.toBe(original);expect(lines.join('')).not.toContain(original.message);
 });
 it('returns a server-generated correlation header and preserves immutable responses',async()=>{
  const response=await traceRequest('request',async()=>Response.json({ok:true}));expect(response.headers.get('x-correlation-id')).toMatch(/^[a-f0-9-]{36}$/);
  const redirect=Response.redirect('https://example.com/');expect(await traceRequest('request',async()=>redirect)).toBe(redirect);
  await withTrace('parent',{},async()=>{const id=traceSnapshot().correlation_id;const nested=await traceRequest('child',async()=>Response.json({ok:true}));expect(nested.headers.get('x-correlation-id')).toBe(id);});
 });
});
