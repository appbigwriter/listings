import { readJsonBody, RequestBodyError } from '../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { calculateMargin } from '../../../lib/marketing/margin';
import { buildReadinessGate, MARKETING_STATUSES, validateMarketingInput } from '../../../lib/marketing/validation';
import { getSupabase } from '../../../lib/marketing/supabase';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { archivedListingResponse } from '../../../lib/catalog/active-listing';
import { getMarketingProfileContext, validateLaunchReadyTransition } from '../../../lib/marketing/profile-guard';
import { buildMarketingPackage, marketingPackageMarkdown } from '../../../lib/marketing/contracts';

import { loadMarketingReview } from '../../../lib/marketing/review';
import { channelProduct } from '../../../lib/catalog/model';
import { CatalogError, productFromRow } from '../../../lib/catalog/repository';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const sku = req.nextUrl.searchParams.get('sku');
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);

    if (!sku) {
      const offset=Number(req.nextUrl.searchParams.get('offset')||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:'Página inválida.'},400);
      const {data,error,count}=await db.from('product_marketing_profiles').select('*,listing:prelistings!marketing_profile_catalog_scope!inner(status)',{count:'exact'})
        .eq('organization_id',auth.organizationId).eq('owner_id',auth.userId).neq('listing.status','archived').order('updated_at',{ascending:false}).range(offset,offset+19);
      if(error)throw new CatalogError('Falha ao consultar perfis.',503);
      const profiles:any[]=[];
      for(let start=0;start<(data||[]).length;start+=5){
        const part=await Promise.all((data||[]).slice(start,start+5).map(async row=>{
          if(row.status!=='launch_ready')return row;
          const review=await loadMarketingReview(db,auth,row.sku);
          return {...row,status:review.approval_current&&review.gate.ready?'launch_ready':'approval_pending',approval_current:review.approval_current,gate:review.gate};
        }));profiles.push(...part);
      }
      return json({data:profiles,total:count,offset,limit:20});
    }

    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 404);
    if (!context.listing) return json({ error: 'SKU não encontrado.' }, 404);
    const payload = channelProduct(productFromRow(context.listing),'amazon-us');
    const review=context.profile?await loadMarketingReview(db,auth,sku,context):null;
    const gate = review?.gate || buildReadinessGate(payload, context.profile?.economics?.margin);

    if (req.nextUrl.searchParams.get('format') === 'json' || req.nextUrl.searchParams.get('format') === 'markdown') {
      if(!review)throw new CatalogError('Crie o perfil antes de exportar.',404);
      const approvals=await db.from('marketing_approvals').select('*').eq('sku',sku).eq('organization_id',auth.organizationId).eq('owner_id',auth.userId).order('created_at',{ascending:false});
      if(approvals.error)throw new CatalogError('Falha ao carregar decisões.',503);
      const pack={...buildMarketingPackage({...review.snapshot.product,sku},review.snapshot.profile?.economics||null,{amazon:review.snapshot.amazon_plan,meta:review.snapshot.meta_plan},review.snapshot.tracking,gate,approvals.data||[]),review:{snapshot:review.snapshot,content_hash:review.content_hash,approval_current:review.approval_current}};
      if (req.nextUrl.searchParams.get('format') === 'json') {
        return new NextResponse(JSON.stringify({...pack,review:review&&{snapshot:review.snapshot,content_hash:review.content_hash,approval_current:review.approval_current}}, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="marketing-${sku}.json"` } });
      }
      return new NextResponse(marketingPackageMarkdown(pack)+'\n\n## Revisão da versão\n\n'+JSON.stringify(pack.review,null,2), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="marketing-${sku}.md"` } });
    }
    return json({ data: { profile: context.profile&&{...context.profile,status:context.profile.status==='launch_ready'&&(!review?.approval_current||!review.gate.ready)?'approval_pending':context.profile.status}, listing: context.listing, gate, review:review&&{content_hash:review.content_hash,approval_current:review.approval_current} } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao carregar perfil.' }, e instanceof CatalogError||e instanceof RequestBodyError?e.status:500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const body = await readJsonBody(req,65536);
    const sku = String(body?.sku || '');
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);
    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 409);
    if (!context.listing) return json({ error: 'SKU não encontrado.' }, 404);

    if(context.profile?.updated_at&&body.expected_profile_version!==context.profile.updated_at)return json({error:'O perfil mudou. Recarregue os custos.',code:'REVIEW_VERSION_CHANGED'},409);
    const input = channelProduct(productFromRow(context.listing),'amazon-us');
    if(body.status&&!MARKETING_STATUSES.includes(body.status))return json({error:'Status inválido.'},400);
    const validation = validateMarketingInput(input);
    if (validation.errors.length) return json({ error: 'Dados insuficientes.', blockers: validation.errors }, 400);
    let margin;
    try {
      margin = calculateMargin(Number(input.price), body.economics?.costs || body.costs);
    } catch (e) {
      return json({ error: 'Margem real incompleta.', blocker: e instanceof Error ? e.message : 'cost_required' }, 400);
    }
    const economics = { costs: body.economics?.costs || body.costs, margin, formula: 'revenue - (product + printing + packaging + shipping + Amazon referral + fulfillment + other)' };
    const gate = buildReadinessGate(input, margin);
    if (body.status === 'launch_ready') return json({error:'Salve as alterações e revise a nova versão antes de aprovar.',code:'APPROVAL_NOT_CURRENT'},400);
    const row = {
      sku, prelisting_id: context.listing.id, owner_id: auth.userId, organization_id: auth.organizationId,
      updated_at:new Date().toISOString(), status: body.status || 'draft', objective: body.objective ?? context.profile?.objective ?? null, audience: body.audience ?? context.profile?.audience ?? {},
      purchase_motivations: body.purchase_motivations ?? context.profile?.purchase_motivations ?? [], objections: body.objections ?? context.profile?.objections ?? [],
      approved_claims: body.approved_claims ?? context.profile?.approved_claims ?? [], prohibited_claims: body.prohibited_claims ?? context.profile?.prohibited_claims ?? [], economics,
      source_provenance: { prelisting: 'prelistings', derived_at: new Date().toISOString(), review_required: true },
    };
    const query=context.profile
      ?db.from('product_marketing_profiles').update(row).eq('id',context.profile.id).eq('owner_id',auth.userId).eq('organization_id',auth.organizationId).eq('updated_at',context.profile.updated_at)
      :db.from('product_marketing_profiles').insert(row);
    const { data, error } = await query.select('*').maybeSingle();
    if(error?.code==='23505'||!error&&!data)return json({error:'O perfil mudou. Recarregue antes de salvar.',code:'REVIEW_VERSION_CHANGED'},409);
    if (error) throw error;
    return json({ data, gate }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao salvar perfil.' }, e instanceof CatalogError||e instanceof RequestBodyError?e.status:500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const body = await readJsonBody(req);
    const sku = String(body?.sku || '');
    if (!MARKETING_STATUSES.includes(body?.status)) return json({ error: 'Status inválido.', allowed: MARKETING_STATUSES }, 400);
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);
    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 409);
    if (!context.listing || !context.profile) return json({ error: 'SKU não encontrado.' }, 404);

    if (body.status === 'launch_ready') {
      const review=await loadMarketingReview(db,auth,sku,context);
      const transition=validateLaunchReadyTransition(review.gate,context.latestApproval,review.approval_current);
      if(!transition.ok)return json({error:'Launch ready bloqueado.',code:transition.code,blockers:transition.blockers},400);
      if(body.expected_hash!==review.content_hash)return json({error:'Revise a versão atual.',code:'REVIEW_VERSION_CHANGED'},409);
      // Only the transactional approval operation can set launch_ready.
      return json({data:context.profile,review:{content_hash:review.content_hash,approval_current:true}});
    }
    const { data, error } = await db.from('product_marketing_profiles').update({ status: body.status, approval_notes: body.approval_notes || null, updated_at: new Date().toISOString() })
      .eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).eq('updated_at',context.profile.updated_at).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'A versão mudou. Recarregue antes de alterar o status.' }, 409);
    return json({ data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao atualizar status.' }, e instanceof CatalogError||e instanceof RequestBodyError?e.status:500);
  }
}
