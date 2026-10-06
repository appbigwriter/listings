import {contentHash,type Channel} from './model';
import {evaluateReadiness} from './readiness';
import {productFromRow} from './repository';
import {CAPABILITIES} from '../marketplaces/capabilities';
export function coverageItem(row:Record<string,any>,channel:Channel,uncertain:boolean,now=Date.now()){
 const product=productFromRow(row),listing=product._catalog?.channels[channel],report=evaluateReadiness(product,channel),preflight=evaluateReadiness(product,channel,false);
 const preparation=row.status==='archived'?'archived':product._catalog?.kind==='service'?(product._catalog.eligibility_confirmed?'excluded_service':'service_exclusion_pending'):product.source_update?'source_conflict':report.ready?'approved':preflight.ready?'review_pending':'blocked';
 const submission=listing?.submission,verifiedAt=Date.parse(submission?.verified_at||''),verified=Boolean(row.status!=='archived'&&!uncertain&&!['unknown','submitting'].includes(submission?.status||'')&&submission?.verified_content_hash===contentHash(product,channel)&&Number.isFinite(verifiedAt)&&verifiedAt<=now+300000&&now-verifiedAt<=86400000);
 let external='not_submitted';
 if(uncertain||submission?.status==='unknown'||submission?.status==='submitting')external='uncertain';
 else if(submission){
  if(submission.status==='rejected')external='rejected';
  else if(verified&&product.relationship==='Parent')external='parent_content_verified';
  else if(verified&&submission.status==='published'&&submission.publication_status==='buyable')external='verified_buyable';
  else if(verified&&channel==='ebay-us'&&submission.status==='published'&&submission.publication_status==='published_verified')external='verified_published';
  else if(submission.status==='published')external='published_requires_reconciliation';
  else if(['accepted','processing'].includes(submission.status))external=submission.status;
  else external='unrecognized_requires_reconciliation';
 }
 const issues=report.issues.slice(0,50).map(issue=>({code:issue.code,field:issue.field,severity:issue.severity,action:issue.action}));
 const next_action=external==='uncertain'?'investigate_submission_before_retry':preparation==='archived'?'retain_history':preparation==='excluded_service'?'retain_exclusion':preparation==='service_exclusion_pending'?'confirm_exclusion':preparation==='source_conflict'?'reconcile_source':preparation==='blocked'?'resolve_preparation_issues':preparation==='review_pending'?'review_current_version':external==='rejected'?'investigate_rejection':['verified_buyable','verified_published','parent_content_verified'].includes(external)?'monitor_current_version':external==='not_submitted'?'await_authorized_pilot':'reconcile_external_version';
 return {sku:String(row.sku),title:String(row.title||''),owner_id:row.owner_id,updated_at:row.updated_at,channel,kind:product._catalog?.kind,relationship:String(product.relationship||''),source_id:product._catalog?.source?.id||null,source_hash:product._catalog?.source?.hash||null,preparation,external,external_version_verified:verified,verified_at:submission?.verified_at||null,issues_total:report.issues.length,issues,issues_truncated:report.issues.length>issues.length,next_action,connector_status:CAPABILITIES[channel].status};
}
