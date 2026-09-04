import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{const body=await req.json();if(!body?.sku||!body?.title)return NextResponse.json({error:'SKU e título são obrigatórios.'},{status:400});const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:'Supabase não configurado. Preencha o .env.local a partir do .env.template.'},{status:503});const supabase=createClient(url,key);const {data,error}=await supabase.from('prelistings').upsert({sku:body.sku,title:body.title,brand:body.brand||'FBRSigns',payload:body,source_url:body.source_url||null,source_platform:body.source_platform||null,source_snapshot:body.source_snapshot||null,status:'draft',updated_at:new Date().toISOString()},{onConflict:'sku'}).select('id,sku,updated_at').single();if(error)throw error;return NextResponse.json({data})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao salvar no Supabase.'},{status:500})}}

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
    }
    
    // Optional: get a specific SKU if passed via query params, else list all
    const searchParams = req.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    const supabase = createClient(url, key);
    
    if (sku) {
      const { data, error } = await supabase.from('prelistings').select('*').eq('sku', sku).single();
      if (error) throw error;
      return NextResponse.json({ data });
    } else {
      const { data, error } = await supabase.from('prelistings').select('*').order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      return NextResponse.json({ data });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao buscar dados no Supabase.' },
      { status: 500 }
    );
  }
}
