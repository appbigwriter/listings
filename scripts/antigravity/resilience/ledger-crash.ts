import {PGlite} from '@electric-sql/pglite';
import {createIsolatedTestDatabase} from '../../../tests/antigravity/fixtures/mock-db-helper';
const owner='00000000-0000-4000-8000-000000000001';
globalThis.fetch=async()=>{throw new Error('Network blocked in AG05 ledger fixture');};
async function main(){
 const [directory,phase]=process.argv.slice(2);if(!directory||!['before','after','resume'].includes(phase))throw new Error('Fixture phase required');
 const db=phase==='resume'?new PGlite(directory):await createIsolatedTestDatabase(directory);
 const argsFor=(version:string,hash:string)=>[owner,owner,'AG05-CRASH','amazon-us',version,hash,JSON.stringify({productType:'FIXTURE',attributes:{}}),JSON.stringify({seller_id:'SYNTHETIC',marketplace_id:'ATVPDKIKX0DER',operation:'listing_put'})];
 if(phase!=='resume'){
  await db.query('insert into prelistings(sku,title,owner_id,organization_id) values($1,$2,$3,$3)',['AG05-CRASH','Synthetic unapproved draft',owner]);
  const version=(await db.query<{version:string}>('select updated_at::text version from prelistings')).rows[0].version;
  const claim=(await db.query<{id:string}>('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8) id',argsFor(version,'a'.repeat(64)))).rows[0].id;
  if(phase==='after')await db.query(`update catalog_submissions set response='{"stage":"external_request_started"}' where id=$1`,[claim]);
  // External response is a synthetic local fixture: intentionally never checkpointed to ledger.
  const remoteResponse=phase==='after'?{submissionId:'SYNTHETIC-RESPONSE-LOST',status:'ACCEPTED'}:null;
  await db.exec('checkpoint');console.log(JSON.stringify({phase:'ready_to_kill',crash_point:phase,remote_response_observed:!!remoteResponse,network:'blocked'}));setInterval(()=>{},1000);return;
 }
 const row=(await db.query<{version:string}>('select updated_at::text version from prelistings')).rows[0];
 let refused=false;try{await db.query('select reserve_catalog_channel_submission($1,$2,$3,$4,$5,$6,$7,$8)',argsFor(row.version,'b'.repeat(64)));}catch(error){refused=String(error).includes('uncertain submission');}
 const ledger=(await db.query<{status:string;response:any}>('select status,response from catalog_submissions')).rows;
 console.log(JSON.stringify({phase:'resumed',new_mutation_refused:refused,ledger_rows:ledger.length,ledger_status:ledger[0].status,stage:ledger[0].response.stage,external_replay:0,network:'blocked'}));await db.close();
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Fixture failed');process.exitCode=1;});
