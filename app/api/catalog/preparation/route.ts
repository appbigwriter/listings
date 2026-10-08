import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized, hasCapability } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { CatalogError } from '../../../../lib/catalog/repository';
import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { buildBackfillFieldStates, buildReadiness, validatePreparationField } from '../../../../lib/catalog/preparation-foundation';
import { hash } from '../../../../lib/catalog/model';

export const runtime = 'nodejs';

function responseError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na preparação.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError ? error.status : 500 });
}

export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const sku = req.nextUrl.searchParams.get('sku');
    const channel = req.nextUrl.searchParams.get('channel');
    const filter = (query: any, hasSku = true, hasChannel = true) => { let q = query.eq('organization_id', auth.organizationId).eq('owner_id', auth.userId); if (sku && hasSku) q = q.eq('sku', sku); if (channel && hasChannel) q = q.eq('channel', channel); return q; };
    const [fields, exceptions, groups, rules, readiness] = await Promise.all([
      filter(db.from('catalog_field_states').select('*')).order('field_path').limit(5000),
      filter(db.from('catalog_exceptions').select('*'), true, false).order('updated_at', { ascending: false }).limit(5000),
      filter(db.from('catalog_exception_groups').select('*'), false, true).order('updated_at', { ascending: false }).limit(5000),
      filter(db.from('catalog_preparation_rules').select('*'), false, true).order('priority', { ascending: false }).limit(5000),
      filter(db.from('catalog_channel_readiness').select('*')).order('updated_at', { ascending: false }).limit(5000),
    ]);
    const failed = [fields, exceptions, groups, rules, readiness].find((item) => item.error); if (failed?.error) throw new CatalogError('Falha ao carregar a Central de preparação.', 503);
    return NextResponse.json({ data: { fields: fields.data || [], exceptions: exceptions.data || [], groups: groups.data || [], rules: rules.data || [], readiness: readiness.data || [] } });
  } catch (error) { return responseError(error); }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  if (!hasCapability(auth, 'review')) return NextResponse.json({ error: 'Seu papel não permite alterar a preparação.' }, { status: 403 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const body = await readJsonBody(req); const action = String(body.action || '');
    if (action === 'field_state') {
      const field = { fieldPath: String(body.field_path || ''), state: body.state, value: body.value, confidence: body.confidence } as Parameters<typeof validatePreparationField>[0];
      const validation = validatePreparationField(field); if (validation) throw new CatalogError(validation);
      const row = { organization_id: auth.organizationId, owner_id: auth.userId, sku: String(body.sku || ''), channel: String(body.channel || ''), scope_type: String(body.scope_type || 'product'), scope_key: String(body.scope_key || body.sku || ''), field_path: field.fieldPath, state: field.state, value: field.value ?? null, source: body.source || { authority: 'human', actor: auth.userId }, confidence: field.confidence ?? null, evidence: body.evidence || [], observed_version: body.observed_version || null, updated_at: new Date().toISOString() };
      if (!row.sku || !row.channel) throw new CatalogError('SKU e canal são obrigatórios.');
      const { data, error } = await db.from('catalog_field_states').upsert(row, { onConflict: 'organization_id,owner_id,sku,channel,scope_type,scope_key,field_path' }).select('*').single(); if (error) throw new CatalogError('Falha ao salvar estado do campo.', 503); return NextResponse.json({ data }, { status: 201 });
    }
    if (action === 'rule') {
      const scopeType = String(body.scope_type || 'product'); if (!['global', 'family', 'product'].includes(scopeType)) throw new CatalogError('Escopo de regra inválido.');
      const row = { organization_id: auth.organizationId, owner_id: auth.userId, scope_type: scopeType, scope_key: String(body.scope_key || ''), channel: String(body.channel || ''), field_path: String(body.field_path || ''), value: body.value ?? null, priority: Number.isInteger(body.priority) ? body.priority : 0, status: body.status || 'active', evidence: body.evidence || [], approved_by: auth.userId, valid_from: body.valid_from || null, valid_until: body.valid_until || null, updated_at: new Date().toISOString() };
      if (!row.scope_key || !row.channel || !row.field_path) throw new CatalogError('Escopo, canal e campo são obrigatórios.');
      const { data, error } = await db.from('catalog_preparation_rules').upsert(row, { onConflict: 'organization_id,owner_id,scope_type,scope_key,channel,field_path' }).select('*').single(); if (error) throw new CatalogError('Falha ao salvar regra.', 503); return NextResponse.json({ data }, { status: 201 });
    }
    if (action === 'resolve_exception') {
      const id = String(body.id || ''); if (!id) throw new CatalogError('Exceção obrigatória.');
      const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
      const { data, error } = await db.from('catalog_exceptions').update({ status, resolution: { actor: auth.userId, note: body.note || null, resolved_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).select('*').maybeSingle(); if (error) throw new CatalogError('Falha ao resolver exceção.', 503); if (!data) throw new CatalogError('Exceção não encontrada.', 404); return NextResponse.json({ data });
    }
    if (action === 'evaluate') {
      const sku = String(body.sku || ''), channel = String(body.channel || ''); if (!sku || !channel) throw new CatalogError('SKU e canal são obrigatórios.');
      const { data: fields, error: fieldError } = await db.from('catalog_field_states').select('field_path,state,value,confidence').eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).eq('sku', sku).eq('channel', channel); if (fieldError) throw new CatalogError('Falha ao avaliar campos.', 503);
      const result = buildReadiness((fields || []).map((item: any) => ({ fieldPath: item.field_path, state: item.state, value: item.value, confidence: item.confidence })), [], body.reviewed === true);
      const inputsHash = typeof body.inputs_hash === 'string' && /^[a-f0-9]{64}$/i.test(body.inputs_hash) ? body.inputs_hash : hash({ sku, channel, fields });
      const row = { organization_id: auth.organizationId, owner_id: auth.userId, sku, channel, status: result.status, blockers: result.blockers, next_action: result.nextAction, inputs_hash: inputsHash, schema_version: body.schema_version || null, evaluated_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { data, error } = await db.from('catalog_channel_readiness').upsert(row, { onConflict: 'organization_id,owner_id,sku,channel' }).select('*').single(); if (error) throw new CatalogError('Falha ao salvar prontidão.', 503); return NextResponse.json({ data });
    }
    if (action === 'backfill_preview' || action === 'backfill') {
      if (!hasCapability(auth, 'admin')) return NextResponse.json({ error: 'Administrador obrigatório para o backfill.' }, { status: 403 });
      const channel = String(body.channel || 'amazon-us');
      const { data: listings, error } = await db.from('prelistings').select('sku,title,brand,payload,updated_at').eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).neq('status', 'archived').order('sku').limit(5000);
      if (error) throw new CatalogError('Falha ao carregar catálogo para backfill.', 503);
      const rows = (listings || []).flatMap((listing: any) => buildBackfillFieldStates(listing, channel).map((field) => ({ ...field, organization_id: auth.organizationId, owner_id: auth.userId, observed_version: listing.updated_at })));
      if (action === 'backfill_preview') return NextResponse.json({ mode: 'dry-run', total_products: listings?.length || 0, total_field_states: rows.length, rows: rows.slice(0, 500) });
      const { error: insertError } = rows.length ? await db.from('catalog_field_states').upsert(rows, { onConflict: 'organization_id,owner_id,sku,channel,scope_type,scope_key,field_path' }) : { error: null };
      if (insertError) throw new CatalogError('Falha ao gravar backfill.', 503);
      return NextResponse.json({ mode: 'applied', total_products: listings?.length || 0, total_field_states: rows.length });
    }
    throw new CatalogError('Ação de preparação inválida.');
  } catch (error) { return responseError(error); }
}
