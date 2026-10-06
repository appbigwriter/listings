import {COPY_FIELDS,type Channel,type ChannelListing} from './model';
import {CatalogError} from './repository';
export function validateChannelCopy(value:unknown,channel:Channel):NonNullable<ChannelListing['copy']> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new CatalogError('Conteúdo do canal precisa ser um objeto.');
 const input=value as Record<string,unknown>;
 if(input.locale!=='en_US'||Object.keys(input).some(key=>!['locale',...COPY_FIELDS].includes(key)))throw new CatalogError('Conteúdo aceita somente locale en_US e os quatro campos de texto.');
 const limits={title:channel==='ebay-us'?80:200,bullets:10000,description:20000,keywords:2500};
 const copy:any={locale:'en_US',source:'human'};
 for(const field of COPY_FIELDS) {
  if(typeof input[field]!=='string'||[...(input[field] as string)].length>limits[field]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[field] as string))throw new CatalogError(`Texto inválido ou acima do limite: ${field}.`);
  copy[field]=(input[field] as string).trim();
 }
 if(!copy.title)throw new CatalogError('Título do canal obrigatório.');
 return copy;
}
