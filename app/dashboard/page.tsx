'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/listings');
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Erro ao carregar');
        setListings(d.data || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="mb-8 flex items-center gap-2 text-xl font-black text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-purple-400 to-pink-200">F</span> 
          PreListing
        </div>
        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Workspace</div>
        <Link href="/" className="block mt-1 px-3 py-2.5 text-sm text-slate-400 hover:text-white">✦ Novo pré-cadastro</Link>
        <div className="rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-white">▤ Catálogo em preparação</div>
        <div className="px-3 py-2.5 text-sm text-slate-400">✓ Checklist Amazon</div>
        
        <div className="absolute bottom-5 left-4 text-[11px] leading-5 text-slate-500">
          FBRSigns · Product Ops
        </div>
      </aside>
      <main className="main">
        <header className="mb-7 flex items-start justify-between gap-5 max-md:block">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[.14em] text-blue-600">Catálogo Interno</div>
            <h1 className="mb-1 mt-1 text-3xl font-black tracking-tight">Listings em Preparação</h1>
            <p className="m-0 max-w-3xl text-slate-500">Gerencie, edite ou crie novos itens a partir de rascunhos já salvos.</p>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 md:mt-0">
            <Link href="/" className="btn btn-primary">Criar do Zero</Link>
          </div>
        </header>
        
        <div className="card">
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          
          {loading ? (
            <div className="text-sm text-slate-500 py-10 text-center">Carregando catálogo...</div>
          ) : listings.length === 0 ? (
            <div className="text-sm text-slate-500 py-10 text-center">Nenhum listing salvo no banco de dados ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Atualizado em</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listings.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold">{item.sku}</td>
                      <td className="px-4 py-3 max-w-md truncate" title={item.title}>{item.title}</td>
                      <td className="px-4 py-3">{item.brand}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">{new Date(item.updated_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Link href={`/?sku=${item.sku}`} className="text-blue-600 hover:underline">Editar</Link>
                        <Link href={`/?sku=${item.sku}&duplicate=true`} className="text-purple-600 hover:underline">Duplicar</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
