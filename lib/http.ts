export class RequestBodyError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function readJsonBody(request: Request, limit = 6_000_000): Promise<Record<string, any>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RequestBodyError('Use application/json.',415);
  if (!request.body) throw new RequestBodyError('Corpo obrigatório.');
  const reader = request.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new RequestBodyError('Requisição acima do limite.',413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestBodyError('JSON inválido.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('Informe um objeto JSON.');
  return body;
}
