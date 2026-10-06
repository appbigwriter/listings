import {readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
// Smoke only: shadow env files without printing or forwarding their secret values.
const env={...process.env};
for(const file of ['.env','.env.local','.env.development','.env.development.local'])if(existsSync(file))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
 const key=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];if(key)env[key]='';
}
for(const key of Object.keys(env))if(/SUPABASE|AMAZON|OPENAI|EBAY|WALMART|TIKTOK|AWS_|AUTH_.*SECRET|TOKEN|SOURCE_CATALOG/.test(key))env[key]='';
Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',PRELISTING_AUTH_MODE:'supabase-session',PRELISTING_ALLOW_LOCAL_ONLY:'false',PRELISTING_ENABLE_PUBLICATION:'false',PRELISTING_ENABLE_FEEDS:'false',PRELISTING_ENABLE_OFFER_PATCH:'false',PRELISTING_ENABLE_EBAY_PUBLICATION:'false',PRELISTING_RECOVERY_MODE:'true'});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','33100'],{env,stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{process.stderr.write('Isolated preview failed to start.\n');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
