import { validateFeedReport } from '../marketplaces/feed-schema';
export type FeedManifestItem={sku:string;hash:string;updated_at:string;message_id:number};
type FeedIssue={messageId?:number;sku?:string;severity:string;message:string;code?:string};
export function interpretFeedReport(value:unknown,manifest:FeedManifestItem[],sellerId:string,feedId:string) {
  validateFeedReport(value);
  const report=value as {header:{sellerId:string;feedId:string};summary:{messagesProcessed:number;messagesAccepted:number;messagesInvalid:number};issues:FeedIssue[]};
  if(report.header.sellerId!==sellerId || report.header.feedId!==feedId)throw new Error('Relatório pertence a outra conta/feed.');
  const byId=new Map(manifest.map(item=>[item.message_id,item]));
  for(const issue of report.issues) {
    if(issue.messageId!==undefined && !byId.has(issue.messageId))throw new Error('Relatório contém messageId desconhecido.');
    if(issue.sku && issue.messageId && byId.get(issue.messageId)?.sku!==issue.sku)throw new Error('SKU divergente do messageId no relatório.');
    if(issue.sku && !manifest.some(item=>item.sku===issue.sku))throw new Error('Relatório contém SKU desconhecido.');
  }
  const globalError=report.issues.some(issue=>issue.severity==='ERROR' && issue.messageId===undefined && !issue.sku);
  const rejected=manifest.filter(item=>report.issues.some(issue=>issue.severity==='ERROR' && (issue.messageId===item.message_id || issue.sku===item.sku)));
  const complete=!globalError && report.summary.messagesProcessed===manifest.length && report.summary.messagesAccepted+report.summary.messagesInvalid===manifest.length && rejected.length===report.summary.messagesInvalid;
  return manifest.map(item=>({sku:item.sku,hash:item.hash,message_id:item.message_id,status:rejected.some(row=>row.sku===item.sku)?'rejected':complete?'accepted':'unknown',issues:report.issues.filter(issue=>issue.messageId===item.message_id || issue.sku===item.sku || issue.messageId===undefined && !issue.sku)}));
}
