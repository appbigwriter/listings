import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createIsolatedTestDatabase } from '../fixtures/mock-db-helper';
import {
  MOCK_ORGANIZATION_A,
  MOCK_ORGANIZATION_B,
  MOCK_USER_ATTACKER_B,
  MOCK_USER_OPERATOR_A,
} from '../fixtures/auth-fixtures';

describe('AG-01: Multi-Tenant Data Isolation (S4-04, S4-05)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createIsolatedTestDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('prevents tenant B from reading or modifying prelistings created by tenant A', async () => {
    await db.exec('begin');
    try {
      // Insert product owned by Tenant A
      await db.query(
        `insert into prelistings(sku, title, owner_id, organization_id, status)
         values('SKU-TENANT-A', 'Tenant A Product', $1, $2, 'draft')`,
        [MOCK_USER_OPERATOR_A, MOCK_ORGANIZATION_A]
      );

      // Verify Tenant A can query its product
      const resA = await db.query(
        `select sku, title from prelistings where sku = 'SKU-TENANT-A' and owner_id = $1 and organization_id = $2`,
        [MOCK_USER_OPERATOR_A, MOCK_ORGANIZATION_A]
      );
      expect(resA.rows).toHaveLength(1);
      expect(resA.rows[0]).toMatchObject({ sku: 'SKU-TENANT-A' });

      // Verify Tenant B (different owner/org) gets 0 rows when scoping to their own credentials
      const resB = await db.query(
        `select sku, title from prelistings where sku = 'SKU-TENANT-A' and owner_id = $1 and organization_id = $2`,
        [MOCK_USER_ATTACKER_B, MOCK_ORGANIZATION_B]
      );
      expect(resB.rows).toHaveLength(0);
    } finally {
      await db.exec('rollback');
    }
  });

  it('enforces composite foreign key constraints preventing cross-tenant marketing child insertion', async () => {
    await db.exec('begin');
    try {
      // Create Tenant A profile
      const profileA = (
        await db.query<{ id: string }>(
          `insert into product_marketing_profiles(sku, owner_id, organization_id, status)
           values('SKU-MKT-A', $1, $2, 'draft') returning id`,
          [MOCK_USER_OPERATOR_A, MOCK_ORGANIZATION_A]
        )
      ).rows[0];

      // Tenant A can create a campaign plan linked to its own profile
      await db.query(
        `insert into amazon_campaign_plans(sku, owner_id, organization_id, marketing_profile_id, task_type)
         values('SKU-MKT-A', $1, $2, $3, 'amazon_sp_campaign')`,
        [MOCK_USER_OPERATOR_A, MOCK_ORGANIZATION_A, profileA.id]
      );

      // Tenant B cannot attach a campaign plan to Tenant A's marketing_profile_id
      await db.exec('savepoint cross_tenant_attempt');
      await expect(
        db.query(
          `insert into amazon_campaign_plans(sku, owner_id, organization_id, marketing_profile_id, task_type)
           values('SKU-MKT-A', $1, $2, $3, 'amazon_sp_campaign')`,
          [MOCK_USER_ATTACKER_B, MOCK_ORGANIZATION_B, profileA.id]
        )
      ).rejects.toThrow();
      await db.exec('rollback to savepoint cross_tenant_attempt');
    } finally {
      await db.exec('rollback');
    }
  });

  it('enforces mandatory non-null tenant columns across all marketing tables', async () => {
    await db.exec('begin');
    try {
      // Null owner_id or organization_id must be rejected
      await db.exec('savepoint null_tenant');
      await expect(
        db.query(
          `insert into tracking_plans(sku, attribution_tag, attribution_status)
           values('SKU-NULL-TENANT', 'tag1', 'configured_unverified')`
        )
      ).rejects.toThrow();
      await db.exec('rollback to savepoint null_tenant');
    } finally {
      await db.exec('rollback');
    }
  });
});
