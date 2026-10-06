import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {scanEvidence} from '../../../lib/catalog/antimalware.ts';
const live=process.argv.includes('--live');
const eicar=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
async function mock(reply,date=new Date().toISOString()) {
  const sockets=new Set();
  const server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let input=Buffer.alloc(0);
    socket.on('data',chunk=>{
      input=Buffer.concat([input,chunk]);
      if(input.equals(Buffer.from('zVERSION\0')))socket.end(`ClamAV mock-engine/12345/${date}\0`);
      else if(input.length>=14&&input.subarray(0,10).equals(Buffer.from('zINSTREAM\0'))){
        let offset=10;
        while(input.length>=offset+4){const size=input.readUInt32BE(offset);offset+=4;if(!size){socket.end(reply);return;}if(input.length<offset+size)return;offset+=size;}
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.PRELISTING_CLAMD_HOST='127.0.0.1';process.env.PRELISTING_CLAMD_PORT=String(server.address().port);
  return async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));};
}
const results=[];
async function scenario(name,reply,date,status) {
  const close=await mock(reply,date);
  try{if(status)await assert.rejects(scanEvidence(Buffer.from('synthetic-fixture')),error=>error.status===status);else assert.equal((await scanEvidence(Buffer.from('synthetic-fixture'))).scan_status,'clean');results.push({scenario:name,status:'passed'});}finally{await close();}
}
if(live){
  if(process.env.PRELISTING_CLAMD_HOST!=='scanner')throw new Error('Live scan only targets private compose service scanner');
  assert.equal((await scanEvidence(Buffer.from('AG04 harmless fixture'))).scan_status,'clean');
  await assert.rejects(scanEvidence(eicar),error=>error.status===422);
  results.push({scenario:'real_clamd_clean_and_eicar',status:'passed'});
}else{
  process.env.PRELISTING_ALLOW_UNSCANNED_EVIDENCE='false';
  await scenario('clean_exact_protocol','stream: OK\0');
  await scenario('infected_rejected','stream: Fixture-Test FOUND\0',undefined,422);
  await scenario('obsolete_signatures_refused','stream: OK\0','2000-01-01T00:00:00Z',503);
  await scenario('incomplete_response_refused','stream: OK',undefined,503);
  const close=await mock('stream: OK\0');await close();
  await assert.rejects(scanEvidence(Buffer.from('fixture')),error=>error.status===503);
  results.push({scenario:'scanner_unavailable_refused',status:'passed'});
}
console.log(JSON.stringify({mode:live?'real_private_clamd':'local_tcp_protocol_mock',results,real_engine_tested:live,production_upload:false},null,2));
