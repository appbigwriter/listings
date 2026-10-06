import {CatalogError} from '../catalog/repository';

// Explicit operator switch: this does not detect database restores automatically.
export function recoveryMode() {
 const value=process.env.PRELISTING_RECOVERY_MODE?.trim().toLowerCase();
 return Boolean(value&&value!=='false');
}
export function assertRecoveryReleased() {
 if(recoveryMode())throw new CatalogError('Modo de recuperação ativo: reconcilie os envios anteriores antes de liberar novos envios e processamento.',503);
}
export function assertAmazonRecoveryRequest(path:string,query:Record<string,string>,method:string) {
 if(!recoveryMode()||method==='GET')return;
 const preview=method==='PUT'&&/^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/.test(path)&&query.mode==='VALIDATION_PREVIEW';
 const fees=method==='POST'&&/^\/products\/fees\/v0\/(items|listings)\/[^/]+\/feesEstimate$/.test(path);
 if(!preview&&!fees)assertRecoveryReleased();
}
