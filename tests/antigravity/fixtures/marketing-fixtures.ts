import { MOCK_ORGANIZATION_A, MOCK_USER_OPERATOR_A } from './auth-fixtures';

export function createValidMarketingProfile(sku = 'FBR-AG01-001', customOverrides: Record<string, any> = {}) {
  return {
    id: customOverrides.id || 'b0000000-0000-4000-8000-000000000001',
    sku,
    owner_id: customOverrides.owner_id || MOCK_USER_OPERATOR_A,
    organization_id: customOverrides.organization_id || MOCK_ORGANIZATION_A,
    status: customOverrides.status || 'draft',
    approval_notes: customOverrides.approval_notes || null,
    positioning: 'Leading architectural acrylic signage provider for medical and law offices.',
    target_audience: 'Office facility managers and interior designers in North America.',
    value_props: ['Commercial grade 5mm thickness', 'Laser cut with polished edges', 'Complete mounting kit included'],
    economics: {
      cogs: 14.50,
      packaging: 2.20,
      shipping: 5.80,
      channel_fee_estimate: 7.50,
      margin: 40.0,
      costs: {
        source: 'ERP BOM Revision 2026-Q4 / Supplier Quote ACC-992',
        calculated_at: '2026-10-01T10:00:00.000Z',
      },
    },
    created_at: customOverrides.created_at || '2026-10-01T12:00:00.000Z',
    updated_at: customOverrides.updated_at || '2026-10-01T12:00:00.000Z',
    ...customOverrides,
  };
}

export function createValidAmazonCampaignPlan(sku = 'FBR-AG01-001', customOverrides: Record<string, any> = {}) {
  return {
    id: customOverrides.id || 'c0000000-0000-4000-8000-000000000001',
    sku,
    owner_id: customOverrides.owner_id || MOCK_USER_OPERATOR_A,
    organization_id: customOverrides.organization_id || MOCK_ORGANIZATION_A,
    task_type: 'amazon_sp_campaign',
    plan: {
      campaign_name: `SP - EXACT - ${sku} - Acrylic Sign`,
      daily_budget: 25.00,
      target_acos: 0.25,
      keywords: [
        { keyword: 'acrylic sign', match_type: 'EXACT', bid: 1.20 },
        { keyword: 'office door sign', match_type: 'EXACT', bid: 0.95 },
      ],
    },
    created_at: customOverrides.created_at || '2026-10-01T12:00:00.000Z',
    updated_at: customOverrides.updated_at || '2026-10-01T12:00:00.000Z',
    ...customOverrides,
  };
}

export function createValidMetaCampaignPlan(sku = 'FBR-AG01-001', customOverrides: Record<string, any> = {}) {
  return {
    id: customOverrides.id || 'd0000000-0000-4000-8000-000000000001',
    sku,
    owner_id: customOverrides.owner_id || MOCK_USER_OPERATOR_A,
    organization_id: customOverrides.organization_id || MOCK_ORGANIZATION_A,
    task_type: 'meta_advantage_campaign',
    plan: {
      campaign_name: `FB - TOFU - ${sku} - B2B Signage`,
      daily_budget: 15.00,
      destination_url: 'https://www.amazon.com/dp/B0C1234567',
      primary_text: 'Upgrade your office interior with laser-crafted acrylic signage.',
      headline: 'Architectural Grade Office Signs',
    },
    created_at: customOverrides.created_at || '2026-10-01T12:00:00.000Z',
    updated_at: customOverrides.updated_at || '2026-10-01T12:00:00.000Z',
    ...customOverrides,
  };
}

export function createValidTrackingPlan(sku = 'FBR-AG01-001', customOverrides: Record<string, any> = {}) {
  return {
    id: customOverrides.id || 'e0000000-0000-4000-8000-000000000001',
    sku,
    owner_id: customOverrides.owner_id || MOCK_USER_OPERATOR_A,
    organization_id: customOverrides.organization_id || MOCK_ORGANIZATION_A,
    attribution_tag: customOverrides.attribution_tag || 'fbr_meta_sp_tag_01',
    attribution_status: customOverrides.attribution_status || 'configured_unverified',
    destination_url: customOverrides.destination_url || 'https://www.amazon.com/dp/B0C1234567',
    utm_source: 'meta',
    utm_medium: 'cpc',
    utm_campaign: `tofu_${sku.toLowerCase()}`,
    created_at: customOverrides.created_at || '2026-10-01T12:00:00.000Z',
    updated_at: customOverrides.updated_at || '2026-10-01T12:00:00.000Z',
    ...customOverrides,
  };
}
