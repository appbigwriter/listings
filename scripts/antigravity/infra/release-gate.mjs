import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Local preparation checks are useful without a deployment. Staging adds external proof.
const staging=process.argv.includes('--staging');
const commands=[['node',['scripts/antigravity/infra/config-check.mjs']],['node',['scripts/antigravity/infra/drift-check.mjs']],['npm',['run','migrations:verify']],['npm',['test']],['npm',['run','typecheck']],['npm',['run','build']]];
for(const [command,args] of commands){const executable=process.platform==='win32'&&command==='npm'?'npm.cmd':command;const result=spawnSync(executable,args,{stdio:'inherit',windowsHide:true,shell:process.platform==='win32'&&command==='npm'});if(result.status!==0)process.exit(result.status??1);}
if(staging){
  const drift=spawnSync(process.execPath,['scripts/antigravity/infra/remote-drift.mjs'],{stdio:'inherit',windowsHide:true});if(drift.status!==0)process.exit(drift.status??1);
  for(const key of ['AG04_CLAMAV_IMAGE','AG04_POSTGRES_IMAGE'])if(!/^\S+@sha256:[a-f0-9]{64}$/.test(process.env[key]||''))throw new Error('Staging images must use verified digest references');
  const path=process.env.AG04_ATTESTATION_FILE;if(!path)throw new Error('Staging needs independently recorded environment evidence');
  const proof=JSON.parse(readFileSync(path,'utf8'));
  for(const flag of ['private_scanner_live_passed','synthetic_restore_passed','destination_reviewed','migration_drift_checked','supervisor_restart_passed'])if(proof[flag]!==true)throw new Error('Staging evidence is incomplete');
  const date=Date.parse(proof.checked_at);if(!Number.isFinite(date)||date>Date.now()+300000||Date.now()-date>86400000)throw new Error('Staging evidence must be fresh');
}
console.log(JSON.stringify({gate:staging?'staging_preparation':'local_preparation',status:'passed',deployment:false,publication:false}));
