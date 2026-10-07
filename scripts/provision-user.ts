import { getSupabase } from '../lib/marketing/supabase';
import { mkdirSync,writeFileSync } from 'node:fs';

async function main() {
  const args=process.argv.slice(2); const option=(name:string)=>args[args.indexOf(name)+1];
  const email=args.includes('--email')?option('--email').trim().toLowerCase():'';
  const role=args.includes('--role')?option('--role'):'operator';
  const organization=args.includes('--organization')?option('--organization'):'';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['operator','reviewer','admin'].includes(role) || !/^[0-9a-f-]{36}$/i.test(organization)) throw new Error('Informe --email, --role operator|reviewer|admin e --organization UUID.');
  const db=getSupabase(); if (!db) throw new Error('Supabase não configurado.');
  let user;
  for (let page=1;page<=100;page++) {
    const result=await db.auth.admin.listUsers({page,perPage:100}); if(result.error) throw new Error('Não foi possível conferir usuários.');
    user=result.data.users.find(candidate=>candidate.email?.toLowerCase()===email); if(user || result.data.users.length<100) break;
  }
  const password=args.includes('--password')?option('--password'):'';
  if (!args.includes('--apply')) { console.log(JSON.stringify({mode:'dry_run',user_exists:Boolean(user),role,organization,invite_required:!user&&!password,create_direct:!user&&Boolean(password)}));return; }
  if (!user) {
    if (password) {
      if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { organization_id: organization, prelisting_roles: [role] } });
      if (created.error || !created.data.user) throw new Error(`Não foi possível criar o usuário: ${created.error?.message || 'Erro desconhecido'}`);
      user = created.data.user;
    } else {
      if (!args.includes('--invite') || !process.env.PRELISTING_APP_URL?.startsWith('https://')) throw new Error('Novo usuário sem --password exige --invite e PRELISTING_APP_URL HTTPS para o convite por e-mail.');
      const invited=await db.auth.admin.inviteUserByEmail(email,{redirectTo:`${process.env.PRELISTING_APP_URL}/auth/complete`});
      if(invited.error || !invited.data.user) throw new Error('Não foi possível convidar o usuário.'); user=invited.data.user;
    }
  }
  const updated=await db.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,organization_id:organization,prelisting_roles:[role]}});
  if(updated.error) throw new Error('Falha ao aplicar o papel. O usuário ainda não tem o privilégio solicitado.');
  mkdirSync('artifacts',{recursive:true});
  writeFileSync(`artifacts/user-provision-${user.id}.json`,JSON.stringify({user_id:user.id,organization_id:organization,role,updated_at:new Date().toISOString()},null,2));
  console.log(JSON.stringify({provisioned:true,user_id:user.id,organization_id:organization,role}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Falha no provisionamento.');process.exitCode=1;});
