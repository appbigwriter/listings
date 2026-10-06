import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {readBrowserFixture} from '../../../../scripts/antigravity/e2e/browser-guard';
test.describe('authorized isolated staging identities and qualified fixture',()=>{
 test.skip(process.env.ANTIGRAVITY_E2E_MODE!=='authenticated','Run requires independently authorized isolated fixture; smoke mode reports separate scope');
 async function login(page:Page,tenant:'tenant_a'|'tenant_b',baseURL:string){
  const fixture=readBrowserFixture(process.env.ANTIGRAVITY_E2E_FIXTURE_FILE,baseURL);
  await page.context().route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort('blockedbyclient'));
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture[tenant].email);await page.getByLabel('Senha',{exact:true}).fill(fixture[tenant].password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/catalog');
  const session=await page.request.get('/api/auth/session');expect(session.status()).toBe(200);expect((await session.json()).organization).toBe(fixture[tenant].organization_id);
  const status=await page.request.get('/api/catalog/status');expect(status.status()).toBe(200);const config=await status.json();for(const key of ['publication','feed_publication','offer_publication','ebay_publication'])expect(config[key]).toBe(false);expect(config.catalog_ready).toBe(true);expect(config.permissions.admin).toBe(true);expect(config.permissions.review).toBe(true);
  return fixture;
 }
 test('draft creation/editing blocks premature review/export; tenant B cannot read or edit tenant A SKU',async({page,browser,baseURL})=>{
  const fixture=await login(page,'tenant_a',baseURL!),sku='AG01-E2E-'+fixture.run_id;let created=false,second:BrowserContext|undefined;
  try{
   await expect(page.getByRole('heading',{name:'Central de preparação',exact:true})).toBeVisible();const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Criar um rascunho',exact:true})});await section.getByLabel('SKU',{exact:true}).fill(sku);await section.getByLabel('Título',{exact:true}).fill('Synthetic isolated unapproved draft');await section.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.waitForURL('**/catalog/'+sku);created=true;
   const read=await page.request.get('/api/listings?sku='+sku);expect(read.status()).toBe(200);let row=(await read.json()).data;
   const patch=await page.request.patch('/api/listings',{headers:{origin:baseURL!},data:{sku,updated_at:row.updated_at,payload:{title:'Synthetic edited unapproved draft'}}});expect(patch.status()).toBe(200);row=(await patch.json()).data;
   const preview=await page.request.post('/api/catalog/review',{headers:{origin:baseURL!},data:{action:'preview',channel:'amazon-us',skus:[sku]}});expect(preview.status()).toBe(200);const item=(await preview.json()).items[0];expect(item.report.ready).toBe(false);
   const review=await page.request.post('/api/catalog/review',{headers:{origin:baseURL!},data:{action:'approve',confirm:true,channel:'amazon-us',entries:[{sku,expected_hash:item.expected_hash,updated_at:item.updated_at}]}});expect(review.status()).toBe(200);expect((await review.json()).outcomes[0].status).toBe('blocked');expect((await page.request.get('/api/catalog/export?sku='+sku)).status()).toBe(422);
   second=await browser.newContext({baseURL});const other=await second.newPage();await login(other,'tenant_b',baseURL!);expect((await other.request.get('/api/listings?sku='+sku)).status()).toBe(404);expect((await other.request.patch('/api/listings',{headers:{origin:baseURL!},data:{sku,updated_at:row.updated_at,payload:{title:'Forbidden tenant mutation'}}})).status()).toBe(404);
  }finally{
   await second?.close();if(created){const read=await page.request.get('/api/listings?sku='+sku);if(read.ok()){const row=(await read.json()).data;const cleanup=await page.request.post('/api/catalog/archive',{headers:{origin:baseURL!},data:{sku,expected_version:row.updated_at,archive:true,confirm:true,reason:'Isolated authorized E2E fixture cleanup'}});expect(cleanup.status()).toBe(200);}}
  }
 });
 test('qualified fixture can be reviewed/exported and later edit invalidates approval',async({page,baseURL})=>{
  const fixture=await login(page,'tenant_a',baseURL!),sku=fixture.qualified_ready_sku;
  const preview=await page.request.post('/api/catalog/review',{headers:{origin:baseURL!},data:{channel:'amazon-us',skus:[sku]}});expect(preview.status()).toBe(200);const item=(await preview.json()).items[0];expect(item.report.ready).toBe(true);
  const approve=await page.request.post('/api/catalog/review',{headers:{origin:baseURL!},data:{action:'approve',confirm:true,channel:'amazon-us',entries:[{sku,expected_hash:item.expected_hash,updated_at:item.updated_at}]}});expect(approve.status()).toBe(200);expect((await approve.json()).outcomes[0].status).toBe('approved');
  const pack=await page.request.get('/api/catalog/export?sku='+sku);expect(pack.status()).toBe(200);expect(pack.headers()['content-disposition']).toContain('attachment');expect(pack.headers()['cache-control']).toBe('no-store');
  const read=await page.request.get('/api/listings?sku='+sku);const row=(await read.json()).data;const patch=await page.request.patch('/api/listings',{headers:{origin:baseURL!},data:{sku,updated_at:row.updated_at,payload:{title:row.payload.title+' E2E edit'}}});expect(patch.status()).toBe(200);expect((await page.request.get('/api/catalog/export?sku='+sku)).status()).toBe(422);
 });
});
