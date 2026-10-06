import assert from 'node:assert/strict';
import {browserTarget,validateBrowserFixture} from './browser-guard';
assert.equal(browserTarget('http://127.0.0.1:3100','smoke-readonly'),'http://127.0.0.1:3100');
assert.equal(browserTarget('http://127.0.0.1:33100','authenticated'),'http://127.0.0.1:33100');
for(const target of ['http://127.0.0.1:3100','https://127.0.0.1:33100','http://localhost:33100','http://127.0.0.1:33100/?unsafe=1'])assert.throws(()=>browserTarget(target,'authenticated'));
const fixture={isolated:true,authorized_test_identities:true,checked_at:new Date().toISOString(),base_url:'http://127.0.0.1:33100',supabase_project_ref:'aaaaaaaaaaaaaaaaaaaa',publication_enabled:false,external_writes_blocked:true,run_id:'00000000-0000-4000-8000-000000000010',tenant_a:{email:'fixture-a@example.invalid',password:'synthetic-unit-only',organization_id:'00000000-0000-4000-8000-000000000001'},tenant_b:{email:'fixture-b@example.invalid',password:'synthetic-unit-only',organization_id:'00000000-0000-4000-8000-000000000002'},qualified_ready_sku:'AG01-E2E-QUALIFIED'};
assert.equal(validateBrowserFixture(fixture,fixture.base_url).isolated,true);
for(const patch of [{supabase_project_ref:'yigqsjevwvqxrxvqhvtd'},{supabase_project_ref:'sssmxxigyipnqcaxpsfx'},{publication_enabled:true},{external_writes_blocked:false},{checked_at:'2000-01-01'},{authorized_test_identities:false},{tenant_b:fixture.tenant_a}])assert.throws(()=>validateBrowserFixture({...fixture,...patch},fixture.base_url));
console.log(JSON.stringify({guard:'passed',production_source_refs:'refused',auth_base3100:'refused',stale_attestation:'refused',inherited_credentials_used:false,real_identities_created:false}));
