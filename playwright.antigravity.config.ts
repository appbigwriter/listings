import {defineConfig} from '@playwright/test';
import {browserTarget,readBrowserFixture} from './scripts/antigravity/e2e/browser-guard';
const mode=process.env.ANTIGRAVITY_E2E_MODE,baseURL=browserTarget(process.env.ANTIGRAVITY_E2E_BASE_URL,mode);
if(mode==='authenticated')readBrowserFixture(process.env.ANTIGRAVITY_E2E_FIXTURE_FILE,baseURL);
export default defineConfig({
 testDir:'./tests/antigravity/e2e/browser',testMatch:mode==='smoke-readonly'?'**/public-smoke.spec.ts':'**/*.spec.ts',timeout:30000,expect:{timeout:5000},fullyParallel:false,forbidOnly:true,retries:0,workers:1,
 reporter:[['list'],['json',{outputFile:'artifacts/antigravity/AG-01-browser/playwright-results.json'}]],outputDir:'artifacts/antigravity/AG-01-browser/output',
 use:{baseURL,headless:true,trace:'off',screenshot:'off',video:'off',launchOptions:process.env.ANTIGRAVITY_E2E_CHROME_PATH?{executablePath:process.env.ANTIGRAVITY_E2E_CHROME_PATH}:undefined},
 // Explicit existing server only. No webServer, login seed, production fixture or inherited browser session.
});
