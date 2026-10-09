import OpenAI from 'openai';
import type { AiRuntime } from './usage';

export type ProductResearch = {
  category_hypotheses: { product_type: string; confidence: number; reason: string; evidence_asins: string[] }[];
  attributes: { field: string; value: string; confidence: number; needs_review: boolean }[];
  image_observations: { observation: string; confidence: number; needs_review: boolean }[];
  listing_draft: { title: string; bullets: string; description: string; keywords: string };
  review_required: true;
};

export async function researchProduct(input: { title?: unknown; description?: unknown; brand?: unknown; material?: unknown; images?: unknown; }, related: unknown[], runtime: AiRuntime = {}): Promise<ProductResearch> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.');
  const images = (Array.isArray(input.images) ? input.images : String(input.images || '').split(/\n+/)).map(String).filter(url => /^https?:\/\//i.test(url)).slice(0, 4);
  const content: any[] = [{ type: 'text', text: JSON.stringify({ product: { title: input.title, description: input.description, brand: input.brand, material: input.material }, related_products: related }) }];
  for (const url of images) content.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 0 });
  const request: any = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_completion_tokens: 2500, messages: [
    { role: 'system', content: 'Você é um analista de catálogo Amazon. Compare o produto FBR com os produtos correlatos fornecidos e as imagens. Gere hipóteses úteis, nunca trate hipótese como fato. Não invente medidas, certificações, materiais ou benefícios. O listing_draft é um rascunho que sempre exige revisão humana. Em category_hypotheses use somente product_type IDs presentes nos produtos correlatos quando houver evidência.' },
    { role: 'user', content },
  ], response_format: { type: 'json_schema', json_schema: { name: 'product_research', strict: true, schema: { type: 'object', properties: {
    category_hypotheses: { type: 'array', items: { type: 'object', properties: { product_type: { type: 'string' }, confidence: { type: 'number' }, reason: { type: 'string' }, evidence_asins: { type: 'array', items: { type: 'string' } } }, required: ['product_type', 'confidence', 'reason', 'evidence_asins'], additionalProperties: false } },
    attributes: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, value: { type: 'string' }, confidence: { type: 'number' }, needs_review: { type: 'boolean' } }, required: ['field', 'value', 'confidence', 'needs_review'], additionalProperties: false } },
    image_observations: { type: 'array', items: { type: 'object', properties: { observation: { type: 'string' }, confidence: { type: 'number' }, needs_review: { type: 'boolean' } }, required: ['observation', 'confidence', 'needs_review'], additionalProperties: false } },
    listing_draft: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'string' }, description: { type: 'string' }, keywords: { type: 'string' } }, required: ['title', 'bullets', 'description', 'keywords'], additionalProperties: false },
  }, required: ['category_hypotheses', 'attributes', 'image_observations', 'listing_draft'], additionalProperties: false } } } };
  runtime.beforeCall?.(request);
  const result = await client.chat.completions.create(request);
  runtime.onUsage?.({ model: result.model, prompt_tokens: result.usage?.prompt_tokens || 0, completion_tokens: result.usage?.completion_tokens || 0 });
  const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
  return { ...parsed, review_required: true } as ProductResearch;
}
