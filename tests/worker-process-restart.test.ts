import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {describe,it,expect} from 'vitest';
function run(directory:string,phase:string){
 const child=spawn(process.execPath,['--import=tsx',resolve('scripts/qa/worker-process-fixture.ts'),directory,phase],{cwd:process.cwd(),windowsHide:true,env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout!.on('data',data=>{output+=data;});child.stderr!.on('data',data=>{errors+=data;});
 const closed=new Promise<{code:number|null;output:string;errors:string}>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error('Worker fixture exceeded 40 seconds'));},40000);child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);resolve({code,output,errors});});});
 void closed.catch(()=>{}); // If ready fails first, finally still awaits this process before cleanup.
 const ready=phase==='resume'?Promise.resolve():new Promise<void>((resolve,reject)=>{child.stdout!.on('data',()=>{if(output.includes('ready_to_kill'))resolve();});child.on('error',reject);child.on('close',()=>{if(!output.includes('ready_to_kill'))reject(new Error(errors||'fixture exited before checkpoint'));});});
 return {child,closed,ready};
}
describe('actual process crash and persistent worker checkpoint',()=>{
 it('retains the committed item, respects the old lease and resumes only the unfinished item after expiry',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'prelisting-worker-restart-')),children:ReturnType<typeof run>[]=[];
  try{
   const first=run(directory,'crash');children.push(first);await first.ready;first.child.kill();await first.closed;
   const second=run(directory,'resume');children.push(second);const result=await second.closed;expect(result.code,result.errors).toBe(0);
   const report=JSON.parse(result.output.trim().split(/\r?\n/).at(-1)!);expect(report).toMatchObject({status:'completed',cursor:2,indices:[0,1],lease_expiry:'simulated',network:'blocked'});
   expect(report.versions).toEqual([{sku:'TEST-RESTART-A',total:2},{sku:'TEST-RESTART-B',total:2}]);
  }finally{
   for(const {child} of children)if(child.exitCode===null&&child.signalCode===null)child.kill();
   await Promise.allSettled(children.map(entry=>entry.closed));
   // Delete only the unique temporary directory created above, after checking its absolute target.
   const target=realpathSync(directory);if(dirname(target)!==realpathSync(tmpdir())||!basename(target).startsWith('prelisting-worker-restart-'))throw new Error('Unexpected test cleanup path');
   rmSync(target,{recursive:true,force:true});
  }
 },60000);
});
