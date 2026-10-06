import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { validateAiInput } from '../../../lib/ai/contracts';
import { generateListing } from '../../../lib/ai/generate';
import { reserveAiOperation } from '../../../lib/ai/usage';
import { getSupabase } from '../../../lib/marketing/supabase';
import { readJsonBody,RequestBodyError } from '../../../lib/http';
import { CatalogError } from '../../../lib/catalog/repository';

export async function POST(req: NextRequest) {
  const auth=await resolveAuthContext(req);if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    const input = validateAiInput(await readJsonBody(req,80000));
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    const db=getSupabase();if(!db)throw new CatalogError('Supabase não configurado.',503);
    const usage=await reserveAiOperation(db,auth,'workspace-draft','generate');
    try {const result=await generateListing(input.value,usage.runtime);await usage.finish('completed');return NextResponse.json(result);}catch(error){await usage.finish('failed');throw error;}
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na geração.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError?error.status:422 }); }
}
