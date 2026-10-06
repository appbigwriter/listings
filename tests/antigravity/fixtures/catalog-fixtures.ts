import { contentHash, hash } from '../../../lib/catalog/model';
import { MOCK_ORGANIZATION_A, MOCK_USER_OPERATOR_A } from './auth-fixtures';

export function createValidProductPayload(sku = 'FBR-AG01-001', customFields: Record<string, any> = {}) {
  const base = {
    sku,
    title: `FBR Signs Premium Acrylic Sign ${sku}`,
    description: 'High durability weatherproof UV resistant acrylic sign designed for offices and commercial spaces.',
    bullets: [
      'Premium 5mm cast acrylic material',
      'Direct UV cured printing with scratch resistance',
      'Includes brushed silver standoff mounting hardware',
      'Suitable for indoor and outdoor commercial signage',
      'Precision laser polished beveled edges'
    ],
    keywords: 'acrylic sign, business sign, office door plaque, custom plaque',
    brand: 'FBR Signs',
    material: 'Cast Acrylic',
    price: 49.99,
    qty: 150,
    asin: 'B0C1234567',
    amazon_url: 'https://www.amazon.com/dp/B0C1234567',
    images: ['https://cdn.example.com/signs/fbr-001-main.jpg'],
    fulfillment: 'FBM',
    pkg_length: 12.0,
    pkg_width: 8.0,
    pkg_height: 1.5,
    pkg_weight: 1.2,
    _catalog: {
      category: 'SIGN',
      facts: {
        dimensions: '10x6 in',
        finish: 'Gloss Clear',
        thickness: '5mm',
      },
      channels: {
        'amazon-us': {
          category: 'SIGN',
          report: { ready: true },
          approval: {
            hash: '0000000000000000000000000000000000000000000000000000000000000000',
            approver: MOCK_USER_OPERATOR_A,
            approved_at: new Date().toISOString(),
          },
          submission: {
            status: 'published',
            publication_status: 'buyable',
            submission_id: 'sub-amazon-12345',
            submitted_at: new Date().toISOString(),
            verified_content_hash: '',
          },
        },
      },
    },
    ...customFields,
  };

  // Preencher verified_content_hash correspondente
  if (base._catalog?.channels?.['amazon-us']?.submission) {
    base._catalog.channels['amazon-us'].submission.verified_content_hash = contentHash(base as any, 'amazon-us');
    base._catalog.channels['amazon-us'].approval.hash = contentHash(base as any, 'amazon-us');
  }

  return base;
}

export function createProductRow(sku = 'FBR-AG01-001', customOverrides: Record<string, any> = {}) {
  const payload = createValidProductPayload(sku, customOverrides.payload_overrides);
  return {
    id: customOverrides.id || 'a0000000-0000-4000-8000-000000000001',
    sku,
    title: payload.title,
    status: customOverrides.status || 'draft',
    owner_id: customOverrides.owner_id || MOCK_USER_OPERATOR_A,
    organization_id: customOverrides.organization_id || MOCK_ORGANIZATION_A,
    human_reviewed: customOverrides.human_reviewed !== undefined ? customOverrides.human_reviewed : true,
    payload,
    created_at: customOverrides.created_at || '2026-10-01T12:00:00.000Z',
    updated_at: customOverrides.updated_at || '2026-10-01T12:00:00.000Z',
  };
}
