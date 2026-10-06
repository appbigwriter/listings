import {readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,resolve,sep} from 'node:path';
export type BrowserFixture={isolated:true;authorized_test_identities:true;checked_at:string;base_url:string;supabase_project_ref:string;publication_enabled:false;external_writes_blocked:true;run_id:string;tenant_a:{email:string;password:string;organization_id:string};tenant_b:{email:string;password:string;organization_id:string};qualified_ready_sku:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function browserTarget(base:string|undefined,mode:string|undefined){
 if(!base)throw new Error('Explicit browser base URL required');const url=new URL(base);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('Only isolated localhost HTTP origin allowed');
 if(mode==='smoke-readonly'&&['3100','33100'].includes(url.port))return url.origin;
 if(mode==='authenticated'&&url.port==='33100')return url.origin;
 throw new Error('Choose smoke-readonly (3100/33100) or authenticated (33100 only)');
}
export function validateBrowserFixture(input:any,base:string,now=Date.now()):BrowserFixture{
 if(!input||input.isolated!==true||input.authorized_test_identities!==true||input.base_url!==base||input.publication_enabled!==false||input.external_writes_blocked!==true||!uuid.test(input.run_id))throw new Error('Isolated fixture attestations missing');
 if(!/^[a-z0-9]{20}$/.test(input.supabase_project_ref)||['yigqsjevwvqxrxvqhvtd','sssmxxigyipnqcaxpsfx'].includes(input.supabase_project_ref))throw new Error('Known production/source projects forbidden');
 const checked=Date.parse(input.checked_at);if(!Number.isFinite(checked)||checked>now+300000||now-checked>86400000)throw new Error('Fresh independent fixture attestation required');
 for(const tenant of [input.tenant_a,input.tenant_b])if(!tenant||typeof tenant.email!=='string'||!tenant.email.includes('@')||typeof tenant.password!=='string'||tenant.password.length<8||!uuid.test(tenant.organization_id))throw new Error('Existing authorized test identities required');
 if(input.tenant_a.organization_id===input.tenant_b.organization_id||input.tenant_a.email===input.tenant_b.email)throw new Error('Two distinct organizations/identities required');
 if(typeof input.qualified_ready_sku!=='string'||!input.qualified_ready_sku.startsWith('AG01-E2E-')||input.qualified_ready_sku.length>100)throw new Error('Qualified isolated SKU required for positive review/export');
 return input;
}
export function readBrowserFixture(path:string|undefined,base:string){
 if(!path||!isAbsolute(path))throw new Error('Credential fixture must be an absolute file outside workspace');
 const actual=realpathSync(path),rel=relative(realpathSync(resolve('.')),actual);
 if(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))throw new Error('Credential fixture cannot reside in checkout');
 return validateBrowserFixture(JSON.parse(readFileSync(actual,'utf8')),base);
}
