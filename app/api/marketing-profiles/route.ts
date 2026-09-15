import { NextRequest, NextResponse } from 'next/server';
import { calculateMargin } from '../../../lib/marketing/margin';
import { buildReadinessGate, MARKETING_STATUSES, validateMarketingInput } from '../../../lib/marketing/validation';
import { getSupabase } from '../../../lib/marketing/supabase';
import { getAuthContext, unauthorized } from '../../../lib/auth';
import { archivedListingResponse, getActiveListingSkus } from '../../../lib/catalog/active-listing';
import { getMarketingProfileContext, validateLaunchReadyTransition } from '../../../lib/marketing/profile-guard';
import { buildMarketingPackage, marketingPackageMarkdown } from '../../../lib/marketing/contracts';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const sku = req.nextUrl.searchParams.get('sku');
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);

    if (!sku) {
      const active = await getActiveListingSkus(db, auth);
      if (active.error) throw active.error;
      if (!active.skus.length) return json({ data: [] });
      const { data, error } = await db.from('product_marketing_profiles').select('*')
        .eq('organization_id', auth.organizationId).eq('owner_id', auth.userId)
        .in('sku', active.skus).order('updated_at', { ascending: false });
      if (error) throw error;
      return json({ data });
    }

    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 404);
    if (!context.listing) return json({ error: 'SKU não encontrado.' }, 404);
    const payload = { ...(context.listing.payload || {}), sku: context.listing.sku, title: context.listing.title };
    const gate = buildReadinessGate(payload, context.profile?.economics?.margin);

    if (req.nextUrl.searchParams.get('format') === 'json' || req.nextUrl.searchParams.get('format') === 'markdown') {
      const [amazon, meta, tracking, approvals] = await Promise.all([
        db.from('amazon_campaign_plans').select('plan').eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).maybeSingle(),
        db.from('meta_campaign_plans').select('plan').eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).maybeSingle(),
        db.from('tracking_plans').select('*').eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).maybeSingle(),
        db.from('marketing_approvals').select('*').eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).order('created_at', { ascending: false }),
      ]);
      const pack = buildMarketingPackage(payload, context.profile?.economics || null,
        { amazon: amazon.data?.plan || null, meta: meta.data?.plan || null }, tracking.data || null, gate, approvals.data || []);
      if (req.nextUrl.searchParams.get('format') === 'json') {
        return new NextResponse(JSON.stringify(pack, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="marketing-${sku}.json"` } });
      }
      return new NextResponse(marketingPackageMarkdown(pack), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="marketing-${sku}.md"` } });
    }
    return json({ data: { profile: context.profile, listing: context.listing, gate } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao carregar perfil.' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const body = await req.json();
    const sku = String(body?.sku || '');
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);
    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 409);
    if (!context.listing) return json({ error: 'SKU não encontrado.' }, 404);

    const input = { ...(context.listing.payload || {}), sku, title: context.listing.title, ...body };
    const validation = validateMarketingInput(input);
    if (validation.errors.length) return json({ error: 'Dados insuficientes.', blockers: validation.errors }, 400);
    let margin;
    try {
      margin = calculateMargin(input.price, body.economics?.costs || body.costs);
    } catch (e) {
      return json({ error: 'Margem real incompleta.', blocker: e instanceof Error ? e.message : 'cost_required' }, 400);
    }
    const economics = { costs: body.economics?.costs || body.costs, margin, formula: 'revenue - (product + printing + packaging + shipping + Amazon referral + fulfillment + other)' };
    const gate = buildReadinessGate(input, margin);
    if (body.status === 'launch_ready') {
      const transition = validateLaunchReadyTransition(gate, context.latestApproval);
      if (!transition.ok) return json({ error: 'Launch ready bloqueado.', code: transition.code, blockers: transition.blockers }, 400);
    }
    const row = {
      sku, prelisting_id: context.listing.id, owner_id: auth.userId, organization_id: auth.organizationId,
      status: body.status || 'draft', objective: body.objective || null, audience: body.audience || {},
      purchase_motivations: body.purchase_motivations || [], objections: body.objections || [],
      approved_claims: body.approved_claims || [], prohibited_claims: body.prohibited_claims || [], economics,
      source_provenance: { prelisting: 'prelistings', derived_at: new Date().toISOString(), review_required: true },
    };
    const { data, error } = await db.from('product_marketing_profiles').upsert(row, { onConflict: 'organization_id,sku' }).select('*').single();
    if (error) throw error;
    return json({ data, gate }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao salvar perfil.' }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = getAuthContext(req);
    if (!auth) return json(unauthorized(), 401);
    const body = await req.json();
    const sku = String(body?.sku || '');
    if (!MARKETING_STATUSES.includes(body?.status)) return json({ error: 'Status inválido.', allowed: MARKETING_STATUSES }, 400);
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' }, 503);
    const context = await getMarketingProfileContext(db, auth, sku);
    if (context.error) throw context.error;
    if (context.archived) return json(archivedListingResponse(), 409);
    if (!context.listing || !context.profile) return json({ error: 'SKU não encontrado.' }, 404);

    if (body.status === 'launch_ready') {
      const payload = { ...(context.listing.payload || {}), sku: context.listing.sku, title: context.listing.title };
      const gate = buildReadinessGate(payload, context.profile.economics?.margin);
      const transition = validateLaunchReadyTransition(gate, context.latestApproval);
      if (!transition.ok) return json({ error: 'Launch ready bloqueado.', code: transition.code, blockers: transition.blockers }, 400);
    }
    const { data, error } = await db.from('product_marketing_profiles').update({ status: body.status, approval_notes: body.approval_notes || null, updated_at: new Date().toISOString() })
      .eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'SKU não encontrado.' }, 404);
    return json({ data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Falha ao atualizar status.' }, 500);
  }
}
