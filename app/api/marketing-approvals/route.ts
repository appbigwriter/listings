import { readJsonBody, RequestBodyError } from '../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { buildApprovalRecord, validateApprovalInput } from '../../../lib/marketing/approval';
import { getSupabase } from '../../../lib/marketing/supabase';
import { resolveAuthContext, unauthorized, hasCapability } from '../../../lib/auth';
import { CatalogError } from '../../../lib/catalog/repository';
import { loadMarketingReview, sealMarketingApproval } from '../../../lib/marketing/review';
import type { Database, Json } from '../../../lib/supabase/database.types';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
const failure=(e:unknown)=>json({error:e instanceof Error?e.message:'Falha na aprovação.'},e instanceof CatalogError||e instanceof RequestBodyError?e.status:500);
export async function GET(req:NextRequest){try{
 const auth=await resolveAuthContext(req);if(!auth)return json(unauthorized(),401);
 const sku=req.nextUrl.searchParams.get('sku');if(!sku)return json({error:'SKU obrigatório.'},400);
 const db=getSupabase();if(!db)return json({error:'Supabase não configurado.'},503);
 const review=await loadMarketingReview(db,auth,sku);
 const history=await db.from('marketing_approvals').select('*').eq('sku',sku).eq('organization_id',auth.organizationId).eq('owner_id',auth.userId).order('created_at',{ascending:false});
 if(history.error)throw new CatalogError('Falha ao carregar decisões.',503);
 return json({data:history.data,review:{snapshot:review.snapshot,content_hash:review.content_hash,gate:review.gate,approval_current:review.approval_current},can_review:hasCapability(auth,'review')});
}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 const auth=await resolveAuthContext(req);if(!auth)return json(unauthorized(),401);if(!hasCapability(auth,'review'))return json({error:'Seu papel não permite aprovar.'},403);
 const body=await readJsonBody(req,16_384);const errors=validateApprovalInput(body);if(errors.length)return json({error:'Aprovação incompleta.',blockers:errors},400);
 const db=getSupabase();if(!db)return json({error:'Supabase não configurado.'},503);
 const review=await loadMarketingReview(db,auth,String(body.sku).trim());
 if(body.expected_hash!==review.content_hash)return json({error:'A versão mudou. Recarregue e revise o produto, custos e planos.',code:'REVIEW_VERSION_CHANGED'},409);
 if(body.decision==='approved'&&!review.gate.ready)return json({error:'Aprovação bloqueada pelo Launch Gate.',blockers:review.gate.blockers},400);
 const record=sealMarketingApproval(buildApprovalRecord(body,auth),review.content_hash);
 const args:Database['public']['Functions']['record_marketing_approval']['Args']={p_owner:auth.userId,p_organization:auth.organizationId,p_sku:record.sku,p_profile:review.profile.id,p_record:record,p_snapshot:review.snapshot as unknown as Json,p_versions:review.versions};
 const result=await db.rpc('record_marketing_approval',args);
 if(result.error)throw new CatalogError('Não foi possível confirmar a versão. Recarregue antes de decidir.',409);
 return json({data:{...record,id:result.data},status:body.decision==='approved'?'launch_ready':'approval_pending',gate:review.gate},201);
}catch(e){return failure(e);}}
