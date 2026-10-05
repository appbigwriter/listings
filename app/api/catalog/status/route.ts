import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { amazonConfig } from '../../../../lib/marketplaces/amazon';
import { CAPABILITIES } from '../../../../lib/marketplaces/capabilities';
import { oauthConfigured } from '../../../../lib/marketplaces/oauth';

export async function GET(req: NextRequest) {
  if (!await resolveAuthContext(req)) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); let jobs = false; let catalogReady = false;
  if (db) { const result = await db.from('catalog_jobs').select('id').limit(0); jobs = !result.error; const catalog = await db.from('prelistings').select('id,owner_id,organization_id,human_reviewed,template_key,template_version,archived_at,submission').limit(0); catalogReady = !catalog.error; }
  return NextResponse.json({ database: Boolean(db), catalog_ready: catalogReady, jobs, capabilities:CAPABILITIES, source: Boolean(process.env.SOURCE_CATALOG_URL || process.env.FBR_SOURCE_SUPABASE_URL), ai: Boolean(process.env.OPENAI_API_KEY), publication: process.env.PRELISTING_ENABLE_PUBLICATION === 'true', channels: { 'amazon-us': amazonConfig().configured, 'ebay-us': oauthConfigured('ebay'), 'walmart-us': oauthConfigured('walmart'), 'tiktok-us': false } });
}
