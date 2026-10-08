import { describe, expect, it } from 'vitest';
import { createIsolatedTestDatabase } from './antigravity/fixtures/mock-db-helper';

describe('credential incident foundation', () => {
  it('tracks a blocked write condition per marketplace account', async () => {
    const db = await createIsolatedTestDatabase();
    try {
      const owner = '00000000-0000-4000-8000-000000000001', org = '00000000-0000-4000-8000-000000000002';
      const account = (await db.query<{ id: string }>(`insert into public.marketplace_accounts(owner_id,organization_id,channel,account_id,marketplace_id,credential_ref,status,credential_state) values($1::uuid,$2::uuid,'amazon-us','seller-1','ATVPDKIKX0DER','vault://amazon/seller-1','active','invalid') returning id`, [owner, org])).rows[0].id;
      await db.query(`insert into public.marketplace_credential_incidents(owner_id,organization_id,marketplace_account_id,code,message,evidence) values($1::uuid,$2::uuid,$3::uuid,'token_invalid','Token inválido','{}'::jsonb)`, [owner, org, account]);
      const row = (await db.query<{ count: number }>(`select count(*)::int as count from public.marketplace_credential_incidents where marketplace_account_id=$1::uuid`, [account])).rows[0];
      expect(row.count).toBe(1);
    } finally { await db.close(); }
  }, 20000);
});
