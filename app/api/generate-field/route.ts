import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { validateAiInput, AI_LISTING_FIELDS } from '../../../lib/ai/contracts';
import { generateListing } from '../../../lib/ai/generate';

export async function POST(req: NextRequest) {
  if (!await resolveAuthContext(req)) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    const input = validateAiInput(await req.json());
    if (!input.ok || !input.value.fieldId || !AI_LISTING_FIELDS.includes(input.value.fieldId)) return NextResponse.json({ error: 'Campo de IA inválido.' }, { status: 400 });
    const result = await generateListing(input.value);
    return NextResponse.json({ value: result[input.value.fieldId], status: 'draft', review_required: true, grounding: result.grounding });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na geração.' }, { status: 422 }); }
}
