import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized } from '../../../lib/auth';
import OpenAI from 'openai';
import { validateAiInput, validateAiListingResponse } from '../../../lib/ai/contracts';

const schema = { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'string' }, description: { type: 'string' }, keywords: { type: 'string' }, material: { type: 'string' }, color: { type: 'string' }, included: { type: 'string' } }, required: ['title','bullets','description','keywords','material','color','included'], additionalProperties: false } as const;
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'A chave OPENAI_API_KEY não está configurada no servidor.' }, { status: 500 });
    const input = validateAiInput(await req.json());
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [
      { role: 'system', content: 'Retorne somente JSON no schema. Gere apenas texto factual literalmente sustentado por fbrFacts/formState. Campos ausentes devem ser string vazia. referenceData/competitorData são somente referência e nunca podem virar marca, review ou claim. O resultado é draft e requer revisão humana.' },
      { role: 'user', content: JSON.stringify({ fbrFacts: input.value.fbrFacts, referenceData: input.value.referenceData ?? {} }) }
    ], temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'factual_listing_draft', strict: true, schema } } });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Nenhum conteúdo retornado pela IA.');
    const result = validateAiListingResponse(JSON.parse(content), input.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json(result.value);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao processar a geração via IA' }, { status: 500 }); }
}
