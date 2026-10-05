export async function api(path: string, body?: unknown) {
  const request=() => fetch(path, { credentials: 'include', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  let response = await request();
  if(response.status===401 && path!=='/api/auth/session') {
    const refreshed=await fetch('/api/auth/session',{credentials:'include'});
    if(refreshed.ok)response=await request();
  }
  const data = await response.json();
  if (response.status === 401) { window.location.href = '/login'; throw new Error('Entre para acessar o catálogo.'); }
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
export function download(value: unknown, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
