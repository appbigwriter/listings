/** Browser harness proposal. Current *.e2e.test.ts files are Vitest contracts.
 * Never start/reuse the production-auth development server or inherit its secrets.
 * Supply an isolated server explicitly before running future *.spec.ts journeys.
 */
const supplied=process.env.ANTIGRAVITY_E2E_BASE_URL;
if(!supplied)throw new Error('AG-01 navegador pendente: configure ANTIGRAVITY_E2E_BASE_URL para um servidor isolado. As regressões atuais rodam com scripts/antigravity/e2e/run-e2e-harness.ts.');
const url=new URL(supplied);
if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.port!=='33100'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('O harness exige servidor isolado em http://127.0.0.1:33100; nunca reutilize 3000/3100.');
export default {
 testDir:'./tests/antigravity/browser',testMatch:'**/*.spec.ts',timeout:30000,expect:{timeout:5000},fullyParallel:false,forbidOnly:true,retries:0,workers:1,
 reporter:[['list'],['json',{outputFile:'artifacts/antigravity/AG-01/playwright-results.json'}]],
 use:{baseURL:url.origin,trace:'retain-on-failure',headless:true,screenshot:'only-on-failure',video:'off'},
 // No webServer: provisioning and transport isolation must be demonstrated first.
};
