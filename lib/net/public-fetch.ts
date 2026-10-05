import { isSafeRemoteUrl, readResponseWithLimit } from '../extract-security';
import { publicRequest } from './public-request';

export async function publicFetch(url: string, options: { maxBytes?: number; headers?: Record<string, string>; allowedHosts?: string[] } = {}) {
  const initial = new URL(url); let current = initial;
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (current.protocol !== 'https:' || !(await isSafeRemoteUrl(current.href)) || options.allowedHosts && !options.allowedHosts.includes(current.hostname)) throw new Error('Destino remoto bloqueado.');
    const response = await publicRequest(current, { signal, headers: current.origin === initial.origin ? options.headers : undefined });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location'); if (!location || redirects === 3) throw new Error('Redirecionamento inválido.');
      current = new URL(location, current); continue;
    }
    if (!response.ok) throw new Error(`A fonte respondeu HTTP ${response.status}.`);
    return { response, body: await readResponseWithLimit(response, options.maxBytes || 5_000_000, signal) };
  }
  throw new Error('Fonte não disponível.');
}
