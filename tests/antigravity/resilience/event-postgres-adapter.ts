import type {PGlite} from '@electric-sql/pglite';
/** Narrow test PostgREST bridge. Handler logic is unchanged and SQL runs in actual PostgreSQL. */
export function eventPostgresAdapter(db:PGlite){return {from(table:string){
 if(!['prelistings','catalog_events'].includes(table))throw new Error('Unexpected fixture table');
 let values:Record<string,unknown>|undefined,insert=false;const conditions:string[]=[],parameters:unknown[]=[];
 const column=(key:string)=>{if(!/^[a-z_]+$/.test(key))throw new Error('Unsafe column');return '"'+key+'"';};
 const bind=(value:unknown)=>{parameters.push(value&&typeof value==='object'?JSON.stringify(value):value);return '$'+parameters.length;};
 async function run(){try{
  let sql:string;
  if(values){const keys=Object.keys(values),bound=keys.map(key=>bind(values![key]));sql=insert?`insert into ${table}(${keys.map(column).join(',')}) values(${bound.join(',')}) returning to_jsonb(${table}) row`:`update ${table} set ${keys.map((key,index)=>column(key)+'='+bound[index]).join(',')} where ${conditions.join(' and ')} returning to_jsonb(${table}) row`;}
  else sql=`select to_jsonb(t) row from (select * from ${table} ${conditions.length?'where '+conditions.join(' and '):''}) t`;
  const result=await db.query<{row:any}>(sql,parameters);return {data:result.rows[0]?.row??null,error:null};
 }catch(error){return {data:null,error:{code:(error as any).code,message:String(error)}};}}
 const query:any={select:()=>query,eq:(key:string,value:unknown)=>{conditions.push(column(key)+'='+bind(value));return query;},insert:(input:Record<string,unknown>)=>{values=input;insert=true;return query;},update:(input:Record<string,unknown>)=>{values=input;return query;},or:(expression:string)=>{const match=/^lease_until\.is\.null,lease_until\.lt\.(.+)$/.exec(expression);if(!match)throw new Error('Unexpected OR');conditions.push('(lease_until is null or lease_until<'+bind(match[1])+')');return query;},single:run,maybeSingle:run};return query;
}};}
