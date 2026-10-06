import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const roots=['app','lib','scripts','tests','public','infrastructure','.github','supabase','coordination/antigravity','artifacts/antigravity'];
const excludedDirs=new Set(['node_modules','.git','.next','.next-dev','.temp','.branches','backups']);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourceFiles(root=projectRoot){
 const files=new Map();
 function visit(relative){
  const absolute=path.join(root,relative);if(!fs.existsSync(absolute))return;
  const stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())return;
  if(stat.isDirectory()){for(const item of fs.readdirSync(absolute)){if(!excludedDirs.has(item))visit(path.join(relative,item));}return;}
  const normalized=relative.split(path.sep).join('/'),name=path.basename(relative);
  if(normalized==='coordination/antigravity/BASELINE.json'||name==='next-env.d.ts'||name.endsWith('.tsbuildinfo')||name.startsWith('.env')&&name!=='.env.example')return;
  files.set(normalized,digest(fs.readFileSync(absolute)));
 }
 for(const rootName of roots)visit(rootName);
 for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&(/\.(?:[cm]?[jt]sx?|json|ya?ml|md|css)$/.test(entry.name)||['Dockerfile','.dockerignore','.gitignore','.env.example'].includes(entry.name)))visit(entry.name);
 return [...files].sort(([a],[b])=>a.localeCompare(b)).map(([relative,sha256])=>({path:relative,sha256}));
}
function matches(file,glob){
 const pattern=glob.replace(/[|\\{}()[\]^$+?.]/g,'\\$&').replace(/\*\*/g,'\0').replace(/\*/g,'[^/]*').replace(/\0/g,'.*');
 return new RegExp('^'+pattern+'$').test(file);
}
function check(){
 const baseline=JSON.parse(fs.readFileSync(path.join(projectRoot,'coordination/antigravity/BASELINE.json'),'utf8'));
 const taskIndex=process.argv.indexOf('--task'),taskId=taskIndex>=0?process.argv[taskIndex+1]:null;
 const task=taskId?JSON.parse(fs.readFileSync(path.join(projectRoot,'coordination/antigravity/TASKS.json'),'utf8')).tasks.find(item=>item.id===taskId):null;
 if(taskId&&!task)throw new Error('Pacote desconhecido: '+taskId);
 const allowed=task?[...task.paths,'coordination/antigravity/reports/'+taskId+'.md','artifacts/antigravity/'+taskId+'/**']:[];
 const before=new Map(baseline.files.map(item=>[item.path,item.sha256])),now=new Map(sourceFiles().map(item=>[item.path,item.sha256]));
 const changed=[...new Set([...before.keys(),...now.keys()])].filter(file=>before.get(file)!==now.get(file)).sort();
 const permitted=changed.filter(file=>allowed.some(glob=>matches(file,glob))),protectedChanges=changed.filter(file=>!permitted.includes(file));
 console.log(JSON.stringify({baseline_id:baseline.baseline_id,task:taskId,ok:protectedChanges.length===0,allowed_changes:permitted,protected_or_unassigned_changes:protectedChanges},null,2));
 if(protectedChanges.length)process.exitCode=1;
}
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))try{check();}catch(error){console.error(error instanceof Error?error.message:'Falha ao verificar baseline.');process.exitCode=1;}
