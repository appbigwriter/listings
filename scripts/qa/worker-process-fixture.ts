import {PGlite} from '@electric-sql/pglite';
import {createIsolatedTestDatabase} from '../../tests/antigravity/fixtures/mock-db-helper';
import {workerDatabaseAdapter} from '../../tests/fixtures/pglite-worker-adapter';
import {enqueueJob,processJob} from '../../lib/catalog/jobs';
import {createCatalog} from '../../lib/catalog/model';
// Synthetic identities exist only in this test database, never in Supabase Auth.
const owner='00000000-0000-4000-8000-000000000001',auth={userId:owner,organizationId:owner,mode:'trusted-gateway' as const};
globalThis.fetch=async()=>{throw new Error('Network prohibited in the isolated worker process fixture.');};
async function main(){
 const directory=process.argv[2],phase=process.argv[3];if(!directory||!['crash','resume'].includes(phase))throw new Error('Test fixture arguments required.');
 const db=phase==='crash'?await createIsolatedTestDatabase(directory):new PGlite(directory),adapter=workerDatabaseAdapter(db);
 if(phase==='crash'){
  for(const sku of ['TEST-RESTART-A','TEST-RESTART-B'])await db.query(`insert into prelistings(sku,title,brand,owner_id,organization_id,payload) values($1,'Synthetic unapproved draft','',$2,$2,$3)`,[sku,owner,JSON.stringify({sku,title:'Synthetic unapproved draft',_catalog:createCatalog({sku})})]);
  const rows=(await db.query<{row:any}>('select to_jsonb(p) as row from prelistings p order by sku')).rows.map(item=>item.row),versions=Object.fromEntries(rows.map(row=>[row.sku,row.updated_at]));
  const job=await enqueueJob(adapter as any,auth,'validate',{skus:rows.map(row=>row.sku),versions,channel:'amazon-us'});
  const first=await processJob(adapter as any,auth,job.id);if(first.cursor!==1)throw new Error('First checkpoint did not advance.');
  // Mimic a new item claimed by a process that dies before executing it.
  await db.query(`update catalog_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' where id=$1`,[job.id]);
  await db.exec('checkpoint');console.log(JSON.stringify({phase:'ready_to_kill',cursor:first.cursor,total:first.total,network:'blocked'}));
  setInterval(()=>{},1000);return;
 }
 const stored=(await db.query<{row:any}>('select to_jsonb(j) as row from catalog_jobs j')).rows[0].row;
 const held=await processJob(adapter as any,auth,stored.id);if(held.cursor!==1||held.status!=='running')throw new Error('Restart ignored the unexpired lease.');
 // Expiry is simulated; this test does not pretend to measure a real 180-second outage.
 await db.query(`update catalog_jobs set lease_until=now()-interval '1 second' where id=$1`,[stored.id]);
 const completed=await processJob(adapter as any,auth,stored.id);
 const versions=await db.query<{sku:string;total:number}>(`select sku,count(*)::int as total from catalog_versions group by sku order by sku`);
 console.log(JSON.stringify({phase:'resumed',status:completed.status,cursor:completed.cursor,indices:completed.results.map((result:any)=>result.index),versions:versions.rows,lease_expiry:'simulated',network:'blocked'}));
 await db.close();
}
main().catch(error=>{console.error(error instanceof Error?error.message:'fixture failed');process.exitCode=1;});
