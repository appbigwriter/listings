import type {PGlite} from '@electric-sql/pglite';
/** Test-only subset of PostgREST. Executes actual parameterized PostgreSQL, never network calls. */
export function workerDatabaseAdapter(db:PGlite){
 return {from(table:string){
  if(!['catalog_jobs','prelistings'].includes(table))throw new Error('Unexpected worker test table: '+table);
  let mutation:Record<string,unknown>|undefined,insert=false;const predicates:string[]=[],parameters:unknown[]=[];
  const column=(name:string)=>{if(!/^[a-z_]+$/.test(name))throw new Error('Unsupported test column');return '"'+name+'"';};
  const bind=(value:unknown)=>{parameters.push(value&&typeof value==='object'?JSON.stringify(value):value);return '$'+parameters.length;};
  const condition=(name:string,operator:string,value:unknown)=>{predicates.push(column(name)+' '+operator+' '+bind(value));return builder;};
  async function run(single:boolean){try{
   let statement:string;
   if(mutation){
    const keys=Object.keys(mutation),values=keys.map(key=>bind(mutation![key]));
    if(insert)statement=`insert into ${table} (${keys.map(column).join(',')}) values (${values.join(',')}) returning to_jsonb(${table}) as data`;
    else statement=`update ${table} set ${keys.map((key,index)=>column(key)+'='+values[index]).join(',')} ${predicates.length?'where '+predicates.join(' and '):''} returning to_jsonb(${table}) as data`;
   }else statement=`select to_jsonb(t) as data from (select * from ${table} ${predicates.length?'where '+predicates.join(' and '):''}) t`;
   const result=await db.query<{data:any}>(statement,parameters),rows=result.rows.map(row=>row.data);
   return {data:single?rows[0]||null:rows,error:null};
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:'test SQL error',code:(error as any)?.code}};}}
  const builder:any={select:()=>builder,eq:(key:string,value:unknown)=>condition(key,'=',value),neq:(key:string,value:unknown)=>condition(key,'<>',value),gt:(key:string,value:unknown)=>condition(key,'>',value),
   or(expression:string){const match=/^lease_until\.is\.null,lease_until\.lt\.(.+)$/.exec(expression);if(!match)throw new Error('Unsupported test OR');predicates.push('(lease_until is null or lease_until < '+bind(match[1])+')');return builder;},
   insert(value:Record<string,unknown>){mutation=value;insert=true;return builder;},update(value:Record<string,unknown>){mutation=value;return builder;},
   abortSignal:()=>builder,maybeSingle:()=>run(true),single:()=>run(true),then:(resolve:any,reject:any)=>run(false).then(resolve,reject)};
  return builder;
 }};
}
