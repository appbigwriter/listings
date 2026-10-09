'use client';

import type { Channel, ProductInput } from '../../lib/catalog/model';
import { internalFamilySuggestion } from '../../lib/catalog/internal-family';

export default function PreparationEvidence({ product, channel, amazonEnvironment }: { product: ProductInput; channel: Channel; amazonEnvironment?: string }) {
  const catalog = product._catalog;
  const listing = catalog?.channels[channel];
  const grounding = listing?.copy?.grounding as { supported?: boolean; evidence?: { field: string; quote: string }[]; visual_observations?: string[]; image_count?: number; review_reason?: string } | undefined;
  const sourced = Object.entries(catalog?.field_sources || {}).filter(([, source]) => source.authority === 'source');
  const family = internalFamilySuggestion(product);
  return <section className="card mt-5" aria-label="Preparação semiautomática">
    <h2 className="text-lg font-bold">Preparação semiautomática</h2>
    <p className="mt-2 text-sm text-slate-600">Fonte: {catalog?.source?.id || 'sem importação identificada'} · {sourced.length} campos rastreáveis · {grounding?.image_count ?? 0} imagens enviadas à análise.</p>
    <p className="mt-2 text-sm">Família de preparação: {family || 'a definir'} (orientação interna; não é categoria Amazon).</p>
    <p className="mt-2 text-sm">{listing?.copy ? 'Rascunho salvo para revisão.' : 'Rascunho ainda não gerado. Use “Preparar rascunho” abaixo.'} {grounding?.supported === false ? grounding.review_reason || 'Confira as afirmações do texto.' : ''}</p>
    {channel === 'amazon-us' && amazonEnvironment === 'sandbox' && <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">Categoria Amazon pendente: o Sandbox não fornece uma comparação confiável com o catálogo real. Confirme o tipo de produto com evidência oficial antes de exportar.</p>}
    {grounding?.evidence?.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Evidências citadas pela auditoria ({grounding.evidence.length})</summary><ul className="mt-2 list-disc pl-5">{grounding.evidence.map((item, index) => <li key={index}>{item.field}: “{item.quote}”</li>)}</ul></details> : null}
    {grounding?.visual_observations?.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Observações das imagens para conferir ({grounding.visual_observations.length})</summary><ul className="mt-2 list-disc pl-5">{grounding.visual_observations.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
  </section>;
}
