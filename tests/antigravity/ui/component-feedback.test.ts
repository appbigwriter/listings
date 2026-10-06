import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement,ReactNode} from 'react';
const hooks=vi.hoisted(()=>({cells:[] as unknown[],cursor:0,effects:[] as (()=>void)[],cleanups:[] as (()=>void)[]}));
vi.mock('react',async importOriginal=>({...(await importOriginal<typeof import('react')>()),
 useState:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return [hooks.cells[index],(next:unknown)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
 useRef:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
 useId:()=>`fixture-${hooks.cursor++}`,
 useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const index=hooks.cursor++,prior=hooks.cells[index] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!prior||deps.some((value,i)=>value!==prior.deps[i])){prior?.cleanup?.();const record={deps,cleanup:undefined as undefined|(()=>void)};hooks.cells[index]=record;hooks.effects.push(()=>{const cleanup=effect();if(cleanup){record.cleanup=cleanup;hooks.cleanups.push(cleanup);}});}},
}));
import Economics from '../../../app/marketing/MarketingEconomicsEditor';
import Marketing from '../../../app/marketing/page';
import Login from '../../../app/login/page';
import Complete from '../../../app/auth/complete/page';
import Assets from '../../../app/catalog/AssetPanel';
import {REQUIRED_COST_FIELDS} from '../../../lib/marketing/margin';
type Element=ReactElement<Record<string,any>>;
function nodes(node:ReactNode):Element[]{if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object'||!('props'in node))return [];const value=node as Element;return [value,...nodes(value.props.children)];}
function text(node:ReactNode):string{if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object'&&'props'in node)return text((node as Element).props.children);return node==null?'':String(node);}
function render(component:()=>ReactNode){hooks.cursor=0;return component();}
function flush(){for(const effect of hooks.effects.splice(0))effect();}
function find(tree:ReactNode,type:string,label?:string){const found=nodes(tree).find(node=>node.type===type&&(!label||text(node).includes(label)));if(!found)throw new Error(`Missing ${type} ${label}`);return found;}
const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,0));};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];vi.stubGlobal('fetch',vi.fn());});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});
describe('isolated component handlers and feedback (not browser E2E)',()=>{
 it('distinguishes missing/null costs from explicit zero and refuses blanks as zero',()=>{
  const props={sku:'FIXTURE',costs:{product_cost:null,printing_cost:0,calculated_at:null},profileVersion:null,onSaved:vi.fn(),onDirty:vi.fn()};
  render(()=>Economics(props));flush();const tree=render(()=>Economics(props));
  const inputs=nodes(tree).filter(node=>node.type==='input');expect(inputs[0].props.value).toBe('');expect(inputs[1].props.value).toBe('0');
  expect(inputs.find(input=>input.props.type==='datetime-local')!.props.value).toBe('');
  expect(find(tree,'button').props.disabled).toBe(true);expect(text(tree)).toContain('sete custos');
 });
 it('sends explicit zero unchanged, serializes saves, and explains 409 without discarding edits',async()=>{
  const costs={...Object.fromEntries(REQUIRED_COST_FIELDS.map(field=>[field,0])),source:'fixture technical sheet',calculated_at:new Date().toISOString()};
  const props={sku:'FIXTURE',costs,profileVersion:'VERSION',onSaved:vi.fn(),onDirty:vi.fn()};
  let finish!:(value:Response)=>void;vi.mocked(fetch).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  render(()=>Economics(props));flush();const tree=render(()=>Economics(props)),save=find(tree,'button').props.onClick;
  const first=save(),second=save();expect(fetch).toHaveBeenCalledTimes(1);const body=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(body.costs.product_cost).toBe(0);expect(body.expected_profile_version).toBe('VERSION');
  finish(Response.json({error:'Version conflict'},{status:409}));await Promise.all([first,second]);const after=render(()=>Economics(props));
  expect(text(find(after,'p','Recarregue'))).toContain('confira os custos');expect(nodes(after).filter(node=>node.type==='input')[0].props.value).toBe('0');expect(props.onSaved).not.toHaveBeenCalled();
 });
 it('shows load failure separately from empty profiles and retries the same page',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:'Access denied'},{status:403})).mockResolvedValueOnce(Response.json({data:[],total:0,limit:20}));
  render(Marketing);flush();await settle();let tree=render(Marketing);expect(text(tree)).toContain('Access denied');expect(text(tree)).not.toContain('Nenhum perfil');
  find(tree,'button','Tentar').props.onClick();render(Marketing);flush();await settle();tree=render(Marketing);expect(text(tree)).toContain('Nenhum perfil');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('paginates by the API limit and ignores a stale response after page change',async()=>{
  let old!:(value:Response)=>void;vi.mocked(fetch).mockResolvedValueOnce(Response.json({data:[{sku:'A',status:'draft'}],total:21,limit:20})).mockReturnValueOnce(new Promise(resolve=>{old=resolve;})).mockResolvedValueOnce(Response.json({data:[{sku:'A',status:'draft'}],total:21,limit:20}));
  render(Marketing);flush();await settle();let tree=render(Marketing);find(tree,'button','Próxima').props.onClick();render(Marketing);flush();
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('offset=20');tree=render(Marketing);find(tree,'button','Página anterior').props.onClick();render(Marketing);flush();await settle();old(Response.json({data:[{sku:'STALE',status:'draft'}],total:21}));await settle();
  expect(text(render(Marketing))).not.toContain('STALE');
 });
 it('serializes login submission and exposes a focused alert on failed credentials',async()=>{
  let finish!:(value:Response)=>void;vi.mocked(fetch).mockReturnValue(new Promise(resolve=>{finish=resolve;}));const tree=render(Login),submit=find(tree,'form').props.onSubmit,event={preventDefault:vi.fn()};
  const first=submit(event),second=submit(event);expect(fetch).toHaveBeenCalledTimes(1);finish(Response.json({error:'Invalid credentials'},{status:401}));await Promise.all([first,second]);
  const alert=find(render(Login),'p','Invalid credentials');expect(alert.props.role).toBe('alert');expect(alert.props.tabIndex).toBe(-1);
 });
 it('clears invitation URL fragments and never submits an invalid session',async()=>{
  const replaceState=vi.fn();vi.stubGlobal('window',{location:{hash:'#error=expired'},history:{replaceState}});render(Complete);flush();const tree=render(Complete);
  expect(replaceState).toHaveBeenCalledWith(null,'','/auth/complete');expect(text(tree)).toContain('Link inválido');expect(find(tree,'button').props.disabled).toBe(true);
  await find(tree,'form').props.onSubmit({preventDefault:vi.fn()});expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects oversize evidence locally and reports the failure without upload',async()=>{
  const run=vi.fn(async(task:()=>Promise<void>)=>{try{await task();}catch{}}),props={sku:'FIXTURE',busy:false,run};let tree=render(()=>Assets(props));flush();tree=render(()=>Assets(props));
  const input=nodes(tree).find(node=>node.type==='input'&&node.props.type==='file')!;input.props.onChange({target:{files:[{name:'large.pdf',size:5000001,type:'application/pdf'}]}});tree=render(()=>Assets(props));find(tree,'button','Enviar').props.onClick();await settle();
  expect(fetch).not.toHaveBeenCalled();expect(find(render(()=>Assets(props)),'p','acima de 5 MB').props.role).toBe('alert');
 });
 it('discards a completed evidence response belonging to the previous SKU',async()=>{
  let finish!:(value:Response)=>void;vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const run=async(task:()=>Promise<void>)=>{await task();},old={sku:'OLD',busy:false,run},next={...old,sku:'NEW'};
  render(()=>Assets(old));flush();find(render(()=>Assets(old)),'button','Consultar').props.onClick();render(()=>Assets(next));flush();finish(Response.json({data:[{id:'old-file',filename:'OLD SECRET',status:'ready'}]}));await settle();
  const tree=render(()=>Assets(next));expect(text(tree)).not.toContain('OLD SECRET');expect(text(tree)).toContain('Consulte as versões');
 });
});
