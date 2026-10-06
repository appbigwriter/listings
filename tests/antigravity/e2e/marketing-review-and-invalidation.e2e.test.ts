import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let savedEnvironment: NodeJS.ProcessEnv;
beforeEach(() => { savedEnvironment = {...process.env}; });
afterEach(() => { vi.unstubAllEnvs(); process.env = savedEnvironment; });
import {
  loadMarketingReview,
  marketingApprovalCurrent,
  marketingSnapshot,
  sealMarketingApproval,
} from '../../../lib/marketing/review';
import { buildApprovalRecord } from '../../../lib/marketing/approval';
import { hash } from '../../../lib/catalog/model';
import {
  createTestAuthContext,
  MOCK_ORGANIZATION_A,
  MOCK_USER_OPERATOR_A,
  MOCK_USER_REVIEWER_A,
} from '../fixtures/auth-fixtures';
import { createProductRow, createValidProductPayload } from '../fixtures/catalog-fixtures';
import {
  createValidAmazonCampaignPlan,
  createValidMarketingProfile,
  createValidMetaCampaignPlan,
  createValidTrackingPlan,
} from '../fixtures/marketing-fixtures';

describe('AG-01: Marketing Review, Invalidation & Version Conflict (S8-05, S12-02)', () => {
  const reviewerAuth = createTestAuthContext({
    userId: MOCK_USER_REVIEWER_A,
    organizationId: MOCK_ORGANIZATION_A,
    roles: ['reviewer'],
  });

  const operatorAuth = createTestAuthContext({
    userId: MOCK_USER_OPERATOR_A,
    organizationId: MOCK_ORGANIZATION_A,
    roles: ['operator'],
  });

  it('generates consistent marketing snapshot and content hash', () => {
    const productRow = createProductRow('FBR-MKT-001');
    const profile = createValidMarketingProfile('FBR-MKT-001');
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-001');
    const meta = createValidMetaCampaignPlan('FBR-MKT-001');
    const tracking = createValidTrackingPlan('FBR-MKT-001');

    const snapshot1 = marketingSnapshot(productRow, profile, amazon, meta, tracking);
    const snapshot2 = marketingSnapshot(productRow, profile, amazon, meta, tracking);

    expect(snapshot1).toEqual(snapshot2);
    expect(hash(snapshot1)).toBe(hash(snapshot2));
    expect(snapshot1.version).toBe('marketing-review-v1');
    expect(snapshot1.product.sku).toBe('FBR-MKT-001');
  });

  it('seals marketing approval with HMAC and verifies its currency', () => {
    const oldEnv = { ...process.env };
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PRELISTING_REVIEW_SECRET = 'antigravity-e2e-test-secret-32bytes';

    const productRow = createProductRow('FBR-MKT-001');
    const profile = createValidMarketingProfile('FBR-MKT-001');
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-001');
    const meta = createValidMetaCampaignPlan('FBR-MKT-001');
    const tracking = createValidTrackingPlan('FBR-MKT-001');

    const snapshot = marketingSnapshot(productRow, profile, amazon, meta, tracking);
    const versionHash = hash(snapshot);

    const baseRecord = buildApprovalRecord(
      {
        sku: 'FBR-MKT-001',
        decision: 'approved',
        comments: 'Launch gate passed and ROI verified.',
      },
      reviewerAuth
    );

    const sealed = sealMarketingApproval(baseRecord, versionHash);
    expect(sealed.content_hash).toBe(versionHash);
    expect(sealed.signature).toMatch(/^[a-f0-9]{64}$/);

    // Current version verifies true for original owner and version hash
    expect(marketingApprovalCurrent(sealed, versionHash, reviewerAuth)).toBe(true);

    // Fails verification if versionHash changed (e.g. price or cost changed)
    const modifiedHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(marketingApprovalCurrent(sealed, modifiedHash, reviewerAuth)).toBe(false);

    // Fails verification if queried by a different owner / attacker
    const otherAuth = createTestAuthContext({
      userId: '99999999-9999-4999-8999-999999999999',
      organizationId: MOCK_ORGANIZATION_A,
    });
    expect(marketingApprovalCurrent(sealed, versionHash, otherAuth)).toBe(false);

    process.env = oldEnv;
  });

  it('invalidates approval when price changes in product payload', () => {
    const oldEnv = { ...process.env };
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PRELISTING_REVIEW_SECRET = 'antigravity-e2e-test-secret-32bytes';

    const initialProduct = createProductRow('FBR-MKT-002', { payload_overrides: { price: 49.99 } });
    const profile = createValidMarketingProfile('FBR-MKT-002');
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-002');
    const meta = createValidMetaCampaignPlan('FBR-MKT-002');
    const tracking = createValidTrackingPlan('FBR-MKT-002');

    const initialSnapshot = marketingSnapshot(initialProduct, profile, amazon, meta, tracking);
    const initialHash = hash(initialSnapshot);

    const sealed = sealMarketingApproval(
      buildApprovalRecord({ sku: 'FBR-MKT-002', decision: 'approved', comments: 'Approved at $49.99' }, reviewerAuth),
      initialHash
    );
    expect(marketingApprovalCurrent(sealed, initialHash, reviewerAuth)).toBe(true);

    // Price updated to $59.99
    const updatedProduct = createProductRow('FBR-MKT-002', { payload_overrides: { price: 59.99 } });
    const updatedSnapshot = marketingSnapshot(updatedProduct, profile, amazon, meta, tracking);
    const updatedHash = hash(updatedSnapshot);

    expect(updatedHash).not.toBe(initialHash);
    expect(marketingApprovalCurrent(sealed, updatedHash, reviewerAuth)).toBe(false);

    process.env = oldEnv;
  });

  it('invalidates approval when cost provenance or margin changes in marketing profile', () => {
    const oldEnv = { ...process.env };
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PRELISTING_REVIEW_SECRET = 'antigravity-e2e-test-secret-32bytes';

    const product = createProductRow('FBR-MKT-003');
    const initialProfile = createValidMarketingProfile('FBR-MKT-003', {
      economics: {
        cogs: 12.0,
        costs: { source: 'Supplier Quote A', calculated_at: '2026-10-01T00:00:00.000Z' },
      },
    });
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-003');
    const meta = createValidMetaCampaignPlan('FBR-MKT-003');
    const tracking = createValidTrackingPlan('FBR-MKT-003');

    const initialHash = hash(marketingSnapshot(product, initialProfile, amazon, meta, tracking));
    const sealed = sealMarketingApproval(
      buildApprovalRecord({ sku: 'FBR-MKT-003', decision: 'approved', comments: 'Approved with Quote A' }, reviewerAuth),
      initialHash
    );

    // Supplier quote updated
    const modifiedProfile = createValidMarketingProfile('FBR-MKT-003', {
      economics: {
        cogs: 16.0,
        costs: { source: 'Supplier Quote B (Inflation Adjustment)', calculated_at: '2026-10-05T00:00:00.000Z' },
      },
    });
    const modifiedHash = hash(marketingSnapshot(product, modifiedProfile, amazon, meta, tracking));

    expect(modifiedHash).not.toBe(initialHash);
    expect(marketingApprovalCurrent(sealed, modifiedHash, reviewerAuth)).toBe(false);

    process.env = oldEnv;
  });

  it('invalidates approval when campaign plans or tracking parameters change', () => {
    const oldEnv = { ...process.env };
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PRELISTING_REVIEW_SECRET = 'antigravity-e2e-test-secret-32bytes';

    const product = createProductRow('FBR-MKT-004');
    const profile = createValidMarketingProfile('FBR-MKT-004');
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-004');
    const meta = createValidMetaCampaignPlan('FBR-MKT-004');
    const initialTracking = createValidTrackingPlan('FBR-MKT-004', { attribution_tag: 'tag_v1' });

    const initialHash = hash(marketingSnapshot(product, profile, amazon, meta, initialTracking));
    const sealed = sealMarketingApproval(
      buildApprovalRecord({ sku: 'FBR-MKT-004', decision: 'approved', comments: 'Initial Campaign Approved' }, reviewerAuth),
      initialHash
    );

    // Tracking tag updated
    const updatedTracking = createValidTrackingPlan('FBR-MKT-004', { attribution_tag: 'tag_v2_amazon_attribution' });
    const updatedHash = hash(marketingSnapshot(product, profile, amazon, meta, updatedTracking));

    expect(updatedHash).not.toBe(initialHash);
    expect(marketingApprovalCurrent(sealed, updatedHash, reviewerAuth)).toBe(false);

    process.env = oldEnv;
  });

  it('detects version conflicts when client expected_hash does not match current state', () => {
    const profile = createValidMarketingProfile('FBR-MKT-005');
    const amazon = createValidAmazonCampaignPlan('FBR-MKT-005');
    const meta = createValidMetaCampaignPlan('FBR-MKT-005');
    const tracking = createValidTrackingPlan('FBR-MKT-005');
    const original = createProductRow('FBR-MKT-005', {payload_overrides: {price: 49.99}});
    const updated = createProductRow('FBR-MKT-005', {payload_overrides: {price: 59.99}});
    const expectedHash = hash(marketingSnapshot(original, profile, amazon, meta, tracking));
    const currentHash = hash(marketingSnapshot(updated, profile, amazon, meta, tracking));
    expect(currentHash).not.toBe(expectedHash);
  });
});
