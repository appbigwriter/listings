export const AI_LISTING_FIELDS = ['title','bullets','description','keywords','material','color','included'] as const;
export type AiListingField = typeof AI_LISTING_FIELDS[number];
export const AI_FACT_FIELDS = [
  'title','brand','manufacturer','product_type','origin','description','bullets','keywords',
  'material','color','included','pkg_length','pkg_width','pkg_height','pkg_weight','price','compliance',
] as const;
export type AiGenerationInput = {
  fbrFacts: Record<string, unknown>;
  referenceData?: Record<string, unknown>;
  fieldId?: AiListingField;
};
type Validation<T> = { ok: true; value: T } | { ok: false; error: string };
type RecordValue = Record<string, unknown>;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function stringsIn(value: unknown): Set<string> {
  const result = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string' && item.trim()) result.add(item.trim());
    else if (Array.isArray(item)) item.forEach(visit);
    else if (isRecord(item)) Object.values(item).forEach(visit);
  };
  visit(value);
  return result;
}

export function buildAiGenerationPayload(form: Record<string, unknown>, fieldId?: AiListingField): AiGenerationInput {
  const fbrFacts = Object.fromEntries(AI_FACT_FIELDS.filter((key) => form[key] !== undefined && form[key] !== '').map((key) => [key, form[key]]));
  const referenceData = Object.fromEntries(['source_text', 'source_url'].filter((key) => form[key] !== undefined && form[key] !== '').map((key) => [key, form[key]]));
  return { fbrFacts, ...(Object.keys(referenceData).length ? { referenceData } : {}), ...(fieldId ? { fieldId } : {}) };
}

export function validateAiInput(input: unknown): Validation<AiGenerationInput> {
  if (!isRecord(input) || !isRecord(input.fbrFacts)) return { ok: false, error: 'AI_INPUT_SCHEMA_INVALID' };
  if (input.referenceData !== undefined && !isRecord(input.referenceData)) return { ok: false, error: 'AI_INPUT_REFERENCE_DATA_INVALID' };
  if (input.fieldId !== undefined && !AI_LISTING_FIELDS.includes(input.fieldId as AiListingField)) return { ok: false, error: 'AI_FIELD_NOT_ALLOWED' };
  if (Object.keys(input).some((key) => !['fbrFacts', 'referenceData', 'fieldId'].includes(key))) return { ok: false, error: 'AI_INPUT_SCHEMA_INVALID' };
  return { ok: true, value: input as AiGenerationInput };
}

function validateCandidate(candidate: unknown, input: unknown, field?: string): Validation<string> {
  const parsed = validateAiInput(input);
  if (!parsed.ok) return parsed;
  const value = text(candidate);
  if (!value) return { ok: true, value };
  const facts = stringsIn(parsed.value.fbrFacts);
  const external = stringsIn(parsed.value.referenceData);
  if (external.has(value) && !facts.has(value)) return { ok: false, error: 'AI_EXTERNAL_CLAIM_NOT_ALLOWED' };
  if (!facts.has(value)) return { ok: false, error: field ? `AI_UNSUPPORTED_VALUE:${field}` : 'AI_UNSUPPORTED_VALUE' };
  return { ok: true, value };
}

export function validateAiListingResponse(candidate: unknown, input: unknown): Validation<Record<string, unknown>> {
  const parsed = validateAiInput(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(candidate)) return { ok: false, error: 'AI_RESPONSE_SCHEMA_INVALID' };
  const allowed = new Set<string>(AI_LISTING_FIELDS);
  if (Object.keys(candidate).some((key) => !allowed.has(key))) return { ok: false, error: 'AI_RESPONSE_FIELD_NOT_ALLOWED' };
  const value: Record<string, unknown> = {};
  for (const field of AI_LISTING_FIELDS) {
    if (candidate[field] !== undefined && typeof candidate[field] !== 'string') return { ok: false, error: 'AI_RESPONSE_TYPE_INVALID' };
    const checked = validateCandidate(candidate[field] ?? '', parsed.value, field);
    if (!checked.ok) return checked;
    value[field] = checked.value;
  }
  return { ok: true, value: { ...value, status: 'draft', review_required: true, provenance: { source: 'fbrFacts', fields: Object.keys(candidate), review_required: true } } };
}

export function validateAiFieldResponse(fieldId: string, candidate: unknown, input: unknown): Validation<string> {
  if (!AI_LISTING_FIELDS.includes(fieldId as AiListingField)) return { ok: false, error: 'AI_FIELD_NOT_ALLOWED' };
  const parsed = validateAiInput(input);
  if (!parsed.ok) return parsed;
  if (parsed.value.fieldId !== fieldId) return { ok: false, error: 'AI_FIELD_MISMATCH' };
  return validateCandidate(candidate, parsed.value, fieldId);
}
