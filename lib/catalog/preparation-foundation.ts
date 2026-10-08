import { hash } from './model';

export const FIELD_STATES = ['confirmed', 'suggested', 'inherited', 'not_found', 'conflicting', 'not_applicable'] as const;
export type FieldState = typeof FIELD_STATES[number];
export const EXCEPTION_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
export type ExceptionStatus = typeof EXCEPTION_STATUSES[number];
export const READINESS_STATUSES = ['draft', 'needs_evidence', 'needs_review', 'ready_for_review', 'approved', 'submitted', 'accepted', 'published', 'not_verified', 'rejected', 'excluded'] as const;
export type ReadinessStatus = typeof READINESS_STATUSES[number];

export type PreparationField = { fieldPath: string; state: FieldState; value?: unknown; confidence?: number | null };
export type PreparationBlocker = { code: string; fieldPath?: string; severity: 'error' | 'warning'; message: string; action: string };

export function exceptionFingerprint(input: { code: string; fieldPath?: string | null; channel?: string | null; rule?: string | null }) {
  return hash({ code: input.code.trim(), fieldPath: input.fieldPath || null, channel: input.channel || null, rule: input.rule || null });
}

export function validatePreparationField(field: PreparationField) {
  if (!field.fieldPath.trim()) return 'fieldPath obrigatório.';
  if (!FIELD_STATES.includes(field.state)) return 'Estado de campo inválido.';
  if (field.confidence != null && (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1)) return 'Confiança deve estar entre 0 e 1.';
  if (['confirmed', 'suggested', 'inherited'].includes(field.state) && field.value === undefined) return 'Campos preenchidos precisam de valor.';
  return null;
}

export function buildReadiness(fields: PreparationField[], blockers: PreparationBlocker[] = [], reviewed = false): { status: ReadinessStatus; blockers: PreparationBlocker[]; nextAction: string | null } {
  const invalid = fields.filter((field) => ['not_found', 'conflicting'].includes(field.state));
  const merged = [...blockers];
  for (const field of invalid) if (!merged.some((item) => item.fieldPath === field.fieldPath)) merged.push({ code: field.state === 'not_found' ? 'field_missing' : 'field_conflict', fieldPath: field.fieldPath, severity: 'error', message: field.state === 'not_found' ? `Campo ${field.fieldPath} sem evidência.` : `Campo ${field.fieldPath} possui fontes conflitantes.`, action: 'Obter ou confirmar a evidência do campo.' });
  if (merged.some((item) => item.severity === 'error')) return { status: 'needs_evidence', blockers: merged, nextAction: merged.find((item) => item.severity === 'error')?.action || null };
  if (!reviewed) return { status: 'needs_review', blockers: merged, nextAction: 'Revisar o lote de campos sugeridos antes da aprovação.' };
  return { status: 'ready_for_review', blockers: merged, nextAction: null };
}

export type PreparationRule = { scopeType: 'global' | 'family' | 'product'; scopeKey: string; fieldPath: string; channel: string; value: unknown; priority?: number; status?: string; validFrom?: string | null; validUntil?: string | null };
const scopeRank: Record<PreparationRule['scopeType'], number> = { global: 1, family: 2, product: 3 };
export function selectPreparationRule(rules: PreparationRule[], input: { familyKey?: string; sku: string; channel: string; fieldPath: string }, now = new Date()) {
  return rules.filter((rule) => rule.status !== 'disabled' && rule.channel === input.channel && rule.fieldPath === input.fieldPath && (rule.scopeType === 'global' || rule.scopeType === 'family' && rule.scopeKey === input.familyKey || rule.scopeType === 'product' && rule.scopeKey === input.sku) && (!rule.validFrom || new Date(rule.validFrom) <= now) && (!rule.validUntil || new Date(rule.validUntil) >= now)).sort((a, b) => (scopeRank[b.scopeType] - scopeRank[a.scopeType]) || ((b.priority || 0) - (a.priority || 0)))[0] || null;
}

export function buildBackfillFieldStates(row: { sku: string; title?: string | null; brand?: string | null; payload?: Record<string, unknown> | null }, channel = 'amazon-us') {
  const candidates: Array<[string, unknown]> = [['title', row.title], ['brand', row.brand]];
  for (const [key, value] of Object.entries(row.payload || {})) if (!key.startsWith('_') && ['string', 'number', 'boolean'].includes(typeof value)) candidates.push([key, value]);
  return candidates.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([fieldPath, value]) => ({ sku: row.sku, channel, scopeType: 'product' as const, scopeKey: row.sku, fieldPath, state: 'suggested' as const, value, source: { authority: 'backfill', source: 'prelisting_payload' }, evidence: [{ kind: 'catalog_snapshot', sku: row.sku }], confidence: null }));
}
