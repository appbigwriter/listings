import { NextRequest, NextResponse } from 'next/server';
const publicApi=['/api/generate','/api/generate-field','/api/extract'];
export function middleware(req:NextRequest){
 if(!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
 if(publicApi.some(path=>req.nextUrl.pathname===path)) return NextResponse.next();
 if(!req.headers.get('x-user-id')?.trim()) return NextResponse.json({error:'Autenticação obrigatória. Use uma sessão válida.',code:'AUTH_REQUIRED'},{status:401});
 return NextResponse.next();
}
export const config={matcher:'/api/:path*'};
