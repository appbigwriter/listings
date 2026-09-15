import { describe, expect, it } from 'vitest';
import { buildApprovalRecord, validateApprovalInput } from '../lib/marketing/approval';

describe('marketing approval', () => {
  it('requires sku, decision, approver and comment', () => {
    expect(validateApprovalInput({ sku: '', decision: 'approved', comments: '' })).toEqual(expect.arrayContaining(['sku_required', 'comments_required']));
  });

  it('allows approved only with explicit approver and preserves audit fields', () => {
    const record = buildApprovalRecord({ sku: 'FBR-ROLLUP-001', decision: 'approved', approver: 'attacker', comments: 'Revisado e aprovado' }, { userId: 'auth-user', organizationId: 'org', mode: 'local-only' });
    expect(record).toMatchObject({ sku: 'FBR-ROLLUP-001', decision: 'approved', approver: 'auth-user', comments: 'Revisado e aprovado' });
    expect(record.created_at).toBeTruthy();
  });

  it('rejects unknown decisions', () => {
    expect(validateApprovalInput({ sku: 'FBR-ROLLUP-001', decision: 'published', approver: 'Sergio', comments: 'x' })).toContain('decision_invalid');
  });
});
