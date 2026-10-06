import {CatalogError} from './repository';
export function retryEntries(job:any,scope:unknown){
 if(!['completed','cancelled','failed'].includes(job.status))throw new CatalogError('Espere o lote terminar ou cancele antes de preparar a retomada.',409);
 if(scope!=='failed'&&scope!=='unfinished')throw new CatalogError('Selecione itens com falha ou ainda não processados.');
 const entries=job.kind==='import'?job.payload?.products:job.payload?.skus;
 if(!Array.isArray(entries)||entries.length!==job.total||entries.length>5000||!Number.isSafeInteger(job.cursor)||job.cursor<0||job.cursor>job.total)throw new CatalogError('Checkpoint do lote inválido. Investigue antes de retomar.',409);
 const latest=new Map<number,string>();
 for(const result of job.results||[])if(Number.isInteger(result.index)&&result.index>=0&&result.index<entries.length)latest.set(result.index,result.status);
 const indices=entries.map((_,index)=>index).filter(index=>scope==='failed'?latest.get(index)==='failed':index>=job.cursor);
 if(!indices.length)throw new CatalogError('Não há itens deste tipo para retomar.',409);
 return {indices,entries:indices.map(index=>entries[index])};
}
