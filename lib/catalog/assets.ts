import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {AuthContext} from '../auth';
import {CatalogError,loadProduct,scopeQuery} from './repository';
import {scanEvidence} from './antimalware';
export const ASSET_BUCKET='prelisting-evidence';
export async function inspectAsset(bytes:Buffer,mime:string,filename:string) {
  if(!bytes.length||bytes.length>5000000)throw new CatalogError('Arquivo deve ter entre 1 byte e 5 MB.',413);
  if(!filename.trim()||filename.length>150||/[\x00-\x1f\x7f/\\]/.test(filename))throw new CatalogError('Nome de arquivo inválido.');
  if(mime==='application/pdf') {
    if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||!bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF')))throw new CatalogError('PDF inválido.');
  }else if(['image/png','image/jpeg'].includes(mime)) {
    let metadata;try{metadata=await sharp(bytes,{limitInputPixels:25000000}).metadata();}catch{throw new CatalogError('Imagem inválida ou acima do limite de pixels.');}
    if(metadata.format!==(mime==='image/png'?'png':'jpeg')||!metadata.width||!metadata.height||(metadata.pages||1)>1)throw new CatalogError('Formato de imagem divergente ou animado.');
  }else throw new CatalogError('Envie PDF, PNG ou JPEG.',415);
  return {sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length,mime_type:mime,filename};
}
export async function storeAsset(db:SupabaseClient,auth:AuthContext,sku:string,purpose:string,bytes:Buffer,mime:string,filename:string) {
  if(!['technical','compliance','image'].includes(purpose))throw new CatalogError('Finalidade inválida.');
  const loaded=await loadProduct(db,auth,sku),inspected=await inspectAsset(bytes,mime,filename),id=crypto.randomUUID();
  const scan=await scanEvidence(bytes);
  const object_path=`${auth.organizationId}/${auth.userId}/${loaded.row.id}/${id}.${mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'}`;
  const record={id,owner_id:auth.userId,organization_id:auth.organizationId,prelisting_id:loaded.row.id,sku,purpose,...inspected,...scan,object_path,status:'pending'};
  const reserved=await db.from('catalog_assets').insert(record);if(reserved.error)throw new CatalogError('Não foi possível reservar a versão do arquivo.',503);
  const upload=await db.storage.from(ASSET_BUCKET).upload(object_path,bytes,{contentType:mime,upsert:false});
  if(upload.error){await scopeQuery(db.from('catalog_assets').update({status:'failed',updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','pending');throw new CatalogError('Upload não concluído; consulte as versões antes de tentar novamente.',503);}
  const saved=await scopeQuery(db.from('catalog_assets').update({status:'ready',updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','pending').select('*').maybeSingle();
  if(saved.error||!saved.data)throw new CatalogError('Arquivo enviado sem confirmação persistida. Use a recuperação desta versão.',503);
  return saved.data;
}
export async function assetBytes(db:SupabaseClient,auth:AuthContext,id:string,recover=false) {
  const found=await scopeQuery(db.from('catalog_assets').select('*'),auth).eq('id',id).maybeSingle();if(found.error||!found.data)throw new CatalogError('Arquivo não encontrado.',404);
  const asset=found.data;await loadProduct(db,auth,asset.sku);
  if(asset.status!=='ready'&&!(recover&&asset.status==='pending'))throw new CatalogError('Versão de arquivo indisponível.',409);
  const result=await db.storage.from(ASSET_BUCKET).download(asset.object_path);if(result.error||!result.data)throw new CatalogError('Arquivo indisponível no Storage.',503);
  if(result.data.size!==asset.byte_size)throw new CatalogError('Tamanho do arquivo diverge da versão registrada.',409);
  const bytes=Buffer.from(await result.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new CatalogError('Checksum do arquivo divergente.',409);
  const checked=Date.parse(asset.scan_checked_at),definitions=Date.parse(asset.scan_receipt?.definitions_at);
  if(asset.scan_status!=='clean'||!Number.isFinite(checked)||checked>Date.now()+300000||Date.now()-checked>86400000||!Number.isFinite(definitions)||Date.now()-definitions>72*3600000) {
    let scan;try{scan=await scanEvidence(bytes);}catch(error){
      if(error instanceof CatalogError&&error.status===422)await scopeQuery(db.from('catalog_assets').update({status:'failed',scan_status:'rejected',scan_checked_at:new Date().toISOString(),scan_receipt:{reason:'antimalware_rejected'},updated_at:new Date().toISOString()}),auth).eq('id',id).eq('sha256',asset.sha256);
      throw error;
    }
    const refreshed=await scopeQuery(db.from('catalog_assets').update({...scan,updated_at:new Date().toISOString()}),auth).eq('id',id).eq('sha256',asset.sha256).select('id').maybeSingle();
    if(refreshed.error||!refreshed.data)throw new CatalogError('Não foi possível registrar a análise do arquivo.',503);Object.assign(asset,scan);
  }
  if(recover&&asset.status==='pending') {
    const saved=await scopeQuery(db.from('catalog_assets').update({status:'ready',updated_at:new Date().toISOString()}),auth).eq('id',id).eq('status','pending').select('id').maybeSingle();if(saved.error||!saved.data)throw new CatalogError('Reserva mudou durante a recuperação.',409);
  }
  return {asset,bytes};
}
