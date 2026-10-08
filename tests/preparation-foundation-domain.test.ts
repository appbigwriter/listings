import { describe, expect, it } from 'vitest';
import { buildBackfillFieldStates, buildReadiness, exceptionFingerprint, selectPreparationRule, validatePreparationField } from '../lib/catalog/preparation-foundation';

describe('preparation foundation domain', () => {
  it('deduplicates equivalent exceptions and blocks incomplete fields', () => {
    expect(exceptionFingerprint({ code: 'gtin_missing', channel: 'amazon-us' })).toBe(exceptionFingerprint({ code: 'gtin_missing', channel: 'amazon-us' }));
    const result = buildReadiness([{ fieldPath: 'gtin', state: 'not_found' }]);
    expect(result.status).toBe('needs_evidence');
    expect(result.blockers[0].code).toBe('field_missing');
  });

  it('validates confidence and resolves rule precedence product over family over global', () => {
    expect(validatePreparationField({ fieldPath: 'material', state: 'suggested' })).toContain('valor');
    expect(validatePreparationField({ fieldPath: 'material', state: 'suggested', value: 'aluminum', confidence: 0.9 })).toBeNull();
    const rule = selectPreparationRule([
      { scopeType: 'global', scopeKey: '*', fieldPath: 'material', channel: 'amazon-us', value: 'steel' },
      { scopeType: 'family', scopeKey: 'signs', fieldPath: 'material', channel: 'amazon-us', value: 'aluminum' },
      { scopeType: 'product', scopeKey: 'SKU-1', fieldPath: 'material', channel: 'amazon-us', value: 'acrylic' },
    ], { familyKey: 'signs', sku: 'SKU-1', channel: 'amazon-us', fieldPath: 'material' });
    expect(rule?.value).toBe('acrylic');
  });

  it('creates only traceable suggested states during dry-run backfill', () => {
    const rows = buildBackfillFieldStates({ sku: 'SKU-1', title: 'Plaque', brand: 'FBR', payload: { material: 'aluminum', _catalog: { kind: 'sign' } } });
    expect(rows.map((row) => row.fieldPath)).toEqual(['title', 'brand', 'material']);
    expect(rows.every((row) => row.state === 'suggested' && row.source.authority === 'backfill')).toBe(true);
  });
});
