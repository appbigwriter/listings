import {describe,expect,it} from 'vitest';
import {ebayAspectSchema} from '../lib/marketplaces/ebay-schema';
import {validateSchema} from '../lib/catalog/schema';
const aspect=(name:string,extra:Record<string,unknown>={},values:any[]=[])=>({localizedAspectName:name,aspectConstraint:{aspectMode:'FREE_TEXT',aspectDataType:'STRING',aspectRequired:true,itemToAspectCardinality:'SINGLE',...extra},aspectValues:values});
describe('eBay Taxonomy conditional aspect contracts',()=>{
 it('requires the control aspect value from the official Color Green / Size Small-or-Medium example',()=>{
  const schema=ebayAspectSchema({aspects:[aspect('Color',{aspectMode:'SELECTION_ONLY'},[{localizedValue:'Green',valueConstraints:[{applicableForLocalizedAspectName:'Size',applicableForLocalizedAspectValues:['Small','Medium']}]},{localizedValue:'Blue'}]),aspect('Size',{},[])]});
  expect(validateSchema(schema,{Color:['Green'],Size:['Small']})).toEqual([]);
  expect(validateSchema(schema,{Color:['Green'],Size:['Large']}).length).toBeGreaterThan(0);
  expect(validateSchema(schema,{Color:['Blue'],Size:['Large']})).toEqual([]);
  expect(validateSchema(schema,{Color:['Green']})).toEqual(expect.arrayContaining([expect.objectContaining({code:'schema_required'})]));
 });
 it('enforces cardinality, uniqueness and current required status rather than the recommendation label',()=>{
  const schema=ebayAspectSchema({aspects:[aspect('Brand',{aspectUsage:'RECOMMENDED'}),aspect('Colors',{itemToAspectCardinality:'MULTI',aspectMaxLength:5})]});
  expect(validateSchema(schema,{Colors:['Red']}).length).toBeGreaterThan(0);
  expect(validateSchema(schema,{Brand:['FBR'],Colors:['Red','Red']}).map(issue=>issue.code)).toContain('schema_uniqueItems');
  expect(validateSchema(schema,{Brand:['FBR','Other'],Colors:['Yellow']}).map(issue=>issue.code)).toEqual(expect.arrayContaining(['schema_maxItems','schema_maxLength']));
 });
 it('checks number/date formats and blocks unsupported advanced constraints',()=>{
  const schema=ebayAspectSchema({aspects:[aspect('Year',{aspectDataType:'NUMBER',aspectFormat:'int32'}),aspect('Date',{aspectDataType:'DATE',aspectFormat:'YYYYMMDD'})]});
  expect(validateSchema(schema,{Year:['2026'],Date:['20260228']})).toEqual([]);
  expect(validateSchema(schema,{Year:['2147483648'],Date:['20260230']}).map(issue=>issue.code)).toEqual(expect.arrayContaining(['schema_format']));
  expect(validateSchema(ebayAspectSchema({aspects:[aspect('Range',{aspectAdvancedDataType:'NUMERIC_RANGE'})]}),{Range:['1-3']}).length).toBeGreaterThan(0);
 });
 it('blocks a selected value with unhomologated combinations of distinct control aspects',()=>{
  const schema=ebayAspectSchema({aspects:[aspect('Color',{},[{localizedValue:'Green',valueConstraints:[{applicableForLocalizedAspectName:'Size',applicableForLocalizedAspectValues:['Small']},{applicableForLocalizedAspectName:'Model',applicableForLocalizedAspectValues:['A']}]}]),aspect('Size'),aspect('Model')]});
  expect(validateSchema(schema,{Color:['Green'],Size:['Small'],Model:['A']}).map(issue=>issue.code)).toContain('schema_not');
 });
});
