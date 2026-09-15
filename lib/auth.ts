import { NextRequest } from 'next/server';
export type AuthContext={userId:string;organizationId:string};
/** Fail-closed request identity. Production must provide a verified Supabase/JWT gateway identity. */
export function getAuthContext(req:NextRequest):AuthContext|null {
 const userId=req.headers.get('x-user-id')?.trim();
 if(!userId) return null;
 const organizationId=req.headers.get('x-organization-id')?.trim()||userId;
 return {userId,organizationId};
}
export function unauthorized(){return {error:'Autenticação obrigatória. Use uma sessão válida.',code:'AUTH_REQUIRED'};}
