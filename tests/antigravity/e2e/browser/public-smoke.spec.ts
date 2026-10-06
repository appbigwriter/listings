import {test,expect} from '@playwright/test';
test.beforeEach(async({context,baseURL})=>{
 await context.clearCookies();await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==baseURL||!['GET','HEAD'].includes(request.method()))return route.abort('blockedbyclient');return route.continue();});
});
test('login exposes accessible fields without submitting credentials',async({page})=>{
 await page.goto('/login');await expect(page.getByRole('heading',{name:'FBR PreListing'})).toBeVisible();await expect(page.getByLabel('Email',{exact:true})).toBeVisible();await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','password');await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
});
test('fresh browser session cannot read private catalog, jobs or export',async({page})=>{
 for(const path of ['/api/auth/session','/api/listings','/api/catalog/jobs','/api/catalog/export?sku=AG01-E2E-NOT-EXISTING']){const response=await page.request.get(path);expect(response.status(),path).toBe(401);}
});
