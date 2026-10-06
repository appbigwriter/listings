import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
export function runtimeEnvironment(config, inherited={}) {
  const allowed=new Set(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRELISTING_APP_URL','PRELISTING_REVIEW_SECRET','OPENAI_API_KEY','OPENAI_MODEL','FBR_SOURCE_SUPABASE_URL','FBR_SOURCE_SUPABASE_ANON_KEY','AMAZON_SP_API_CLIENT_ID','AMAZON_SP_API_CLIENT_SECRET','AMAZON_SP_API_REFRESH_TOKEN','AMAZON_SP_API_SELLER_ID','AMAZON_MARKETPLACE_ID','EBAY_CLIENT_ID','EBAY_CLIENT_SECRET','EBAY_REFRESH_TOKEN','EBAY_ACCOUNT_ID','EBAY_OAUTH_SCOPES','WALMART_CLIENT_ID','WALMART_CLIENT_SECRET','WALMART_SPEC_VERSION','WALMART_CONSUMER_CHANNEL_TYPE']);
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Runtime secret must be a JSON object');
  for(const [key,value] of Object.entries(config))if(!allowed.has(key)||typeof value!=='string'||!value.trim()||value.includes('REPLACE')||value.length>20000)throw new Error('Runtime secret has unsupported or placeholder fields');
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRELISTING_APP_URL','PRELISTING_REVIEW_SECRET'])if(!config[key])throw new Error('Required staging configuration missing');
  const env={PATH:inherited.PATH,HOME:inherited.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',...config,PRELISTING_AUTH_MODE:'supabase-session',PRELISTING_ALLOW_LOCAL_ONLY:'false',PRELISTING_ALLOW_UNSCANNED_EVIDENCE:'false',PRELISTING_RECOVERY_MODE:'true',PRELISTING_ENABLE_PUBLICATION:'false',PRELISTING_ENABLE_FEEDS:'false',PRELISTING_ENABLE_OFFER_PATCH:'false',PRELISTING_ENABLE_EBAY_PUBLICATION:'false',PRELISTING_CLAMD_HOST:'scanner',PRELISTING_CLAMD_PORT:'3310'};
  return env;
}
if(process.argv[1]?.endsWith('runtime.mjs')) {
  try {
    const role=process.argv[2];if(!['web','worker'].includes(role))throw new Error('Invalid runtime role');
    const config=JSON.parse(readFileSync('/run/secrets/runtime_config','utf8'));
    const env=runtimeEnvironment(config,process.env);
    const child=spawn(role==='web'?'./node_modules/.bin/next':'./node_modules/.bin/tsx',role==='web'?['start','-H','0.0.0.0']:['scripts/catalog-worker.ts'],{env,stdio:'inherit'});
    let heartbeat;
    if(role==='worker')child.once('spawn',()=>{
      const beat=()=>{try{writeFileSync('/tmp/ag04-worker-heartbeat.json',JSON.stringify({pid:child.pid,checked_at:new Date().toISOString()}));}catch{console.error('Worker liveness receipt unavailable');}};
      beat();heartbeat=setInterval(beat,15000);
    });
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
    child.on('error',()=>{clearInterval(heartbeat);console.error('Isolated runtime could not start');process.exitCode=1;});
    child.on('exit',code=>{clearInterval(heartbeat);process.exitCode=code??1;});
  } catch {console.error('Isolated runtime configuration refused; secrets not logged');process.exitCode=1;}
}
