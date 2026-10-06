import {readFileSync,writeFileSync,mkdirSync,realpathSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const digest=(value,algorithm='sha256')=>createHash(algorithm).update(value.replaceAll('\r\n','\n')).digest('hex');
export function loadDriftContract(){
 const lock=JSON.parse(readFileSync('supabase/migrations.lock.json','utf8')),functions=new Map(),tables=new Set(['prelistings']);
 if(lock.version!==1||!Array.isArray(lock.files)||!Array.isArray(lock.remote_history)||!lock.files.length)throw new Error('Invalid migration attestation');
 const paths=readdirSync('supabase/migrations').filter(path=>/\.sql$/i.test(path));if(paths.length!==lock.files.length||paths.some(path=>!lock.files.some(file=>file.path===path)))throw new Error('Unattested/missing migration: reconcile before remote verification');
 if(digest(readFileSync('lib/supabase/database.types.ts','utf8'))!==lock.types_sha256)throw new Error('Local database types drift');
 for(const file of lock.files){
  if(!/^\d{14}_[a-z][a-z0-9_]*\.sql$/.test(file.path))throw new Error('Invalid migration path');const sql=readFileSync('supabase/migrations/'+file.path,'utf8').replaceAll('\r\n','\n');if(digest(sql)!==file.sha256)throw new Error('Local SQL drift');
  for(const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]+)\(([^)]*)\)([\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$/gi)){
   const name=match[1],argumentTypes=match[2].split(',').filter(value=>value.trim()).map(value=>{const tokens=value.trim().split(/\s+/);return tokens[1];});if(argumentTypes.some(value=>!['uuid','text','integer','bigint','jsonb','timestamptz','boolean'].includes(value)))throw new Error('Unsupported SQL function signature; review parser');
   functions.set(name,{name,argument_count:argumentTypes.length,body_md5:digest(match[4],'md5'),security_definer:/security\s+definer/i.test(match[3]),authenticated_execute:name==='prelisting_session_active'});
  }
  for(const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi))tables.add(match[1]);
 }
 return {project_id:lock.project_id,migrations:lock.remote_history,functions:[...functions.values()].sort((a,b)=>a.name.localeCompare(b.name)),tables:[...tables].sort(),types_sha256:lock.types_sha256};
}
export function driftQuery(contract){
 const literals=values=>values.map(value=>{if(!/^[a-z_]+$/.test(value))throw new Error('Invalid identifier');return "'"+value+"'";}).join(',');
 return `begin read only; set local statement_timeout='10s'; select json_build_object('checked_at',now(),'transaction_read_only',current_setting('transaction_read_only'),'migrations',(select coalesce(json_agg(json_build_object('version',version,'name',name) order by version),'[]'::json) from supabase_migrations.schema_migrations),'functions',(select coalesce(json_agg(json_build_object('name',p.proname,'argument_count',p.pronargs,'body_md5',md5(replace(p.prosrc,chr(13)||chr(10),chr(10))),'security_definer',p.prosecdef,'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE')) order by p.proname),'[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${literals(contract.functions.map(fn=>fn.name))})),'tables',(select coalesce(json_agg(json_build_object('name',c.relname,'rls_enabled',c.relrowsecurity) order by c.relname),'[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in (${literals(contract.tables)}))); rollback;`;
}
export function compareDrift(contract,remote){
 if(remote?.transaction_read_only!=='on'||!Array.isArray(remote.migrations)||!Array.isArray(remote.functions)||!Array.isArray(remote.tables))throw new Error('Read-only remote snapshot contract missing');
 const history=entries=>entries.map(entry=>entry.version+'_'+entry.name).sort();
 if(JSON.stringify(history(contract.migrations))!==JSON.stringify(history(remote.migrations)))throw new Error('Remote migration history differs');
 if(remote.functions.length!==contract.functions.length)throw new Error('Remote function missing or overload drift');
 for(const expected of contract.functions){const actual=remote.functions.find(fn=>fn.name===expected.name);if(!actual||actual.body_md5!==expected.body_md5||actual.argument_count!==expected.argument_count||actual.security_definer!==expected.security_definer||actual.authenticated_execute!==expected.authenticated_execute||actual.anon_execute!==false)throw new Error('Remote function body/signature/security/execute drift: '+expected.name);}
 for(const name of contract.tables)if(!remote.tables.some(table=>table.name===name&&table.rls_enabled===true))throw new Error('Missing table/RLS disabled: '+name);
 return {checked_at:remote.checked_at,project_id:contract.project_id,migrations:contract.migrations.length,function_bodies_checked:contract.functions.length,rls_tables_checked:contract.tables.length,live_remote_drift_checked:true,transaction:'read_only_rollback',policy_expressions_checked:false,column_schema_checked:false,limitations:'Does not attest every policy expression, table column/default/index, Storage object, user ownership or provider state.'};
}
function connectionEnvironment(file,project){
 if(!file||!isAbsolute(file))throw new Error('External absolute connection file required');const actual=realpathSync(file),rel=relative(realpathSync(resolve('.')),actual);if(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))throw new Error('Connection secret cannot reside in checkout');
 const config=JSON.parse(readFileSync(actual,'utf8'));if(config.project_id!==project||config.host!==`db.${project}.supabase.co`||config.user!=='postgres'||config.database!=='postgres'||typeof config.password!=='string'||!config.password||config.password.length>1024)throw new Error('Trusted direct connection does not match manifest project');
 return {PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,PGHOST:config.host,PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:config.password,PGSSLMODE:'verify-full',PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c default_transaction_read_only=on',PGAPPNAME:'prelisting_readonly_drift'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const contract=loadDriftContract(),query=driftQuery(contract);
  if(process.argv.includes('--query-only')){console.log(query);process.exit(0);}
  let remote;
  if(process.env.AG04_DRIFT_SNAPSHOT_FILE){remote=JSON.parse(readFileSync(process.env.AG04_DRIFT_SNAPSHOT_FILE,'utf8'));const checked=Date.parse(remote.checked_at);if(!Number.isFinite(checked)||checked>Date.now()+300000||Date.now()-checked>3600000)throw new Error('Trusted query snapshot must be fresh within one hour');}
  else {const env=connectionEnvironment(process.env.AG04_DRIFT_CONNECTION_FILE,contract.project_id);const child=spawnSync('psql',['-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],{env,input:query,encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1000000});if(child.status!==0)throw new Error('Read-only psql connection/query failed; provider output omitted');remote=JSON.parse(child.stdout.trim());}
  const evidence=compareDrift(contract,remote);if(process.env.AG04_DRIFT_SNAPSHOT_FILE)evidence.source='trusted_prequeried_snapshot_requires_operator_provenance';else evidence.source='psql_direct_verified_tls';
  mkdirSync('artifacts/antigravity/AG-04',{recursive:true});writeFileSync('artifacts/antigravity/AG-04/remote-drift.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 }catch(error){console.error(error instanceof Error?error.message:'Read-only drift check failed');process.exitCode=1;}
}
