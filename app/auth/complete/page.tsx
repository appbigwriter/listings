'use client';
import { useEffect,useState } from 'react';
export default function CompleteAuth() {
  const [session,setSession]=useState<{access_token:string;refresh_token:string}|null>(null); const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const fragment=new URLSearchParams(window.location.hash.slice(1));
    const access_token=fragment.get('access_token'),refresh_token=fragment.get('refresh_token');
    window.history.replaceState(null,'','/auth/complete');
    if(access_token && refresh_token) setSession({access_token,refresh_token}); else setMessage('Link inválido ou expirado. Solicite um novo convite ou recuperação.');
  },[]);
  return <main className="mx-auto max-w-md p-8 mt-16"><h1 className="text-2xl font-bold">Definir senha</h1><p className="mt-3 text-slate-500">Conclua seu convite ou recuperação de acesso.</p><form className="card mt-5 grid gap-4" onSubmit={async event=>{event.preventDefault();setBusy(true);try{const response=await fetch('/api/auth/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...session,password})});const data=await response.json();if(!response.ok)throw new Error(data.error);setSession(null);window.location.href='/login';}catch(error){setMessage(error instanceof Error?error.message:'Falha ao definir senha.');}finally{setBusy(false);}}}><label className="field">Nova senha<input type="password" minLength={12} maxLength={1024} autoComplete="new-password" required value={password} onChange={event=>setPassword(event.target.value)} /></label><p role="status">{message}</p><button className="btn btn-primary" disabled={!session||busy}>Definir senha e entrar</button></form></main>;
}
