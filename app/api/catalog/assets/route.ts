import {traceRequest} from '../../../../lib/operations/trace';
import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {readBodyBytes,RequestBodyError} from '../../../../lib/http';
import {CatalogError,loadProduct,scopeQuery} from '../../../../lib/catalog/repository';
import {storeAsset,assetBytes} from '../../../../lib/catalog/assets';
export const runtime='nodejs';
async function handlePOST(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    if(req.nextUrl.searchParams.get('action')==='recover'){const result=await assetBytes(db,auth,req.nextUrl.searchParams.get('id')||'',true);return NextResponse.json({id:result.asset.id,status:'ready'});}
    let sku:string,filename:string;try{sku=decodeURIComponent(req.headers.get('x-product-sku')||'');filename=decodeURIComponent(req.headers.get('x-file-name')||'');}catch{throw new CatalogError('Identificador ou nome de arquivo inválido.');}const purpose=req.headers.get('x-file-purpose')||'';
    const mime=(req.headers.get('content-type')||'').split(';')[0].toLowerCase();
    const data=await storeAsset(db,auth,sku,purpose,await readBodyBytes(req),mime,filename);
    return NextResponse.json({data},{status:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha no arquivo.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:500});}
}
async function handleGET(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    const id=req.nextUrl.searchParams.get('id');
    if(id){const {asset,bytes}=await assetBytes(db,auth,id);return new NextResponse(new Uint8Array(bytes),{headers:{'content-type':'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});}
    const sku=req.nextUrl.searchParams.get('sku')||'';await loadProduct(db,auth,sku);
    const result=await scopeQuery(db.from('catalog_assets').select('id,sku,purpose,filename,mime_type,byte_size,sha256,status,created_at,scan_status,scan_checked_at,scan_receipt'),auth).eq('sku',sku).order('created_at',{ascending:false}).limit(100);
    if(result.error)throw new CatalogError('Arquivos indisponíveis.',503);
    return NextResponse.json({data:result.data},{headers:{'cache-control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao ler arquivos.'},{status:error instanceof CatalogError?error.status:500});}
}

export function POST(req:NextRequest){return traceRequest('api.catalog.assets',()=>handlePOST(req));}

export function GET(req:NextRequest){return traceRequest('api.catalog.assets',()=>handleGET(req));}
