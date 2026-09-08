import { describe, expect, it } from 'vitest';
import { buildApprovalRecord, validateApprovalInput } from '../lib/marketing/approval';

describe('marketing approval', () => {
  it('requires sku, decision, approver and comment', () => {
    expect(validateApprovalInput({ sku: '', decision: 'approved', approver: '', comments: '' })).toEqual(expect.arrayContaining(['sku_required', 'approver_required', 'comments_required']));
  });

  it('allows approved only with explicit approver and preserves audit fields', () => {
    const record = buildApprovalRecord({ sku: 'FBR-ROLLUP-001', decision: 'approved', approver: 'Sergio Castro', comments: 'Revisado e aprovado' });
    expect(record).toMatchObject({ sku: 'FBR-ROLLUP-001', decision: 'approved', approver: 'Sergio Castro', comments: 'Revisado e aprovado' });
    expect(record.created_at).toBeTruthy();
  });

  it('rejects unknown decisions', () => {
    expect(validateApprovalInput({ sku: 'FBR-ROLLUP-001', decision: 'published', approver: 'Sergio', comments: 'x' })).toContain('decision_invalid');
  });
});
