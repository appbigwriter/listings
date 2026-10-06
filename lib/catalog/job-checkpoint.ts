export function invalidJobCheckpoint(job:any):string|null{
 if(!['import','classify','generate','validate','media','monitor','schema'].includes(job.kind))return 'kind';
 if(!Number.isSafeInteger(job.total)||job.total<1||job.total>5000||!Number.isSafeInteger(job.cursor)||job.cursor<0||job.cursor>=job.total)return 'cursor_or_total';
 if(!Number.isSafeInteger(job.attempts)||job.attempts<0||!Array.isArray(job.results))return 'attempts_or_results';
 const entries=job.kind==='import'?job.payload?.products:job.payload?.skus;
 if(!Array.isArray(entries)||entries.length!==job.total)return 'entries';
 if(job.kind==='import'?entries.some(entry=>!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.sku!=='string'||!entry.sku.trim()):entries.some(entry=>typeof entry!=='string'||!entry.trim()))return 'entry_identity';
 return null;
}
