import {traceRequest} from '../../../../lib/operations/trace';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized, hasCapability } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { amazonConfig } from '../../../../lib/marketplaces/amazon';
import { CAPABILITIES } from '../../../../lib/marketplaces/capabilities';
import { oauthConfigured } from '../../../../lib/marketplaces/oauth';
import {recoveryMode} from '../../../../lib/operations/recovery';

async function handleGET(req: NextRequest) {
  const auth=await resolveAuthContext(req);if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); let jobs = false; let catalogReady = false;
  if (db) { const result = await db.from('catalog_jobs').select('id').limit(0); jobs = !result.error; const catalog = await db.from('prelistings').select('id,owner_id,organization_id,human_reviewed,template_key,template_version,archived_at,submission').limit(0); catalogReady = !catalog.error; }
  const feedCheck=db?await db.from('catalog_feeds').select('id').limit(0):null;
  const recovering=recoveryMode(),publication=!recovering&&process.env.PRELISTING_ENABLE_PUBLICATION==='true';
  const offerPublication=publication&&process.env.PRELISTING_ENABLE_OFFER_PATCH==='true';
  const ebayPublication=publication&&process.env.PRELISTING_ENABLE_EBAY_PUBLICATION==='true';
  return NextResponse.json({recovery_mode:recovering,walmart_publication:publication&&process.env.PRELISTING_ENABLE_WALMART_PUBLICATION==='true',ebay_family_publication:ebayPublication&&process.env.PRELISTING_ENABLE_EBAY_FAMILY_PUBLICATION==='true',ebay_publication:ebayPublication,offer_publication:offerPublication,feeds:Boolean(feedCheck&&!feedCheck.error),feed_publication:publication&&process.env.PRELISTING_ENABLE_FEEDS==='true', database: Boolean(db), catalog_ready: catalogReady, jobs, capabilities:CAPABILITIES, permissions:{admin:hasCapability(auth,"admin"),review:hasCapability(auth,"review"),publish:hasCapability(auth,"publish")}, source: Boolean(process.env.SOURCE_CATALOG_URL || process.env.FBR_SOURCE_SUPABASE_URL), ai: Boolean(process.env.OPENAI_API_KEY), publication, channels: { 'amazon-us': amazonConfig().configured, 'ebay-us': oauthConfigured('ebay'), 'walmart-us': oauthConfigured('walmart'), 'tiktok-us': false } });
}

export function GET(req:NextRequest){return traceRequest('api.catalog.status',()=>handleGET(req));}
