'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Approval = { id: string; decision: string; approver: string; comments: string; created_at: string };

export default function MarketingSkuClient({ sku }: { sku: string }) {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<Approval[]>([]);
  const [message, setMessage] = useState('');
  const [approver, setApprover] = useState('Sergio Castro');
  const [comments, setComments] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'changes_requested'>('approved');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [profileResponse, approvalsResponse] = await Promise.all([
      fetch(`/api/marketing-profiles?sku=${encodeURIComponent(sku)}`),
      fetch(`/api/marketing-approvals?sku=${encodeURIComponent(sku)}`),
    ]);
    const profileData = await profileResponse.json();
    const approvalsData = await approvalsResponse.json();
    if (profileData.data) setData(profileData.data); else setMessage(profileData.error || 'Falha');
    if (approvalsData.data) setHistory(approvalsData.data);
  }

  useEffect(() => { load(); }, [sku]);

  async function generate(path: string, body: any = {}) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku, ...body }) });
    const d = await r.json();
    setMessage(r.ok ? 'Plano criado em rascunho' : d.error || 'Falha');
    return d;
  }

  async function submitApproval() {
    setSubmitting(true);
    try {
      const r = await fetch('/api/marketing-approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku, decision, approver, comments }) });
      const d = await r.json();
      if (!r.ok) { setMessage(`${d.error || 'Aprovação bloqueada'}${d.blockers ? ` · ${d.blockers.join(', ')}` : ''}`); return; }
      setMessage(`Decisão registrada: ${d.status}`);
      setComments('');
      await load();
    } finally { setSubmitting(false); }
  }

  if (!data) return <main className="main"><Link href="/marketing" className="text-blue-600">← Marketing</Link><div className="card mt-6">{message || 'Carregando...'}</div></main>;
  const p = data.profile || {};
  const margin = p.economics?.margin;
  const gate = data.gate;
  return <div className="app-shell"><aside className="sidebar"><div className="mb-8 text-xl font-black text-white">FBRSigns · Marketing</div><Link href="/marketing" className="block px-3 py-2.5 text-sm text-slate-400">← Todos os SKUs</Link></aside><main className="main"><Link href="/marketing" className="text-sm text-blue-600">← Marketing readiness</Link><header className="mb-6 mt-4"><div className="text-[11px] font-extrabold uppercase tracking-[.14em] text-blue-600">Produto · {sku}</div><h1 className="mt-1 text-3xl font-black">{data.listing?.title || sku}</h1><p className="text-slate-500">Status: <b>{p.status || 'draft'}</b> · Plano criado ≠ aprovado ≠ publicado</p></header><div className="grid gap-4 md:grid-cols-3"><div className="card"><h2 className="font-bold">Economia</h2><div className="mt-3 text-3xl font-black">{margin ? `${margin.percentage}%` : '—'}</div><p className="text-xs text-slate-500">{margin ? `$${margin.profit} lucro unitário · $${margin.total_cost} custos` : 'Margem real requer todos os custos'}</p></div><div className="card"><h2 className="font-bold">Launch gate</h2><div className={`mt-3 font-bold ${gate?.ready ? 'text-emerald-600' : 'text-amber-600'}`}>{gate?.ready ? 'READY' : 'BLOQUEADO'}</div><p className="text-xs text-slate-500">{gate?.blockers?.join(', ') || 'Sem bloqueios'}</p></div><div className="card"><h2 className="font-bold">Tracking</h2><div className="mt-3 font-bold">OutboundClick</div><p className="text-xs text-slate-500">Amazon Attribution: pending até elegibilidade</p></div></div><div className="card"><h2 className="mb-4 text-lg font-extrabold">Planos e handoff</h2><div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={() => generate('/api/amazon-campaigns', { costs: p.economics?.costs })}>Gerar Amazon PPC</button><button className="btn" onClick={() => generate('/api/meta-campaigns', { business_manager_id: p.audience?.business_manager_id || 'pending', ad_account_id: p.audience?.ad_account_id || 'pending', destination_url: data.listing?.payload?.amazon_url || 'https://www.amazon.com/' })}>Gerar Meta Ads</button><button className="btn" onClick={() => generate('/api/tracking-plans', { destination_url: data.listing?.payload?.amazon_url || 'https://www.amazon.com/' })}>Gerar Tracking</button><button className="btn" onClick={() => generate('/api/kanban')}>Preview Kanban</button><a className="btn" href={`/api/marketing-profiles?sku=${encodeURIComponent(sku)}&format=json`}>Exportar JSON</a><a className="btn" href={`/api/marketing-profiles?sku=${encodeURIComponent(sku)}&format=markdown`}>Exportar Markdown</a></div>{message && <p className="mt-4 text-sm text-slate-600">{message}</p>}</div><section className="card"><h2 className="mb-2 text-lg font-extrabold">Aprovação formal</h2><p className="mb-4 text-xs text-slate-500">Aprovar só fica disponível quando o Launch Gate estiver verde. Toda decisão gera histórico auditável</p><div className="field-grid"><div className="field"><label htmlFor="approver">Aprovador</label><input id="approver" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Nome do aprovador" /></div><div className="field"><label htmlFor="decision">Decisão</label><select id="decision" value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="approved">Aprovar para lançamento</option><option value="changes_requested">Solicitar ajustes</option><option value="rejected">Rejeitar</option></select></div><div className="field full"><label htmlFor="approval-comments">Comentários obrigatórios</label><textarea id="approval-comments" value={comments} onChange={e => setComments(e.target.value)} placeholder="Registre o que foi revisado, ajustes ou motivo da decisão" /></div></div><button className="btn btn-green mt-4" onClick={submitApproval} disabled={submitting || !comments.trim() || !approver.trim()}>{submitting ? 'Registrando...' : 'Registrar decisão'}</button><div className="mt-6"><h3 className="mb-2 text-sm font-bold">Histórico de decisões</h3>{history.length === 0 ? <p className="text-xs text-slate-500">Nenhuma decisão registrada</p> : <div className="space-y-2">{history.map(item => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><b>{item.decision}</b><span className="text-slate-500">{item.approver} · {new Date(item.created_at).toLocaleString('pt-BR')}</span></div><p className="mt-1 text-slate-600">{item.comments}</p></div>)}</div>}</div></section><div className="card"><h2 className="mb-3 text-lg font-extrabold">Abas do perfil</h2><div className="flex flex-wrap gap-2 text-sm"><span className="rounded bg-blue-50 px-3 py-2 text-blue-700">Produto</span><span className="rounded bg-slate-100 px-3 py-2">Economia</span><span className="rounded bg-slate-100 px-3 py-2">Amazon PPC</span><span className="rounded bg-slate-100 px-3 py-2">Meta Ads</span><span className="rounded bg-slate-100 px-3 py-2">Tracking</span><span className="rounded bg-slate-100 px-3 py-2">Launch Gate</span></div></div></main></div>;
}
