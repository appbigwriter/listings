import type { Channel } from '../catalog/channels';
export const CAPABILITIES: Record<Channel,{classification:boolean;schema:boolean;identity:boolean;preview:boolean;publish:boolean;monitor:boolean;fees:boolean;status:string}> = {
  'amazon-us':{classification:true,schema:true,identity:true,preview:true,publish:true,monitor:true,fees:true,status:'awaiting_live_validation'},
  'ebay-us':{classification:true,schema:true,identity:true,preview:false,publish:true,monitor:true,fees:false,status:'standalone_publish_awaiting_live_validation'},
  'walmart-us':{classification:true,schema:true,identity:false,preview:false,publish:false,monitor:false,fees:false,status:'taxonomy_only'},
  'tiktok-us':{classification:false,schema:false,identity:false,preview:false,publish:false,monitor:false,fees:false,status:'not_implemented'}
};
