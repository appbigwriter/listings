import type { ProductInput } from './model';

/** A workflow hint only. Never use this value as an Amazon category or product type. */
export function internalFamilySuggestion(product: ProductInput): string | null {
  const text = `${product.title || ''} ${product.description || ''}`.toLowerCase();
  if (/\b(light\s*box|led\s*box|backlit|illuminated\s*(sign|display))\b/.test(text)) return 'Displays e placas iluminadas';
  if (/\b(channel\s*letters?|dimensional\s*letters?)\b/.test(text)) return 'Letras e sinalização dimensional';
  if (/\b(neon\s*sign|neon\s*light)\b/.test(text)) return 'Sinalização neon';
  if (/\b(banner|vinyl\s*banner)\b/.test(text)) return 'Banners';
  if (/\b(yard\s*sign|lawn\s*sign)\b/.test(text)) return 'Placas externas';
  if (/\b(acrylic\s*sign|acrylic\s*plaque)\b/.test(text)) return 'Placas de acrílico';
  if (/\b(sign|plaque|display)\b/.test(text)) return 'Sinalização geral';
  return null;
}
