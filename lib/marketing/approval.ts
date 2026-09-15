import type { AuthContext } from '../auth';
export const APPROVAL_DECISIONS = ['approved', 'rejected', 'changes_requested'] as const;
export type ApprovalDecision = typeof APPROVAL_DECISIONS[number];
export type ApprovalInput = { sku?: string; decision?: string; approver?: string; comments?: string };

export function getLatestApprovalDecision(approvals: Array<{ decision?: string; created_at?: string }>): string | null {
  return [...approvals]
    .filter((approval) => Boolean(approval.created_at))
    .sort((a, b) => Date.parse(b.created_at as string) - Date.parse(a.created_at as string))[0]?.decision ?? null;
}

export function validateApprovalInput(input: ApprovalInput) {
  const errors: string[] = [];
  if (!String(input.sku || '').trim()) errors.push('sku_required');
  if (!APPROVAL_DECISIONS.includes(input.decision as ApprovalDecision)) errors.push('decision_invalid');
  if (!String(input.comments || '').trim()) errors.push('comments_required');
  return errors;
}
export function buildApprovalRecord(input: ApprovalInput, auth: AuthContext) {
  const errors = validateApprovalInput(input);
  if (errors.length) throw new Error(errors.join(','));
  return { sku: String(input.sku).trim(), decision: input.decision as ApprovalDecision, approver: auth.userId, comments: String(input.comments).trim(), owner_id: auth.userId, organization_id: auth.organizationId, created_at: new Date().toISOString() };
}
