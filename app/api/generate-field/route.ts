import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { validateAiInput, AI_LISTING_FIELDS } from '../../../lib/ai/contracts';
import { generateListing } from '../../../lib/ai/generate';
import { reserveAiOperation } from '../../../lib/ai/usage';
import { getSupabase } from '../../../lib/marketing/supabase';
import { readJsonBody,RequestBodyError } from '../../../lib/http';
import { CatalogError } from '../../../lib/catalog/repository';

export async function POST(req: NextRequest) {
  const auth=await resolveAuthContext(req);if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    const input = validateAiInput(await readJsonBody(req,80000));
    if (!input.ok || !input.value.fieldId || !AI_LISTING_FIELDS.includes(input.value.fieldId)) return NextResponse.json({ error: 'Campo de IA inválido.' }, { status: 400 });
    const db=getSupabase();if(!db)throw new CatalogError('Supabase não configurado.',503);
    const usage=await reserveAiOperation(db,auth,'workspace-draft','generate');
    let result;
    try {result=await generateListing(input.value,usage.runtime);await usage.finish('completed');}catch(error){await usage.finish('failed');throw error;}
    return NextResponse.json({ value: result[input.value.fieldId], status: 'draft', review_required: true, grounding: result.grounding });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na geração.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError?error.status:422 }); }
}
