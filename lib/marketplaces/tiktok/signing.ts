import {createHmac} from 'node:crypto';
import {assertApiPath,TiktokPreparationError} from './contracts';
/** Official OpenAPI signing sample; body is exact transmitted bytes, never reserialized. */
export function signTiktokRequest(path:string,parameters:Record<string,string>,secret:string,body='',contentType='application/json'){
 assertApiPath(path);
 if(typeof secret!=='string'||!secret.trim()||typeof body!=='string'||!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.entries(parameters).some(([key,value])=>!/^[a-zA-Z0-9_]+$/.test(key)||typeof value!=='string'))throw new TiktokPreparationError('TIKTOK_SIGNING_INPUT_INVALID');
 const keys=Object.keys(parameters).filter(key=>key!=='sign'&&key!=='access_token').sort();
 const content=path+keys.map(key=>key+parameters[key]).join('')+(contentType.split(';')[0].trim().toLowerCase()==='multipart/form-data'?'':body);
 return createHmac('sha256',secret).update(secret+content+secret,'utf8').digest('hex');
}
export function assertTiktokTimestamp(value:number,nowSeconds=Math.floor(Date.now()/1000)){
 if(!Number.isSafeInteger(value)||!/^\d{10}$/.test(String(value))||value<nowSeconds-300||value>nowSeconds+30)throw new TiktokPreparationError('TIKTOK_TIMESTAMP_INVALID');
}
