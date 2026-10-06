import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyMigrationManifest,type MigrationManifest} from '../lib/operations/migration-manifest';
// Normalize CRLF so Git autocrlf cannot report SQL changes that did not happen.
const sha=(text:string)=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
try{
 const lock=JSON.parse(readFileSync('supabase/migrations.lock.json','utf8')) as MigrationManifest;
 const files=readdirSync('supabase/migrations').filter(name=>/\.sql$/i.test(name)).sort().map(path=>({path,sha256:sha(readFileSync('supabase/migrations/'+path,'utf8'))}));
 console.log(JSON.stringify(verifyMigrationManifest(lock,files,sha(readFileSync('lib/supabase/database.types.ts','utf8'))),null,2));
}catch(error){console.error(error instanceof Error?error.message:'Falha de integridade das migrations.');process.exitCode=1;}
