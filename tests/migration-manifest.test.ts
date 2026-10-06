import {describe,it,expect} from 'vitest';
import {verifyMigrationManifest,type MigrationManifest} from '../lib/operations/migration-manifest';
const files=[{path:'20261005165617_catalog_foundation.sql',sha256:'a'.repeat(64)},{path:'20261006024604_amazon_family_version_claim.sql',sha256:'b'.repeat(64)}];
const lock:MigrationManifest={version:1,project_id:'test-project',attested_at:'2026-10-06T04:00:00Z',remote_history:[{version:'20261005165617',name:'catalog_foundation'},{version:'20261006024604',name:'amazon_family_version_claim'}],files,types_sha256:'c'.repeat(64)};
describe('applied migration integrity gate',()=>{
 it('detects SQL modification instead of treating an applied migration as a new deployment',()=>{
  expect(verifyMigrationManifest(lock,files,lock.types_sha256)).toMatchObject({migrations:2,live_remote_drift_checked:false});
  expect(()=>verifyMigrationManifest(lock,[files[0],{...files[1],sha256:'d'.repeat(64)}],lock.types_sha256)).toThrow('aplicada foi alterada');
 });
 it('rejects missing/new/renamed versions, duplicate timestamps and inconsistent remote names',()=>{
  expect(()=>verifyMigrationManifest(lock,files.slice(0,1),lock.types_sha256)).toThrow('ausente');
  expect(()=>verifyMigrationManifest(lock,[...files,{path:'20261006123456_new.sql',sha256:'d'.repeat(64)}],lock.types_sha256)).toThrow('nova');
  expect(()=>verifyMigrationManifest(lock,[files[0],{...files[1],path:'20261005165617_duplicate.sql'}],lock.types_sha256)).toThrow('duplicado');
  expect(()=>verifyMigrationManifest({...lock,remote_history:[lock.remote_history[0],{...lock.remote_history[1],name:'wrong_name'}]},files,lock.types_sha256)).toThrow('Histórico remoto');
 });
 it('requires regenerated and attested types without claiming a live database comparison',()=>{
  expect(()=>verifyMigrationManifest(lock,files,'d'.repeat(64))).toThrow('Tipos do banco');
  expect(()=>verifyMigrationManifest({...lock,attested_at:'invalid'},files,lock.types_sha256)).toThrow('inválido');
 });
});
