import type { ProductInput } from './model';
import { amazonConfig, amazonPayload } from '../marketplaces/amazon';
import { evaluateReadiness } from './readiness';
import { CatalogError } from './repository';
import { validateFeedDocument } from '../marketplaces/feed-schema';

export function buildAmazonFeed(products: ProductInput[]) {
  if (!products.length || products.length>5000) throw new CatalogError('Selecione entre 1 e 5.000 produtos.');
  const seen=new Set<string>();
  for (const product of products) {
    const sku=String(product.sku);
    if (seen.has(sku)) throw new CatalogError('SKU duplicado no feed.'); seen.add(sku);
    const report=evaluateReadiness(product,'amazon-us');
    if (!report.ready) throw new CatalogError(`Feed bloqueado para ${sku}: ${report.issues.map(issue=>issue.code).join(', ')}.`,422);
    if(product.relationship==='Child'&&!products.some(parent=>parent.sku===product.parent_sku&&parent.relationship==='Parent'))throw new CatalogError(`Inclua o pai ${String(product.parent_sku)} no feed de ${sku}. A família será reservada na mesma transação.`,422);
  }
  const sellerId=amazonConfig().sellerId; if (!sellerId) throw new CatalogError('Conta Amazon não configurada.',503);
  // Parents precede their children. UPDATE replaces attributes: this file requires version review.
  const ordered=[...products].sort((a,b)=>Number(b.relationship==='Parent')-Number(a.relationship==='Parent'));
  const feed={header:{sellerId,version:'2.0',issueLocale:'en_US'},messages:ordered.map((product,index)=>({messageId:index+1,sku:product.sku,operationType:'UPDATE',...amazonPayload(product)}))};validateFeedDocument(feed);return feed;
}
