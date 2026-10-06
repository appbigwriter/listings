import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {evaluateCorpus} from '../lib/ai/evaluation';
try{
 const input=process.argv[2],output=process.argv[3];
 if(!input||!output)throw new Error('Uso: npm run ai:evaluate -- corpus.json report.json (somente outputs salvos; sem calls IA).');
 if(statSync(input).size>10_000_000)throw new Error('Corpus excede 10 MB.');
 const report=evaluateCorpus(JSON.parse(readFileSync(input,'utf8')));
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,qualified_catalog_cases:report.qualified_catalog_cases,live_model_executed:false}));
 if(report.failed)process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.message:'Falha de avaliação.');process.exitCode=1;}
