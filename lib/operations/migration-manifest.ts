export type MigrationManifest={version:1;project_id:string;attested_at:string;remote_history:{version:string;name:string}[];files:{path:string;sha256:string}[];types_sha256:string};
export function verifyMigrationManifest(lock:MigrationManifest,files:{path:string;sha256:string}[],types_sha256:string){
 if(lock?.version!==1||!lock.project_id||!Number.isFinite(Date.parse(lock.attested_at))||!Array.isArray(lock.remote_history)||!Array.isArray(lock.files)||!lock.files.length)throw new Error('Manifesto de migrations inválido.');
 const names=new Set<string>(),versions=new Set<string>();
 for(const file of files){
  const match=/^(\d{14})_([a-z][a-z0-9_]*)\.sql$/.exec(file.path);
  if(!match||! /^[a-f0-9]{64}$/.test(file.sha256))throw new Error(`Migration/sha256 inválida: ${file.path}.`);
  if(versions.has(match[1]))throw new Error(`Timestamp duplicado: ${match[1]}.`);versions.add(match[1]);names.add(file.path);
 }
 if(files.length!==lock.files.length||files.some(file=>!lock.files.some(known=>known.path===file.path)))throw new Error('Migration nova/ausente/renomeada: reconciliar o histórico remoto e atualizar o manifesto após aplicação e testes.');
 for(const applied of lock.files)if(files.find(file=>file.path===applied.path)?.sha256!==applied.sha256)throw new Error(`Migration aplicada foi alterada: ${applied.path}. Crie uma migration adicional.`);
 if(lock.remote_history.length!==lock.files.length||new Set(lock.remote_history.map(entry=>`${entry.version}_${entry.name}.sql`)).size!==files.length||lock.remote_history.some(entry=>!names.has(`${entry.version}_${entry.name}.sql`)))throw new Error('Histórico remoto atestado não corresponde aos nomes/versões locais.');
 if(lock.types_sha256!==types_sha256)throw new Error('Tipos do banco mudaram: regenerar/conferir contra o projeto e atualizar o manifesto.');
 return {migrations:files.length,project_id:lock.project_id,attested_at:lock.attested_at,scope:'local_integrity_against_recorded_remote_attestation',live_remote_drift_checked:false};
}
