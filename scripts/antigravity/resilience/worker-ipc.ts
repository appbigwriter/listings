import {workerDatabaseAdapter} from '../../../tests/fixtures/pglite-worker-adapter';
import {processJob} from '../../../lib/catalog/jobs';
globalThis.fetch=async()=>{throw new Error('Network blocked in AG05 isolated fixture');};
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();let counter=0;
process.on('message',(message:any)=>{const waiter=pending.get(message?.request);if(!waiter)return;pending.delete(message.request);if(message.error)waiter.reject(new Error(message.error));else waiter.resolve(message.result);});
const db={query(sql:string,params:any[]=[]){const request=++counter;return new Promise((resolve,reject)=>{pending.set(request,{resolve,reject});process.send!({type:'query',request,sql,params});});}};
const owner='00000000-0000-4000-8000-000000000001';
processJob(workerDatabaseAdapter(db as any) as any,{userId:owner,organizationId:owner,mode:'trusted-gateway'},process.argv[2]).then(result=>{process.send!({type:'result',result:{status:result.status,cursor:result.cursor}},()=>process.disconnect());}).catch(error=>{process.send!({type:'result',error:{status:error.status,message:error.message}},()=>process.disconnect());});
