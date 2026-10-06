import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {describe,it,expect} from 'vitest';
function run(directory:string,phase:string){
 const child=spawn(process.execPath,['--import=tsx',resolve('scripts/antigravity/resilience/ledger-crash.ts'),directory,phase],{windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout!.on('data',data=>output+=data);child.stderr!.on('data',data=>errors+=data);
 const closed=new Promise<any>((resolveResult,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('AG05 process timeout'));},30000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);resolveResult({code,output,errors});});});void closed.catch(()=>{});
 const ready=phase==='resume'?Promise.resolve():new Promise<void>((resolveReady,reject)=>{child.stdout!.on('data',()=>{if(output.includes('ready_to_kill'))resolveReady();});child.on('close',()=>{if(!output.includes('ready_to_kill'))reject(new Error(errors||'No checkpoint'));});child.on('error',reject);});return {child,closed,ready};
}
describe('AG05 persistent submission claims across actual process kills',()=>{
 for(const phase of ['before','after'])it('refuses another submission after crash '+phase+' synthetic external response',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'prelisting-ag05-ledger-')),children:ReturnType<typeof run>[]=[];
  try{
   const first=run(directory,phase);children.push(first);await first.ready;first.child.kill();await first.closed;
   const second=run(directory,'resume');children.push(second);const output=await second.closed;expect(output.code,output.errors).toBe(0);const receipt=JSON.parse(output.output.trim().split(/\r?\n/).at(-1)!);
   expect(receipt).toMatchObject({new_mutation_refused:true,ledger_rows:1,ledger_status:'submitting',external_replay:0,network:'blocked'});expect(receipt.stage).toBe(phase==='after'?'external_request_started':'reserved');
   mkdirSync('artifacts/antigravity/AG-05',{recursive:true});writeFileSync(`artifacts/antigravity/AG-05/ledger-crash-${phase}.json`,JSON.stringify({checked_at:new Date().toISOString(),...receipt,crash_point:phase,real_process_killed:true,external_response:'synthetic_local_fixture_not_marketplace',actual_reservation_rpc:true},null,2));
  }finally{
   for(const child of children)if(child.child.exitCode===null&&child.child.signalCode===null)child.child.kill();await Promise.allSettled(children.map(child=>child.closed));
   const target=realpathSync(directory);if(dirname(target)!==realpathSync(tmpdir())||!basename(target).startsWith('prelisting-ag05-ledger-'))throw new Error('Unsafe temporary cleanup');rmSync(target,{recursive:true,force:true});
  }
 },60000);
});
