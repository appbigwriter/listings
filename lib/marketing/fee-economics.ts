import {CatalogError} from '../catalog/repository';
import {hash} from '../catalog/model';
import type {AmazonFeeEstimate} from '../marketplaces/amazon-fee-estimates';
import type {MarketingCosts,Margin} from './margin';
import {isNumericInput} from '../catalog/numeric-input';
const BUSINESS_COSTS=['product_cost','printing_cost','packaging_cost','shipping_cost','other_costs'] as const;
export function estimatedAmazonMargin(costs:MarketingCosts&{source?:string},estimate:AmazonFeeEstimate):Margin&{basis:'amazon_api_estimate';business_cost_total:number;amazon_fees_total:number;shipping_charge:number;fee_snapshot_hash:string;projection_hash:string}{
 if(!costs||costs.currency!=='USD'||!costs.source?.trim()||!Number.isFinite(Date.parse(costs.calculated_at||''))||Date.parse(costs.calculated_at||'')>Date.now()+300000)throw new CatalogError('Informe custos USD com fonte e data válidas antes de projetar a margem.',422);
 for(const field of BUSINESS_COSTS)if(!isNumericInput(costs[field])||Number(costs[field])<0)throw new CatalogError(`Custo confirmado ausente: ${field}.`,422);
 const business=BUSINESS_COSTS.reduce((sum,field)=>sum+Number(costs[field]),0),revenue=estimate.target.price+estimate.target.shipping_charge,total=business+estimate.total_fees;
 if(!Number.isSafeInteger(Math.round(total*100))||!Number.isSafeInteger(Math.round(revenue*100)))throw new CatalogError('Valores da projeção excedem o limite suportado.',422);
 const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
 const projection={revenue,total_cost:round(total),profit:round(revenue-total),percentage:round((revenue-total)/revenue*100),currency:'USD',calculated_at:estimate.checked_at,basis:'amazon_api_estimate' as const,business_cost_total:round(business),amazon_fees_total:estimate.total_fees,shipping_charge:estimate.target.shipping_charge,fee_snapshot_hash:estimate.snapshot_hash};
 return {...projection,projection_hash:hash({projection,costs:Object.fromEntries([...BUSINESS_COSTS,'source','calculated_at','currency'].map(key=>[key,(costs as any)[key]]))})};
}
