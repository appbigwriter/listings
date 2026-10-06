import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,hex=/^[a-f0-9]{64}$/;
const ids=new Set(['correlation_id','span_id','parent_span_id','job_id','feed_id','submission_id','event_id','ai_operation_id','provider_request_id']);
const hashes=new Set(['sku_hash','organization_hash','workflow_hash','content_hash']);
const numbers=new Set(['duration_ms','http_status','cursor','total','attempt','prompt_tokens','completion_tokens']);
const states=new Set(['accepted','rejected','unknown','published','processing','completed','cancelled','pending','failed','returned']);
const actions=new Set(['configure','confirm-facts','classify','schema','generate','media','validate','discover','fees','apply-source-update','review','restrictions','preview','submit','monitor','reconcile','account-preparation']);
type TraceFields=Record<string,unknown>;
type Context={fields:TraceFields;sink:(line:string)=>void};
const context=new AsyncLocalStorage<Context>();
function safe(fields:TraceFields){
 const result:TraceFields={};
 for(const [key,value] of Object.entries(fields)){
  if(ids.has(key)&&typeof value==='string'&&uuid.test(value))result[key]=value.toLowerCase();
  else if(hashes.has(key)&&typeof value==='string'&&hex.test(value))result[key]=value;
  else if(numbers.has(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e15)result[key]=value;
  else if(key==='state'&&typeof value==='string'&&states.has(value))result[key]=value;
  else if(key==='action'&&typeof value==='string'&&actions.has(value))result[key]=value;
  else if(key==='provider'&&typeof value==='string'&&['amazon','ebay','openai','walmart'].includes(value))result[key]=value;
  else if(key==='error_kind'&&typeof value==='string'&&['Error','TypeError','AbortError','TimeoutError','CatalogError','AmazonError','EbayError'].includes(value))result[key]=value;
 }
 return result;
}
export const traceHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function traceSnapshot(additional:TraceFields={}):TraceFields{return {...Object.fromEntries(Object.entries(safe(additional)).filter(([key])=>ids.has(key)||hashes.has(key)||key==='action'||key==='provider')),...context.getStore()?.fields};}
export function traceEvent(event:string,fields:TraceFields={}){
 const current=context.getStore();if(!current)return;
 // Event names are internal constants. Dynamic payloads, URLs, messages and headers are omitted.
 if(!/^[a-z][a-z_.]{1,60}$/.test(event))event='operation.event';
 try{current.sink(JSON.stringify({time:new Date().toISOString(),event,...safe(fields),...current.fields}));}catch{/* Logging failure must never trigger a replay of a marketplace write. */}
}
export async function withTrace<T>(operation:string,fields:TraceFields,run:()=>Promise<T>,sink?:(line:string)=>void):Promise<T>{
 const parent=context.getStore(),accepted=safe(fields),correlation_id=parent?.fields.correlation_id||accepted.correlation_id||randomUUID();
 const identity=Object.fromEntries(Object.entries(accepted).filter(([key])=>ids.has(key)||hashes.has(key)||key==='action'||key==='provider'));
 const current:Context={fields:{...parent?.fields,...identity,correlation_id,span_id:randomUUID(),...(parent?{parent_span_id:parent.fields.span_id}:{})},sink:sink||parent?.sink||(process.env.NODE_ENV==='test'?()=>{}:line=>console.info(line))};
 return context.run(current,async()=>{
  const started=Date.now(),name=/^[a-z][a-z_.]{1,60}$/.test(operation)?operation:'operation';
  traceEvent(name+'.started');
  try{const result=await run();traceEvent(name+'.finished',{state:'returned',duration_ms:Date.now()-started});return result;}
  catch(error){const kind=error instanceof Error?error.name:'Error';traceEvent(name+'.failed',{state:'failed',duration_ms:Date.now()-started,error_kind:kind,http_status:Number((error as any)?.status)});throw error;}
 });
}
export async function traceRequest<T extends Response>(operation:string,run:()=>Promise<T>):Promise<T>{
 // Caller-supplied correlation headers are deliberately not accepted as server identity.
 const parent=traceSnapshot().correlation_id,correlation_id=typeof parent==='string'&&uuid.test(parent)?parent:randomUUID();return withTrace(operation,{correlation_id},async()=>{const response=await run();try{response.headers.set('x-correlation-id',correlation_id);}catch{/* Immutable responses retain their original result; logging cannot change write outcomes. */}traceEvent('request.response',{http_status:response.status});return response;});
}
export async function traceWorkerFailure(operation:string,fields:TraceFields,error:unknown){
 await withTrace(operation,fields,async()=>{traceEvent('worker.failed',{state:'failed',error_kind:error instanceof Error?error.name:'Error',http_status:Number((error as any)?.status)});});
}
