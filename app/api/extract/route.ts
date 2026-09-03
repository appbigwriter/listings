import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
const MAX = Number(process.env.EXTRACTION_MAX_BYTES || 2000000);
const clean = (value: string | undefined | null) => (value || '').replace(/\s+/g, ' ').trim();

function platform(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('walmart')) return 'Walmart';
    if (host.includes('ebay')) return 'eBay';
    if (host.includes('tiktok')) return 'TikTok Shop';
    return host.replace(/^www\./, '');
  } catch { return 'unknown'; }
}

function isAmazonBlock(title: string, body: string, hasProductData: boolean) {
  if (hasProductData) return false;
  const marker = `${title} ${body}`.toLowerCase();
  return marker.includes('robot check') || marker.includes('captcha') || marker.includes('automated access') || marker.includes('sorry, something went wrong') || title.toLowerCase() === 'amazon.com' || title.toLowerCase() === 'amazon.com: low prices';
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Informe uma URL http(s) válida.' }, { status: 400 });
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'FBRSigns PreListing/1.0 (public-page extraction)', accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) return NextResponse.json({ error: `A fonte respondeu HTTP ${response.status}.`, platform: platform(url) }, { status: 502 });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return NextResponse.json({ error: 'A URL não retornou HTML.', platform: platform(url) }, { status: 415 });
    const html = (await response.text()).slice(0, MAX);
    const $ = cheerio.load(html);
    const pageTitle = clean($('title').text());
    const jsonld: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => { try { const parsed = JSON.parse($(el).text()); jsonld.push(...(Array.isArray(parsed) ? parsed : [parsed])); } catch { /* malformed JSON-LD */ } });
    const product = jsonld.find((x) => x?.['@type'] === 'Product' || (Array.isArray(x?.['@type']) && x['@type'].includes('Product'))) || {};
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
    const title = clean(product.name) || clean($('#productTitle').text()) || clean($('meta[property="og:title"]').attr('content')) || pageTitle;
    const description = clean(product.description) || clean($('#productDescription').text()) || clean($('meta[name="description"]').attr('content')) || clean($('meta[property="og:description"]').attr('content'));
    const image = Array.isArray(product.image) ? product.image[0] : product.image || clean($('meta[property="og:image"]').attr('content')) || clean($('#landingImage').attr('src'));
    const brand = clean(typeof product.brand === 'string' ? product.brand : product.brand?.name) || clean($('#bylineInfo').text());
    const price = clean(offers.price) || clean($('#corePriceDisplay_desktop_feature_div .a-offscreen, #priceblock_ourprice, #priceblock_dealprice').first().text());
    const bullets = $('#feature-bullets li span.a-list-item, #feature-bullets li, [data-feature-bullet]').map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 10);
    const hasProductData = Boolean(product.name || $('#productTitle').length || $('meta[property="og:title"]').length || bullets.length);
    if (platform(url) === 'Amazon' && isAmazonBlock(pageTitle, $('body').text(), hasProductData)) {
      return NextResponse.json({ error: 'A Amazon entregou uma página de bloqueio/interstitial em vez do anúncio.', hint: 'Use uma URL pública que permita acesso, cole o HTML/texto da página ou conecte a Amazon Selling Partner API.', platform: 'Amazon', blocked: true }, { status: 424 });
    }
    return NextResponse.json({ platform: platform(url), sourceUrl: url, title, description, brand, sku: clean(product.sku), price, currency: offers.priceCurrency || 'USD', image, images: [image].filter(Boolean), bullets, raw: { jsonLdCount: jsonld.length, htmlBytes: html.length, pageTitle } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao extrair a fonte.', hint: 'A página pode exigir login, JavaScript ou bloquear acessos automatizados.' }, { status: 500 });
  }
}
