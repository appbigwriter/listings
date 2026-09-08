import { NextRequest, NextResponse } from 'next/server';
import { buildApprovalRecord, validateApprovalInput } from '../../../lib/marketing/approval';
import { buildReadinessGate } from '../../../lib/marketing/validation';
import { getSupabase } from '../../../lib/marketing/supabase';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET(req: NextRequest) {
  try {
    const sku = req.nextUrl.searchParams.get('sku');
    if (!sku) return json({ error: 'SKU obrigatório.' }, 400);
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.' }, 503);
    const { data, error } = await db.from('marketing_approvals').select('*').eq('sku', sku).order('created_at', { ascending: false });
    if (error) throw error;
    return json({ data });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Falha ao carregar histórico.' }, 500); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const errors = validateApprovalInput(body);
    if (errors.length) return json({ error: 'Aprovação incompleta.', blockers: errors }, 400);
    const record = buildApprovalRecord(body);
    const db = getSupabase();
    if (!db) return json({ error: 'Supabase não configurado.' }, 503);
    const [{ data: profile, error: profileError }, { data: listing, error: listingError }] = await Promise.all([
      db.from('product_marketing_profiles').select('*').eq('sku', record.sku).maybeSingle(),
      db.from('prelistings').select('*').eq('sku', record.sku).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (listingError) throw listingError;
    if (!profile || !listing) return json({ error: 'Perfil ou SKU não encontrado.' }, 404);
    const input = { ...(listing.payload || {}), sku: listing.sku, title: listing.title };
    const gate = buildReadinessGate(input, profile.economics?.margin);
    if (record.decision === 'approved' && !gate.ready) return json({ error: 'Aprovação bloqueada pelo Launch Gate.', blockers: gate.blockers }, 400);
    const { data, error } = await db.from('marketing_approvals').insert({ marketing_profile_id: profile.id, ...record }).select('*').single();
    if (error) throw error;
    const nextStatus = record.decision === 'approved' ? 'launch_ready' : 'approval_pending';
    const { error: updateError } = await db.from('product_marketing_profiles').update({ status: nextStatus, approval_notes: record.comments, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (updateError) throw updateError;
    return json({ data, status: nextStatus, gate }, 201);
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Falha ao registrar aprovação.' }, 500); }
}
