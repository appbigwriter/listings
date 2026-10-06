import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { amazonConfig,amazonRequest } from './amazon';
import { publicRequest } from '../net/public-request';
import { readResponseWithLimit,isSafeRemoteUrl } from '../extract-security';
import { validateFeedDocument,validateFeedReport } from './feed-schema';
import {assertRecoveryReleased} from '../operations/recovery';

export function isAmazonDocumentUrl(value:string) {
  try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && (url.hostname.endsWith('.amazonaws.com') || url.hostname.endsWith('.amazonaws.com.cn'));}catch{return false;}
}
export async function createAmazonFeedDocument() {return amazonRequest('/feeds/2021-06-30/documents',{},'POST',{contentType:'application/json; charset=UTF-8'});}
export async function uploadAmazonFeed(url:string,payload:unknown) {
  assertRecoveryReleased();
  validateFeedDocument(payload);
  if(!isAmazonDocumentUrl(url) || !await isSafeRemoteUrl(url))throw new Error('Destino de documento Amazon inválido.');
  const body=JSON.stringify(payload);if(Buffer.byteLength(body)>10_000_000)throw new Error('Feed limitado a 10 MB nesta integração.');
  // Presigned URLs are credentials: never persist or log them, and never follow redirects.
  const response=await publicRequest(url,{method:'PUT',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json; charset=UTF-8'},body});
  await response.body?.cancel();if(!response.ok)throw new Error(`Upload de documento Amazon respondeu HTTP ${response.status}.`);
}
export async function createAmazonFeed(documentId:string) {
  return amazonRequest('/feeds/2021-06-30/feeds',{},'POST',{feedType:'JSON_LISTINGS_FEED',marketplaceIds:[amazonConfig().marketplaceId],inputFeedDocumentId:documentId});
}
export async function getAmazonFeed(feedId:string) {return amazonRequest(`/feeds/2021-06-30/feeds/${encodeURIComponent(feedId)}`);}
export async function getAmazonFeedReport(documentId:string) {
  const document=await amazonRequest(`/feeds/2021-06-30/documents/${encodeURIComponent(documentId)}`);
  if(!isAmazonDocumentUrl(document.url))throw new Error('Destino de relatório Amazon inválido.');
  const signal=AbortSignal.timeout(30000),response=await publicRequest(document.url,{signal});
  if(!response.ok){await response.body?.cancel();throw new Error(`Relatório Amazon respondeu HTTP ${response.status}.`);}
  let decoded=response;
  if(document.compressionAlgorithm==='GZIP') {
    const source=Readable.fromWeb(response.body! as any),decoder=createGunzip();source.on('error',error=>decoder.destroy(error));decoder.on('close',()=>source.destroy());
    decoded=new Response(Readable.toWeb(source.pipe(decoder)) as ReadableStream);
  }else if(document.compressionAlgorithm){await response.body?.cancel();throw new Error('Compressão do relatório Amazon não suportada.');}
  const report=JSON.parse(await readResponseWithLimit(decoded,10_000_000,signal));validateFeedReport(report);return report;
}
