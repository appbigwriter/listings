import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {evaluateOffline,type Corpus} from './evaluate';
async function main(){
 const [, ,input,output]=process.argv;
 if(!input||!output)throw new Error('Uso: npx tsx scripts/antigravity/evals/run.ts corpus.json report.json');
 if(statSync(input).size>10_000_000)throw new Error('Corpus excede 10 MB.');
 // This command intentionally has no provider path. Ambient API keys cannot enable calls.
 globalThis.fetch=async()=>{throw new Error('AG-03 offline: rede bloqueada.');};
 const report=await evaluateOffline(JSON.parse(readFileSync(input,'utf8')) as Corpus);
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,remote_calls:0,live_model_executed:false}));
 if(report.failed)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Falha offline.');process.exitCode=1;});
