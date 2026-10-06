import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function workerLiveness(receipt,now=Date.now(),isAlive=pid=>process.kill(pid,0)) {
  if(!receipt||typeof receipt!=='object'||!Number.isInteger(receipt.pid)||receipt.pid<1)return false;
  const time=Date.parse(receipt.checked_at);
  if(!Number.isFinite(time)||time>now+5000||now-time>45000)return false;
  try{isAlive(receipt.pid);return true;}catch{return false;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{if(!workerLiveness(JSON.parse(readFileSync('/tmp/ag04-worker-heartbeat.json','utf8'))))process.exitCode=1;}catch{process.exitCode=1;}
}
