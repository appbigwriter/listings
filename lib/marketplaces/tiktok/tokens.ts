import {assertIdentity,TiktokPreparationError,type TiktokIdentity} from './contracts';
import {hash} from '../../catalog/model';
/** Internal normalized secret record, NOT a guessed TikTok wire response. */
export type TiktokTokenRecord={version:string;identity:TiktokIdentity;access_token:string;refresh_token:string;access_expires_at:number;refresh_expires_at:number;granted_scopes:string[];revoked:boolean};
export type TiktokSecretStore={load:()=>Promise<TiktokTokenRecord|null>;compareAndSet:(expectedVersion:string,record:TiktokTokenRecord)=>Promise<boolean>;withRefreshLock?:<T>(run:()=>Promise<T>)=>Promise<T>};
export type TiktokRefreshAdapter=(previous:TiktokTokenRecord)=>Promise<TiktokTokenRecord>;
export function assertTokenRecord(record:TiktokTokenRecord,identity:TiktokIdentity,now=Date.now()){
 assertIdentity(identity);
 if(!record||hash(record.identity)!==hash(identity)||record.revoked!==false||typeof record.version!=='string'||!record.version||typeof record.access_token!=='string'||!record.access_token||/[\r\n]/.test(record.access_token)||typeof record.refresh_token!=='string'||!record.refresh_token||!Number.isSafeInteger(record.access_expires_at)||record.access_expires_at<=0||!Number.isSafeInteger(record.refresh_expires_at)||record.refresh_expires_at<=now||!Array.isArray(record.granted_scopes)||record.granted_scopes.some(scope=>typeof scope!=='string'||!scope.trim()))throw new TiktokPreparationError('TIKTOK_TOKEN_INVALID',401);
}
export function createTiktokTokenManager(identity:TiktokIdentity,store:TiktokSecretStore,refresh?:TiktokRefreshAdapter,clock=Date.now){
 let inflight:Promise<TiktokTokenRecord>|undefined;
 const obtain=async()=>{
  const previous=await store.load();if(!previous)throw new TiktokPreparationError('TIKTOK_AUTHORIZATION_REQUIRED',401);
  assertTokenRecord(previous,identity,clock());
  if(previous.access_expires_at>clock()+60000)return previous;
  if(!refresh)throw new TiktokPreparationError('TIKTOK_REFRESH_ADAPTER_REQUIRED',503);
  if(!store.withRefreshLock)throw new TiktokPreparationError('TIKTOK_REFRESH_LOCK_REQUIRED',503);
  return store.withRefreshLock(async()=>{
  const locked=await store.load();if(!locked)throw new TiktokPreparationError('TIKTOK_AUTHORIZATION_REQUIRED',401);
  assertTokenRecord(locked,identity,clock());
  if(locked.access_expires_at>clock()+60000)return locked;
  let next:TiktokTokenRecord;try{next=await refresh(structuredClone(locked));}catch{throw new TiktokPreparationError('TIKTOK_REFRESH_FAILED',503);}
  assertTokenRecord(next,identity,clock());
  if(next.version===locked.version||next.access_expires_at<=clock()+60000)throw new TiktokPreparationError('TIKTOK_REFRESH_RESULT_INVALID',503);
  if(!await store.compareAndSet(locked.version,next))throw new TiktokPreparationError('TIKTOK_TOKEN_VERSION_CONFLICT',409);
  const current=await store.load();if(!current||current.version!==next.version)throw new TiktokPreparationError('TIKTOK_TOKEN_VERSION_CONFLICT',409);
  assertTokenRecord(current,identity,clock());return current;
  });
 };
 return {async get(requiredScopes:string[]){
  if(!Array.isArray(requiredScopes)||requiredScopes.some(scope=>typeof scope!=='string'||!scope.trim()))throw new TiktokPreparationError('TIKTOK_SCOPES_REQUIRED');
  if(!inflight)inflight=obtain().catch(error=>{if(error instanceof TiktokPreparationError)throw error;throw new TiktokPreparationError('TIKTOK_SECRET_STORE_FAILED',503);}).finally(()=>{inflight=undefined;});
  const record=await inflight;
  if(requiredScopes.some(scope=>!record.granted_scopes.includes(scope)))throw new TiktokPreparationError('TIKTOK_SCOPE_DENIED',403);
  return {access_token:record.access_token,identity:structuredClone(record.identity),version:record.version};
 }};
}
