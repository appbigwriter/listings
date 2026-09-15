import type { AuthContext } from '../auth';
import { getActiveListing } from '../catalog/active-listing';

export type LatestApproval = { decision?: string; created_at?: string; [key: string]: unknown };

export type MarketingProfileContext = {
  listing: any | null;
  profile: any | null;
  latestApproval: LatestApproval | null;
  archived: boolean;
  error: unknown;
};

/** Load the active listing, matching profile, and newest approval for one tenant. */
export async function getMarketingProfileContext(db: any, auth: AuthContext, sku: string): Promise<MarketingProfileContext> {
  const active = await getActiveListing(db, auth, sku);
  if (active.error || active.archived || !active.listing) {
    return { listing: active.listing, profile: null, latestApproval: null, archived: active.archived, error: active.error };
  }

  const scoped = (table: string) => db.from(table).select('*')
    .eq('sku', sku)
    .eq('organization_id', auth.organizationId)
    .eq('owner_id', auth.userId);
  const [profileResult, approvalResult] = await Promise.all([
    scoped('product_marketing_profiles').maybeSingle(),
    scoped('marketing_approvals').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    listing: active.listing,
    profile: profileResult.data ?? null,
    latestApproval: approvalResult.data ?? null,
    archived: false,
    error: profileResult.error || approvalResult.error,
  };
}

export function validateLaunchReadyTransition(
  gate: { ready: boolean; blockers?: string[] },
  latestApproval: LatestApproval | null,
): { ok: true } | { ok: false; code: 'LAUNCH_GATE_BLOCKED' | 'APPROVAL_REQUIRED' | 'APPROVAL_NOT_CURRENT'; blockers?: string[] } {
  if (!gate.ready) return { ok: false, code: 'LAUNCH_GATE_BLOCKED', blockers: gate.blockers || [] };
  if (!latestApproval) return { ok: false, code: 'APPROVAL_REQUIRED' };
  if (latestApproval.decision !== 'approved') return { ok: false, code: 'APPROVAL_NOT_CURRENT' };
  return { ok: true };
}
