import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { isSafeRemoteUrl } from '../extract-security';
import type { MediaCheck } from './model';
import { publicRequest } from '../net/public-request';

export async function checkImage(url: string): Promise<MediaCheck> {
  if (new URL(url).protocol !== 'https:' || !(await isSafeRemoteUrl(url))) throw new Error('Imagem bloqueada: use uma URL pública HTTPS.');
  const response = await publicRequest(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('URL não retornou uma imagem válida.');
  if (Number(response.headers.get('content-length')) > 10_000_000) throw new Error('Imagem acima de 10 MB.');
  const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10_000_000) { await reader.cancel(); throw new Error('Imagem acima de 10 MB.'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks); const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
  if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'tiff', 'gif'].includes(metadata.format || '')) throw new Error('Formato de imagem não suportado.');
  return { url, checked_at: new Date().toISOString(), width: metadata.width, height: metadata.height, format: metadata.format!, sha256: createHash('sha256').update(bytes).digest('hex') };
}
