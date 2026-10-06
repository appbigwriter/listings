import {readFileSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const folders=['docs/antigravity/training','docs/antigravity/pilot'];
const markdown=folders.flatMap(folder=>readdirSync(resolve(root,folder)).filter(file=>file.endsWith('.md')).map(file=>resolve(root,folder,file)));
const broken=[];let links=0;
for(const file of markdown){
 const text=readFileSync(file,'utf8');
 for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
  const target=match[1];if(/^https?:\/\//.test(target)||target.startsWith('#'))continue;
  links++;if(!existsSync(resolve(dirname(file),target.split('#')[0])))broken.push({document:relative(root,file),target});
 }
}
const corpus=JSON.parse(readFileSync(resolve(root,'docs/antigravity/pilot/casos-v1.json'),'utf8'));
const matrix=readFileSync(resolve(root,'docs/antigravity/pilot/MATRIZ.md'),'utf8');
const rows=[...matrix.matchAll(/^\| (P\d{2}) \|/gm)].map(match=>match[1]);
const ids=corpus.cases.map(item=>item.id);
const idsValid=ids.length===20&&new Set(ids).size===20&&ids.every((id,index)=>id===`P${String(index+1).padStart(2,'0')}`)&&JSON.stringify(ids)===JSON.stringify(rows);
const emptyRealEvidence=corpus.real_execution_completed===false&&corpus.acceptance_signed===false&&corpus.cases.every(item=>item.status==='proposed'&&item.skus.length===0&&item.authorized_versions.length===0&&item.evidence.length===0&&item.owner_id===null&&item.organization_id===null&&item.responsible_reviewer===null&&item.authorization_evidence===null&&item.observed_result===null&&item.acceptance_decision===null);
const report={version:1,checked_at:new Date().toISOString(),scope:'documentation_links_and_unfilled_pilot_template',documents:markdown.length,local_links:links,broken_links:broken,proposed_cases:ids.length,case_ids_match_matrix:idsValid,no_invented_real_execution:emptyRealEvidence,training_executed:false,pilot_homologated:false,passed:broken.length===0&&idsValid&&emptyRealEvidence};
const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
