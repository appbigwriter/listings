import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fetchSourceCatalog } from '../lib/catalog/source';

async function main() {
  const root = process.env.FBR_SOURCE_PROJECT_PATH;
  if (root) {
    const clientPath = `${root}/src/integrations/supabase/client.ts`;
    if (!existsSync(clientPath)) throw new Error('Projeto fonte não reconhecido.');
    let source = readFileSync(clientPath, 'utf8');
    for (const file of ['.env', '.env.local']) if (existsSync(`${root}/${file}`)) source += '\n' + readFileSync(`${root}/${file}`, 'utf8');
    const url = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0];
    const key = source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] || source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
    if (!url || !key) throw new Error('Configure FBR_SOURCE_SUPABASE_URL e FBR_SOURCE_SUPABASE_ANON_KEY a partir do projeto oficial.');
    if (key.startsWith('eyJ')) { const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); if (payload.role !== 'anon') throw new Error('Use somente a chave pública anon da loja.'); }
    process.env.FBR_SOURCE_SUPABASE_URL = url; process.env.FBR_SOURCE_SUPABASE_ANON_KEY = key;
  }
  const products = await fetchSourceCatalog();
  console.log(JSON.stringify({ mode: 'read_only', products_and_variants: products.length, source_configured: true }));
  if (process.argv.includes('--snapshot')) {
    const sample: Record<string, unknown>[] = [];
    const patterns = [/roll.?up/i, /shirt/i, /neon/i, /light.?box/i, /vinyl/i, /bottle/i, /design fee/i, /vehicle wrap/i, /parking/i, /folder/i, /apron/i, /cap/i, /magnet/i, /poster/i, /canopy/i, /letter/i, /foam/i, /flyer/i, /business card/i, /prototype/i];
    for (const pattern of patterns) { const found = products.find(product => pattern.test(String(product.name)) && !sample.some(item => item.sku === product.sku)); if (found) sample.push(found); }
    for (const product of products) if (sample.length < 20 && !sample.some(item => item.sku === product.sku)) sample.push(product);
    writeFileSync('tests/fixtures/catalog-source-sample.json', JSON.stringify(sample.slice(0, 20), null, 2));
    console.log('Amostra pública gravada: até 20 itens, sem aprovação automática de fatos.');
  }
  if (process.argv.includes('--configure')) {
    let env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
    for (const name of ['FBR_SOURCE_SUPABASE_URL', 'FBR_SOURCE_SUPABASE_ANON_KEY']) {
      env = env.replace(new RegExp(`^${name}=.*\\r?\\n?`, 'gm'), '');
      env += `\n${name}=${process.env[name]}\n`;
    }
    writeFileSync('.env', env); console.log('Fonte pública configurada no ambiente local.');
  }
}
main().catch(() => { console.error('Não foi possível validar a fonte. Confira o projeto oficial e a chave pública.'); process.exitCode = 1; });
