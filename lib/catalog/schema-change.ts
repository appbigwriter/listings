import {hash,type SchemaSnapshot} from './model';

export function schemaChange(previous:SchemaSnapshot|undefined,current:SchemaSnapshot){
 if(!previous||previous.checksum===current.checksum&&hash(previous.metadata)===hash(current.metadata))return undefined;
 const before=previous.schema.properties as Record<string,unknown>|undefined,after=current.schema.properties as Record<string,unknown>|undefined;
 const required=(schema:Record<string,unknown>)=>new Set(Array.isArray(schema.required)?schema.required.filter((key):key is string=>typeof key==='string'):[]);
 const oldRequired=required(previous.schema),newRequired=required(current.schema);
 return {detected_at:new Date().toISOString(),previous_version:previous.version,current_version:current.version,previous_checksum:previous.checksum,current_checksum:current.checksum,
  metadata_changed:hash(previous.metadata)!==hash(current.metadata),added_fields:Object.keys(after||{}).filter(key=>!Object.hasOwn(before||{},key)),removed_fields:Object.keys(before||{}).filter(key=>!Object.hasOwn(after||{},key)),changed_fields:Object.keys(after||{}).filter(key=>Object.hasOwn(before||{},key)&&hash(before![key])!==hash(after![key])),new_required_fields:[...newRequired].filter(key=>!oldRequired.has(key)),review_required:true as const,conditional_changes_possible:true as const};
}
