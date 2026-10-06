'use client';
import {useEffect,useRef,useState} from 'react';
export default function CompleteAuth() {
  const [session,setSession]=useState<{access_token:string;refresh_token:string}|null>(null); const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const pending=useRef(false),messageRef=useRef<HTMLParagraphElement>(null),[checked,setChecked]=useState(false);
  useEffect(()=>{if(message)messageRef.current?.focus();},[message]);
  useEffect(()=>{
    const fragment=new URLSearchParams(window.location.hash.slice(1));
    const access_token=fragment.get('access_token'),refresh_token=fragment.get('refresh_token');
    window.history.replaceState(null,'','/auth/complete');
    if(access_token && refresh_token) setSession({access_token,refresh_token}); else setMessage('Link inválido ou expirado. Solicite um novo convite ou recuperação.');
    setChecked(true);
  },[]);
  return <main className="mx-auto max-w-md p-8 mt-16"><h1 className="text-2xl font-bold">Definir senha</h1><p className="mt-3 text-slate-500">Conclua seu convite ou recuperação de acesso.</p><form className="card mt-5 grid gap-4" aria-busy={busy||!checked} onSubmit={async event=>{event.preventDefault();if(!session||pending.current)return;pending.current=true;setBusy(true);setMessage('');try{const response=await fetch('/api/auth/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...session,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha ao definir senha.');setSession(null);window.location.href='/login';}catch(error){setMessage(error instanceof Error?error.message:'Falha ao definir senha.');}finally{pending.current=false;setBusy(false);}}}><label className="field" htmlFor="new-password">Nova senha<input id="new-password" aria-describedby="password-help" disabled={!session||busy} type="password" minLength={12} maxLength={1024} autoComplete="new-password" required value={password} onChange={event=>setPassword(event.target.value)} /></label><p id="password-help" className="text-sm text-slate-500">Use pelo menos 12 caracteres. Após salvar, entre com sua nova senha.</p>{message&&<p ref={messageRef} tabIndex={-1} role="alert">{message}</p>}<p role="status" aria-live="polite">{!checked?'Verificando o link…':busy?'Salvando sua senha…':''}</p><button type="submit" className="btn btn-primary" disabled={!session||busy}>{busy?'Salvando…':'Salvar senha'}</button></form></main>;
}
