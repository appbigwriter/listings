/** Runs isolated contract regressions; never claims browser/live-environment homologation. */
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const directory=resolve('artifacts/antigravity/AG-01');
mkdirSync(directory,{recursive:true});
const reportPath=resolve(directory,'vitest-results.json');
// A failed invocation must never reuse the previous successful report.
if(existsSync(reportPath))unlinkSync(reportPath);
const startedAt=new Date().toISOString();
const result=spawnSync(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','--config',resolve('scripts/antigravity/e2e/vitest.config.mts'),'--reporter=json',`--outputFile=${reportPath}`],{cwd:process.cwd(),encoding:'utf8',timeout:120000,env:{...process.env,NODE_ENV:'test'}});
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):null;
const evidence={task:'AG-01',started_at:startedAt,finished_at:new Date().toISOString(),status:result.status===0&&report?.success===true?'LOCAL_CONTRACT_TESTS_PASSED':'FAILED',exit_code:result.status,tests:{total:report?.numTotalTests??null,passed:report?.numPassedTests??null,failed:report?.numFailedTests??null},scope:'PGlite database and pure module contracts; no browser, live worker, production identity or marketplace homologation',network_guard:'global fetch rejected by test setup; does not attest other network transports',migrations_applied_in_test:readdirSync(resolve('supabase/migrations')).filter(file=>/^\d{14}_.+\.sql$/.test(file)).length,output_sha256:createHash('sha256').update((result.stdout||'')+(result.stderr||'')).digest('hex')};
writeFileSync(resolve(directory,'test-summary.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
if(evidence.status==='FAILED')process.exitCode=1;
