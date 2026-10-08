import assert from 'node:assert/strict';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'PRELISTING_AUTH_MODE', 'PRELISTING_APP_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL',
];
const missing = required.filter((name) => !String(process.env[name] || '').trim());
assert.equal(process.env.PRELISTING_AUTH_MODE, 'supabase-session', 'PRELISTING_AUTH_MODE deve ser supabase-session em produção.');
assert.equal(process.env.PRELISTING_ALLOW_LOCAL_ONLY || 'false', 'false', 'PRELISTING_ALLOW_LOCAL_ONLY deve ser false em produção.');
assert.equal(missing.length, 0, `Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL, /^https:\/\//, 'NEXT_PUBLIC_SUPABASE_URL deve usar HTTPS.');
assert.match(process.env.PRELISTING_APP_URL, /^https:\/\//, 'PRELISTING_APP_URL deve usar HTTPS.');
for (const name of ['PRELISTING_ENABLE_PUBLICATION', 'PRELISTING_ENABLE_FEEDS', 'PRELISTING_ENABLE_OFFER_PATCH', 'PRELISTING_ENABLE_EBAY_PUBLICATION', 'PRELISTING_ENABLE_EBAY_FAMILY_PUBLICATION', 'PRELISTING_ENABLE_WALMART_PUBLICATION']) assert.equal(process.env[name] || 'false', 'false', `${name} deve permanecer false até autorização do piloto.`);
const bytes = Number(process.env.EXTRACTION_MAX_BYTES || 2_000_000), timeout = Number(process.env.EXTRACTION_TIMEOUT_MS || 10_000);
assert.ok(Number.isSafeInteger(bytes) && bytes >= 100_000 && bytes <= 10_000_000, 'EXTRACTION_MAX_BYTES inválido.');
assert.ok(Number.isSafeInteger(timeout) && timeout >= 1000 && timeout <= 120_000, 'EXTRACTION_TIMEOUT_MS inválido.');
if (process.env.PRELISTING_AI_DAILY_USD) assert.match(process.env.PRELISTING_AI_DAILY_USD, /^\d+(\.\d{1,6})?$/, 'PRELISTING_AI_DAILY_USD inválido.');
if (process.env.FBR_SOURCE_SUPABASE_URL) assert.ok(process.env.FBR_SOURCE_SUPABASE_ANON_KEY, 'FBR_SOURCE_SUPABASE_ANON_KEY obrigatório com FBR_SOURCE_SUPABASE_URL.');
if (!process.env.FBR_SOURCE_SUPABASE_URL) assert.ok(process.env.SOURCE_CATALOG_URL, 'Configure FBR_SOURCE_SUPABASE_URL ou SOURCE_CATALOG_URL.');
console.log(JSON.stringify({ status: 'ok', source: process.env.FBR_SOURCE_SUPABASE_URL ? 'supabase' : 'http', publication: false, extraction: { bytes, timeout_ms: timeout } }));
