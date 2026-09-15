import { describe, expect, it } from 'vitest';
import { buildAiGenerationPayload, validateAiInput, validateAiListingResponse, validateAiFieldResponse } from '../lib/ai/contracts';
import { readFileSync } from 'node:fs';

describe('AI UI/API payload contract', () => {
  const form = {
    sku: 'FBR-001', title: 'Known sign', brand: 'FBRSigns', manufacturer: 'FBRSigns',
    product_type: 'Sign', origin: 'United States', material: 'Aluminum', color: 'Blue',
    description: 'Known description', bullets: 'Known bullet', keywords: 'sign', included: 'Hardware',
    pkg_length: '10', pkg_width: '8', pkg_height: '1', pkg_weight: '2', price: '99',
    source_text: 'Competitor text', source_url: 'https://example.com/item', compliance: 'Review documents',
    human_reviewed: false,
  };

  it('builds the exact full-generation payload accepted by the API', () => {
    const payload = buildAiGenerationPayload(form);
    expect(validateAiInput(payload)).toMatchObject({ ok: true });
    expect(payload).toEqual({
      fbrFacts: {
        title: 'Known sign', brand: 'FBRSigns', manufacturer: 'FBRSigns', product_type: 'Sign',
        origin: 'United States', material: 'Aluminum', color: 'Blue', description: 'Known description',
        bullets: 'Known bullet', keywords: 'sign', included: 'Hardware', pkg_length: '10', pkg_width: '8',
        pkg_height: '1', pkg_weight: '2', price: '99', compliance: 'Review documents',
      },
      referenceData: { source_text: 'Competitor text', source_url: 'https://example.com/item' },
    });
  });

  it('builds the exact field-generation payload accepted by the API', () => {
    const payload = buildAiGenerationPayload(form, 'title');
    expect(validateAiInput(payload)).toMatchObject({ ok: true });
    expect(payload.fieldId).toBe('title');
    expect(validateAiFieldResponse(payload.fieldId!, 'Known sign', payload)).toMatchObject({ ok: true });
  });

  it('does not expose generation controls for fields outside the factual allowlist', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    for (const field of ['sku', 'manufacturer', 'product_type', 'category', 'pkg_length', 'pkg_width', 'pkg_height', 'pkg_weight', 'price', 'compliance']) {
      expect(page).not.toMatch(new RegExp(`generateFieldWithAI\\('${field}'\\)`));
    }
  });

  it('rejects a competing reference value even when it is present in referenceData', () => {
    const payload = buildAiGenerationPayload({ ...form, title: 'FBR title', source_text: 'RivalBrand' });
    expect(validateAiListingResponse({ title: 'RivalBrand' }, payload)).toMatchObject({ ok: false, error: 'AI_EXTERNAL_CLAIM_NOT_ALLOWED' });
  });
});
