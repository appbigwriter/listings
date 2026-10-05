import { amazonCategories, amazonSchema } from '../lib/marketplaces/amazon';
import { getSupabase } from '../lib/marketing/supabase';
import { validateSchema } from '../lib/catalog/schema';

async function main() {
  const result: Record<string, unknown> = { checked_at: new Date().toISOString(), mode: 'read_only' };
  const db = getSupabase();
  if (db) { const health = await db.from('prelistings').select('id,owner_id,organization_id,human_reviewed,archived_at,template_key,template_version,submission').limit(0); result.catalog_database = health.error ? `migration_required (${health.error.code})` : 'accessible'; const jobs = await db.from('catalog_jobs').select('id').limit(0); result.jobs_database = jobs.error ? 'migration_required' : 'accessible'; }
  try { const categories = await amazonCategories('FBRSigns Retractable Roll Up Banner Stand 33 inches'); result.amazon_categories = categories.length; if (categories[0]) { const schema = await amazonSchema(categories[0].id, categories[0].id); result.amazon_schema = { version: schema.version, attributes: Object.keys(schema.schema.properties || {}).length }; const issues = validateSchema(schema.schema, {}); result.amazon_schema_validator = issues.some(issue => issue.code === 'schema_unsupported') ? 'unsupported_schema' : { status: 'compiled', missing_attribute_issues: issues.length }; } }
  catch (error) { result.amazon = error instanceof Error ? error.message : 'unavailable'; }
  console.log(JSON.stringify(result, null, 2));
}
void main();
