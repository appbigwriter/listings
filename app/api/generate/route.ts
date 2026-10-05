import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { validateAiInput } from '../../../lib/ai/contracts';
import { generateListing } from '../../../lib/ai/generate';

export async function POST(req: NextRequest) {
  if (!await resolveAuthContext(req)) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    const input = validateAiInput(await req.json());
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    return NextResponse.json(await generateListing(input.value));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na geração.' }, { status: 422 }); }
}
