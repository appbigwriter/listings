import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createGunzip,createInflate,createBrotliDecompress } from 'node:zlib';
import { isPrivateIp,isSafeRemoteUrlSync } from '../extract-security';

export async function publicAddresses(host:string,resolver=lookup) {
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolver(host,{all:true,verbatim:true});
  if (!addresses.length || addresses.some(item=>isPrivateIp(item.address))) throw new Error('Destino remoto bloqueado.');
  return addresses;
}
export async function publicRequest(value:string|URL,options:{signal:AbortSignal;headers?:Record<string,string>;method?:'GET'|'PUT';body?:string}) {
  const url=new URL(value);if(!isSafeRemoteUrlSync(url.href))throw new Error('Destino remoto bloqueado.');
  const addresses=await publicAddresses(url.hostname.replace(/^\[|\]$/g,''));options.signal.throwIfAborted();
  // Resolve once, then pin the socket lookup. TLS still verifies the original hostname.
  const pinnedLookup:import('node:net').LookupFunction=(host,lookupOptions,callback)=>{
    if (lookupOptions.all) callback(null,addresses);
    else { const selected=addresses.find(item=>!lookupOptions.family || item.family===lookupOptions.family) || addresses[0];callback(null,selected.address,selected.family); }
  };
  return new Promise<Response>((resolve,reject)=>{
    const transport=url.protocol==='https:'?httpsRequest:httpRequest;
    const request=transport(url,{method:options.method || 'GET',headers:options.headers,signal:options.signal,lookup:pinnedLookup,agent:false},incoming=>{
      const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
      const encoding=headers.get('content-encoding');let body:Readable=incoming;
      if(encoding && encoding!=='identity') {
        const decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
        if(!decoder) {incoming.destroy();reject(new Error('Compressão remota não suportada.'));return;}
        incoming.on('error',error=>decoder.destroy(error));decoder.on('close',()=>incoming.destroy());body=incoming.pipe(decoder);headers.delete('content-encoding');headers.delete('content-length');
      }
      const status=incoming.statusCode || 502;
      try{resolve(new Response([204,205,304].includes(status)?null:Readable.toWeb(body) as ReadableStream,{status,headers}));}
      catch(error){body.destroy();incoming.destroy();reject(error);}
    });
    request.on('error',reject);request.end(options.body);
  });
}
