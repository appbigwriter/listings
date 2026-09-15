import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { isSafeRemoteUrl, isSafeRemoteUrlSync, readResponseWithLimit } from '../../../lib/extract-security';
import { getAuthContext, unauthorized } from '../../../lib/auth';

export const runtime = 'nodejs';
const MAX = Number(process.env.EXTRACTION_MAX_BYTES || 2_000_000);
const TIMEOUT_MS = Number(process.env.EXTRACTION_TIMEOUT_MS || 10_000);
const clean = (value: string | undefined | null) => (value || '').replace(/\s+/g, ' ').trim();


function platform(url: string) { try { const host = new URL(url).hostname; if (host.includes('amazon')) return 'Amazon'; if (host.includes('walmart')) return 'Walmart'; if (host.includes('ebay')) return 'eBay'; if (host.includes('tiktok')) return 'TikTok Shop'; return host.replace(/^www\./, ''); } catch { return 'unknown'; } }
function isAmazonBlock(title: string, body: string, hasProductData: boolean) { if (hasProductData) return false; const marker = `${title} ${body}`.toLowerCase(); return marker.includes('robot check') || marker.includes('captcha') || marker.includes('automated access') || marker.includes('sorry, something went wrong') || title.toLowerCase() === 'amazon.com' || title.toLowerCase() === 'amazon.com: low prices'; }

export async function POST(req: NextRequest) {
  if (!getAuthContext(req)) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    const { url: initialUrl } = await req.json();
    if (!initialUrl || !isSafeRemoteUrlSync(initialUrl) || !(await isSafeRemoteUrl(initialUrl))) return NextResponse.json({ error: 'URL bloqueada: somente destinos públicos http(s) são permitidos.' }, { status: 400 });
    let url = initialUrl; let response: Response | undefined; let bodySignal: AbortSignal | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!(await isSafeRemoteUrl(url))) return NextResponse.json({ error: 'Redirecionamento para rede privada ou metadata bloqueado.' }, { status: 400 });
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      bodySignal = signal;
      response = await fetch(url, { redirect: 'manual', signal, headers: { 'user-agent': 'FBRSigns PreListing/1.0', accept: 'text/html,application/xhtml+xml' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location'); if (!location) break; url = new URL(location, url).toString();
      if (redirects === 3) return NextResponse.json({ error: 'A fonte excedeu o limite de redirecionamentos.' }, { status: 502 });
    }
    if (!response) throw new Error('Sem resposta.');
    if (!response.ok) return NextResponse.json({ error: `A fonte respondeu HTTP ${response.status}.`, platform: platform(url) }, { status: 502 });
    const type = response.headers.get('content-type') || ''; if (!type.includes('text/html')) return NextResponse.json({ error: 'A URL não retornou HTML.', platform: platform(url) }, { status: 415 });
    const html = await readResponseWithLimit(response, MAX, bodySignal); const $ = cheerio.load(html); const pageTitle = clean($('title').text()); const jsonld: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => { try { const parsed = JSON.parse($(el).text()); jsonld.push(...(Array.isArray(parsed) ? parsed : [parsed])); } catch {} });
    const product = jsonld.find((x) => x?.['@type'] === 'Product' || (Array.isArray(x?.['@type']) && x['@type'].includes('Product'))) || {}; const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
    const title = clean(product.name) || clean($('#productTitle').text()) || clean($('meta[property="og:title"]').attr('content')) || pageTitle; const description = clean(product.description) || clean($('#productDescription').text()) || clean($('meta[name="description"]').attr('content')); const image = Array.isArray(product.image) ? product.image[0] : product.image || clean($('meta[property="og:image"]').attr('content')) || clean($('#landingImage').attr('src')); const brand = clean(typeof product.brand === 'string' ? product.brand : product.brand?.name) || clean($('#bylineInfo').text()); const price = clean(offers.price) || clean($('#corePriceDisplay_desktop_feature_div .a-offscreen, #priceblock_ourprice, #priceblock_dealprice').first().text()); const bullets = $('#feature-bullets li span.a-list-item, #feature-bullets li, [data-feature-bullet]').map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 10); const hasProductData = Boolean(product.name || $('#productTitle').length || $('meta[property="og:title"]').length || bullets.length);
    if (platform(url) === 'Amazon' && isAmazonBlock(pageTitle, $('body').text(), hasProductData)) return NextResponse.json({ error: 'A Amazon entregou uma página de bloqueio/interstitial.', platform: 'Amazon', blocked: true }, { status: 424 });
    return NextResponse.json({ platform: platform(url), sourceUrl: url, title, description, brand, sku: clean(product.sku), price, currency: offers.priceCurrency || 'USD', image, images: [image].filter(Boolean), bullets, provenance: { source_url: url, fetched_at: new Date().toISOString(), review_required: true }, raw: { jsonLdCount: jsonld.length, htmlBytes: html.length, pageTitle } });
  } catch (error) { const message = error instanceof Error && error.name === 'AbortError' ? 'A fonte excedeu o timeout.' : error instanceof Error ? error.message : 'Falha ao extrair a fonte.'; return NextResponse.json({ error: message, hint: 'Use uma fonte pública; dados extraídos exigem revisão humana.' }, { status: 502 }); }
}
