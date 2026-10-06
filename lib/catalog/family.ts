import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import type { Channel, ProductInput } from './model';
import { CatalogError, loadProduct } from './repository';
import {contentHash,hash} from './model';
import {evaluateReadiness} from './readiness';
import {amazonConfig,amazonPayload,amazonReadback} from '../marketplaces/amazon';
import {submissionMatches} from './reconciliation';

export async function assertFamily(db: SupabaseClient, auth: AuthContext, product: ProductInput, channel: Channel,forPublication=false) {
  if (product.relationship !== 'Child') return;
  if (!product.parent_sku || product.parent_sku === product.sku) throw new CatalogError('Informe um SKU pai diferente do filho.', 422);
  const loaded=await loadProduct(db, auth, String(product.parent_sku)),parent=loaded.product,parentListing=parent._catalog?.channels[channel],childListing=product._catalog?.channels[channel];
  if (parent.relationship !== 'Parent' || !product.variation || parent.variation !== product.variation || !parentListing?.product_type||parentListing.product_type !== childListing?.product_type||!parentListing.category||parentListing.category!==childListing?.category||!product.brand||parent.brand!==product.brand||parent._catalog?.kind!==product._catalog?.kind) throw new CatalogError('A família exige pai ativo, mesmo tema, marca, elegibilidade, categoria e tipo de produto no canal.', 422);
  const reference={sku:String(parent.sku),updated_at:loaded.row.updated_at,content_hash:contentHash(parent,channel)};
  if(forPublication){
    if(channel!=='amazon-us'||!evaluateReadiness(parent,channel).ready)throw new CatalogError('Revise e aprove o pai atual antes de publicar um filho.',422);
    const remote=await amazonReadback(reference.sku),config=amazonConfig();
    if(remote.sku!==reference.sku||!remote.summaries?.some((item:{marketplaceId?:string})=>item.marketplaceId===config.marketplaceId)||remote.issues?.some((issue:{severity?:string})=>issue.severity==='ERROR')||!submissionMatches(amazonPayload(parent),remote))throw new CatalogError('O pai não foi comprovado na Amazon com os atributos atuais. Publique/reconcilie o pai primeiro, ou inclua a família em um feed.',422);
    return {...reference,readback_hash:hash(remote),checked_at:new Date().toISOString()};
  }
  return reference;
}
