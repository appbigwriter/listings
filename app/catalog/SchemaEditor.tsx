'use client';
import { useState } from 'react';

type Schema = Record<string, any>;
function resolve(schema: Schema, root: Schema): Schema {
  if (!schema.$ref?.startsWith('#/')) return schema;
  return schema.$ref.slice(2).split('/').reduce((current: Schema, key: string) => current?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root) || schema;
}
function emptyValue(raw: Schema, root: Schema): unknown {
  const schema = resolve(raw, root);
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.type === 'object') return {};
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  return '';
}
function Field({ name, schema: raw, root, value, onChange, depth = 0 }: { name: string; schema: Schema; root: Schema; value: any; onChange: (value: any) => void; depth?: number }) {
  const schema = resolve(raw, root);
  if (depth > 8) return <p className="text-amber-700 text-xs">Estrutura complexa: edite pelo JSON completo.</p>;
  if (schema.type === 'object') return <fieldset className="rounded border p-3 grid gap-3"><legend className="text-sm font-semibold">{schema.title || name}</legend>{Object.entries(schema.properties || {}).map(([key, child]) => <Field key={key} name={key} root={root} schema={child as Schema} depth={depth + 1} value={value?.[key]} onChange={next => onChange({ ...(value || {}), [key]: next })} />)}</fieldset>;
  if (schema.type === 'array') return <fieldset className="rounded border p-3 grid gap-3"><legend className="text-sm font-semibold">{schema.title || name}</legend>{(Array.isArray(value) ? value : []).map((item, index) => <div className="grid gap-2" key={index}><Field name={`${name} ${index + 1}`} root={root} schema={schema.items || { type: 'string' }} depth={depth + 1} value={item} onChange={next => onChange(value.map((v: unknown, i: number) => i === index ? next : v))} /><button className="text-left text-xs text-red-600" onClick={() => onChange(value.filter((_: unknown, i: number) => i !== index))}>Remover valor</button></div>)}<button className="btn text-xs" disabled={schema.maxItems && (value?.length || 0) >= schema.maxItems} onClick={() => onChange([...(Array.isArray(value) ? value : []), emptyValue(schema.items || { type: 'string' }, root)])}>Adicionar valor</button></fieldset>;
  return <label className="field text-sm">{schema.title || name}{schema.description && <span className="text-xs text-slate-500">{String(schema.description).slice(0, 240)}</span>}{schema.enum ? <select className="border rounded p-2" value={value === undefined ? '' : JSON.stringify(value)} onChange={event => onChange(event.target.value ? JSON.parse(event.target.value) : '')}><option value="">Selecione</option>{schema.enum.map((item: unknown, index: number) => <option key={index} value={JSON.stringify(item)}>{String(schema.enumNames?.[index] || item)}</option>)}</select> : schema.type === 'boolean' ? <input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} /> : <input type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'} value={value ?? ''} onChange={event => onChange(schema.type === 'number' || schema.type === 'integer' ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value)} />}</label>;
}
export default function SchemaEditor({ schema, attributes, onChange }: { schema: Schema; attributes: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const [search, setSearch] = useState(''); const [all, setAll] = useState(false); const [json, setJson] = useState(''); const [error, setError] = useState('');
  const properties = schema.properties || {};
  return <div><div className="flex gap-4 mb-4"><input className="border rounded p-2 flex-1" aria-label="Buscar atributo oficial" placeholder="Buscar atributo oficial" value={search} onChange={event => setSearch(event.target.value)} /><label className="text-sm self-center"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)} /> Mostrar todos</label></div><div className="grid gap-4">{Object.entries(properties).filter(([key, raw]) => (!search || `${key} ${(raw as Schema).title || ''}`.toLowerCase().includes(search.toLowerCase())) && (all || search || key in attributes || schema.required?.includes(key))).map(([key, raw]) => <details key={key} className="rounded border p-3"><summary className="font-semibold text-sm">{(raw as Schema).title || key} {schema.required?.includes(key) && '· obrigatório'}</summary><div className="mt-3"><Field name={key} schema={raw as Schema} root={schema} value={attributes[key]} onChange={value => onChange({ ...attributes, [key]: value })} /></div><button className="text-xs text-red-600 mt-2" onClick={() => { const next = { ...attributes }; delete next[key]; onChange(next); }}>Limpar atributo</button></details>)}</div><details className="mt-4"><summary className="text-sm cursor-pointer">Editar estrutura completa em JSON</summary><button className="btn my-3" onClick={() => setJson(JSON.stringify(attributes, null, 2))}>Carregar JSON atual</button><textarea aria-label="Atributos oficiais JSON" className="w-full h-72 font-mono text-xs border rounded p-3" value={json} onChange={event => setJson(event.target.value)} /><button className="btn mt-2" onClick={() => { try { const value = JSON.parse(json); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); onChange(value); setError(''); } catch { setError('Informe um objeto JSON válido.'); } }}>Aplicar JSON ao formulário</button>{error && <p role="alert" className="text-red-600">{error}</p>}</details></div>;
}
