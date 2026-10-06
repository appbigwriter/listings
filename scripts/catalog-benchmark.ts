import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {previewImport} from '../lib/catalog/import';
import {contentHash} from '../lib/catalog/model';
import {evaluateReadiness} from '../lib/catalog/readiness';
import {sourceDiff} from '../lib/catalog/source-diff';
const fixtures=JSON.parse(readFileSync('tests/fixtures/catalog-source-sample.json','utf8')) as Record<string,unknown>[];
const count=5000,rows=Array.from({length:count},(_,index)=>({...fixtures[index%fixtures.length],sku:`BENCH-${index}`,id:`fixture-${index}`}));
const started=performance.now(),initial=process.memoryUsage();
const preview=previewImport(rows,'local-benchmark');
const normalizedAt=performance.now();
if(preview.some(item=>item.error))throw new Error('Normalization failed.');
const products=preview.map(item=>item.product!);
let blocked=0;for(const product of products){contentHash(product);if(!evaluateReadiness(product).ready)blocked++;}
const validatedAt=performance.now();
const diff=sourceDiff(products,products.map(product=>({sku:String(product.sku),source:product._catalog!.source})),'local-benchmark',true);
const final=process.memoryUsage();
const result={checked_at:new Date().toISOString(),mode:'local_cpu_only_no_database_no_network',items:count,blocked_without_facts:blocked,unchanged:diff.items.filter(item=>item.status==='unchanged').length,normalization_ms:Math.round(normalizedAt-started),hash_and_readiness_ms:Math.round(validatedAt-normalizedAt),total_ms:Math.round(performance.now()-started),heap_growth_mb:Math.round((final.heapUsed-initial.heapUsed)/1048576),rss_mb:Math.round(final.rss/1048576),limitations:'Synthetic unapproved drafts; does not measure database, API, valid official schemas, feed processing, browser or production latency.'};
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/catalog-benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
