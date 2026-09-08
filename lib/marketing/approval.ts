export const APPROVAL_DECISIONS = ['approved', 'rejected', 'changes_requested'] as const;
export type ApprovalDecision = typeof APPROVAL_DECISIONS[number];

export type ApprovalInput = { sku?: string; decision?: string; approver?: string; comments?: string };

export function validateApprovalInput(input: ApprovalInput) {
  const errors: string[] = [];
  if (!String(input.sku || '').trim()) errors.push('sku_required');
  if (!APPROVAL_DECISIONS.includes(input.decision as ApprovalDecision)) errors.push('decision_invalid');
  if (!String(input.approver || '').trim()) errors.push('approver_required');
  if (!String(input.comments || '').trim()) errors.push('comments_required');
  return errors;
}

export function buildApprovalRecord(input: ApprovalInput) {
  const errors = validateApprovalInput(input);
  if (errors.length) throw new Error(errors.join(','));
  return {
    sku: String(input.sku).trim(),
    decision: input.decision as ApprovalDecision,
    approver: String(input.approver).trim(),
    comments: String(input.comments).trim(),
    created_at: new Date().toISOString(),
  };
}
