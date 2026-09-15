export const SUBMISSION_STATUSES=['not_submitted','submitted','processing','accepted','rejected'] as const;
export type SubmissionStatus=typeof SUBMISSION_STATUSES[number];
export function buildSubmissionRecord(input:{sku?:string;status?:string;protocol?:string;reason?:string;file_name?:string}) {
 const sku=String(input.sku||'').trim(); const status=input.status as SubmissionStatus;
 if(!sku) throw new Error('sku_required'); if(!SUBMISSION_STATUSES.includes(status)) throw new Error('status_invalid');
 if(status==='rejected'&&!String(input.reason||'').trim()) throw new Error('reason_required');
 return {sku,status,protocol:String(input.protocol||'').trim()||null,reason:String(input.reason||'').trim()||null,file_name:String(input.file_name||'').trim()||null,updated_at:new Date().toISOString(),publication_status:'not_published'};
}
