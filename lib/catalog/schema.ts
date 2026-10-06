import Ajv2019, { type AnySchemaObject } from 'ajv/dist/2019';
import addFormats from 'ajv-formats';
import type { Issue } from './model';
import { stableStringify } from './model';

export function validateSchema(schema: Record<string, unknown>, attributes: Record<string, unknown>): Issue[] {
  const ajv = new Ajv2019({ allErrors: true, strict: false, strictSchema: true, validateSchema: false, ownProperties: true });
  addFormats(ajv);
  ajv.addFormat('ebay-int32',{type:'string',validate:(value:string)=>/^[+-]?\d+$/.test(value)&&Number.isInteger(Number(value))&&Number(value)>=-2147483648&&Number(value)<=2147483647});
  ajv.addFormat('ebay-double',{type:'string',validate:(value:string)=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value))});
  ajv.addFormat('ebay-unsupported',{type:'string',validate:()=>false});
  for(const format of ['YYYY','YYYYMM','YYYYMMDD'])ajv.addFormat(`ebay-date-${format}`,{type:'string',validate:(value:string)=>{
    if(!new RegExp(`^\\d{${format.length}}$`).test(value))return false;
    const iso=value.slice(0,4)+'-'+(format.length>=6?value.slice(4,6):'01')+'-'+(format.length===8?value.slice(6,8):'01');
    const parsed=Date.parse(iso);return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===iso;
  }});
  for (const keyword of ['editable', 'enumNames', 'hidden', '$lifecycle', 'replacedBy', 'replaces', 'enumDeprecated']) ajv.addKeyword(keyword);
  for (const keyword of ['minUtf8ByteLength', 'maxUtf8ByteLength']) ajv.addKeyword({ keyword, type: 'string', schemaType: 'number', validate: (limit: number, data: string) => keyword.startsWith('min') ? Buffer.byteLength(data, 'utf8') >= limit : Buffer.byteLength(data, 'utf8') <= limit });
  for (const keyword of ['minUniqueItems', 'maxUniqueItems']) ajv.addKeyword({ keyword, type: 'array', schemaType: 'number', validate: (limit: number, data: unknown[], parent?: AnySchemaObject) => {
    const selectors: string[] | undefined = parent?.selectors;
    const count = new Set(data.map(item => stableStringify(selectors?.length && item && typeof item === 'object' ? Object.fromEntries(selectors.map(key => [key, (item as Record<string, unknown>)[key]])) : item))).size;
    return keyword.startsWith('min') ? count >= limit : count <= limit;
  } });
  ajv.addKeyword({ keyword: 'selectors', type: 'array', schemaType: 'array', validate: (selectors: string[], data: Record<string, unknown>[], parent?: AnySchemaObject) => !parent?.uniqueItems || new Set(data.map(item => stableStringify(Object.fromEntries(selectors.map(key => [key, item[key]]))))).size === data.length });
  try {
    // Amazon's meta-schema URI is an identifier, not a remotely fetchable document.
    const { $schema, ...localSchema } = schema;
    const validate = ajv.compile(localSchema);
    if (validate(attributes)) return [];
    return (validate.errors || []).map(error => ({ code: `schema_${error.keyword}`, field: error.instancePath || String(error.params.missingProperty || 'attributes'), message: `${error.instancePath || '/'} ${error.message}`, severity: 'error', action: 'Complete ou corrija o atributo conforme o requisito oficial.' }));
  } catch {
    return [{ code: 'schema_unsupported', field: 'attributes', message: 'O schema não pôde ser validado integralmente.', severity: 'error', action: 'Atualize o schema e confira a compatibilidade do validador.' }];
  }
}
