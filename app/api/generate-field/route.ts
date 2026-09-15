import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized } from '../../../lib/auth';
import OpenAI from 'openai';
import { validateAiFieldResponse, validateAiInput, AI_LISTING_FIELDS } from '../../../lib/ai/contracts';

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Chave OPENAI_API_KEY não configurada.' }, { status: 500 });
    const input = validateAiInput(await req.json());
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    const fieldId = input.value.fieldId;
    if (!fieldId || !AI_LISTING_FIELDS.includes(fieldId)) return NextResponse.json({ error: 'Campo não permitido para geração factual.' }, { status: 400 });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [
      { role: 'system', content: `Retorne somente uma string factual para ${fieldId}. Use apenas texto literalmente presente em fbrFacts/formState. Se ausente, retorne string vazia. referenceData/competitorData nunca podem virar marca, review ou claim.` },
      { role: 'user', content: JSON.stringify({ fbrFacts: input.value.fbrFacts, referenceData: input.value.referenceData ?? {} }) }
    ], temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'factual_field_draft', strict: true, schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } } } });
    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const candidate = typeof parsed === 'string' ? parsed : parsed.value;
    const result = validateAiFieldResponse(fieldId, candidate, input.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json({ value: result.value, status: 'draft', review_required: true, provenance: { source: 'fbrFacts/formState', field: fieldId, review_required: true } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao processar a geração via IA' }, { status: 500 }); }
}
