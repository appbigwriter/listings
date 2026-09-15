import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4Private(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] === 169 && p[1] === 254 ||
    p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 192 && p[1] === 168 ||
    p[0] === 100 && p[1] >= 64 && p[1] <= 127;
}

function ipv6Bytes(value: string): number[] | null {
  const ip = value.toLowerCase().split('%')[0];
  if (isIP(ip) !== 6) return null;
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const words = [...left, ...right];
  const expanded = halves.length === 2 ? [...left, ...Array(8 - words.length).fill('0'), ...right] : words;
  if (expanded.length !== 8 || expanded.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return expanded.flatMap((word) => { const n = parseInt(word, 16); return [n >> 8, n & 0xff]; });
}

function mappedIpv4(ip: string) {
  const bytes = ipv6Bytes(ip);
  if (!bytes || bytes.slice(0, 10).some((byte) => byte !== 0) || bytes[10] !== 255 || bytes[11] !== 255) return null;
  return bytes.slice(12).join('.');
}

export function isPrivateIp(ip: string) {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = mappedIpv4(normalized);
  if (mapped) return ipv4Private(mapped);
  if (isIP(normalized) === 4) return ipv4Private(normalized);
  const bytes = ipv6Bytes(normalized);
  if (!bytes) return false;
  if (bytes.every((byte) => byte === 0) || (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1)) return true;
  return (bytes[0] & 0xfe) === 0xfc || (bytes[0] & 0xfe) === 0xfe || bytes[0] === 0xff;
}

export function isSafeRemoteUrlSync(value: string) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return !isPrivateIp(host) && host !== 'localhost' && !host.endsWith('.local') && !host.endsWith('.localhost');
  } catch { return false; }
}

export async function isSafeRemoteUrl(value: string) {
  try {
    if (!isSafeRemoteUrlSync(value)) return false;
    const host = new URL(value).hostname.replace(/^\[|\]$/g, '');
    if (isIP(host)) return !isPrivateIp(host);
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address));
  } catch { return false; }
}

export async function readResponseWithLimit(response: Response, limit: number, signal?: AbortSignal) {
  if (!response.body) throw new Error('Resposta sem corpo.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  const abort = () => { void reader.cancel(signal?.reason); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) { const { done, value } = await reader.read(); signal?.throwIfAborted(); if (done) break; total += value.byteLength; if (total > limit) throw new Error('A resposta excede o limite de bytes.'); chunks.push(value); }
  } finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
  const all = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}
