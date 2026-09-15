import { describe, expect, it } from 'vitest';
import { validateListing, buildSellerExport, SELLER_TEMPLATES } from '../lib/catalog/contracts';
import { buildSubmissionRecord } from '../lib/catalog/submission';

describe('closing domain contracts', () => {
  it('blocks Seller Handoff when template, package dimensions, identity and review are missing', () => {
    const result = validateListing({ sku: 'FBR-TEST-001', title: 'Test' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['template_required', 'package_dimensions_required', 'identity_required', 'human_review_required']));
  });
  it('exports a valid versioned Seller Handoff with metadata', () => {
    const listing = { sku:'FBR-TEST-001', title:'FBR Sign', brand:'FBRSigns', product_type:'sign', category:'signs', origin:'United States', asin:'', gtin:'123456789012', id_type:'UPC', pkg_length:'10', pkg_width:'8', pkg_height:'2', pkg_weight:'3', price:'29.99', qty:'2', images:'https://cdn.example/main.jpg', fulfillment:'FBM', human_reviewed:true, template_key:'fbrsigns_sign', template_version:'2026-01' };
    const result = validateListing(listing);
    expect(result.valid).toBe(true);
    const exported = buildSellerExport(listing);
    expect(exported.metadata).toMatchObject({ sku: listing.sku, template_key: 'fbrsigns_sign', template_version: '2026-01', status: 'draft' });
    expect(exported.csv).toContain('sku');
  });
  it('keeps manual Seller result distinct from publication', () => {
    expect(buildSubmissionRecord({ sku:'FBR-TEST-001', status:'rejected', protocol:'SP-123', reason:'Invalid image' })).toMatchObject({ status:'rejected', protocol:'SP-123', reason:'Invalid image' });
  });
  it('only exposes versioned supported templates', () => expect(SELLER_TEMPLATES.fbrsigns_sign.version).toBeTruthy());
});
