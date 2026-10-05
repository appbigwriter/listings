import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readJsonBody,RequestBodyError } from '../../../../lib/http';
export async function POST(req:NextRequest) {
  try {
    const body=await readJsonBody(req,12000);
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>1024||typeof body.access_token!=='string'||typeof body.refresh_token!=='string') throw new RequestBodyError('Senha ou link inválido.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)return NextResponse.json({error:'Autenticação não configurada.'},{status:503});
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const session=await client.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
    if(session.error || !session.data.user)return NextResponse.json({error:'Link inválido ou expirado.'},{status:401});
    const updated=await client.auth.updateUser({password:body.password});
    if(updated.error)return NextResponse.json({error:'Não foi possível definir a senha. Confira a política de senhas.'},{status:400});
    await client.auth.signOut({scope:'local'});
    return NextResponse.json({updated:true});
  } catch(error) {return NextResponse.json({error:error instanceof RequestBodyError?error.message:'Falha ao concluir acesso.'},{status:error instanceof RequestBodyError?error.status:503});}
}
