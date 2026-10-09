import type { Channel } from '../catalog/channels';
export const CAPABILITIES: Record<Channel,{classification:boolean;research:boolean;schema:boolean;identity:boolean;preview:boolean;publish:boolean;monitor:boolean;fees:boolean;status:string}> = {
  'amazon-us':{classification:true,research:true,schema:true,identity:true,preview:true,publish:true,monitor:true,fees:true,status:'awaiting_live_validation'},
  'ebay-us':{classification:true,research:false,schema:true,identity:true,preview:false,publish:true,monitor:true,fees:false,status:'family_preparation_and_standalone_publish_awaiting_live_validation'},
  'walmart-us':{classification:true,research:false,schema:true,identity:false,preview:false,publish:true,monitor:true,fees:false,status:'single_sku_ingestion_awaiting_live_validation'},
  'tiktok-us':{classification:false,research:false,schema:false,identity:false,preview:false,publish:false,monitor:false,fees:false,status:'provisioned_awaiting_account_contract'}
};
