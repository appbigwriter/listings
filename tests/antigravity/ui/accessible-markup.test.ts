import {describe,expect,it} from 'vitest';
import {createElement as h,Fragment} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import Login from '../../../app/login/page';
import Complete from '../../../app/auth/complete/page';
import SchemaEditor from '../../../app/catalog/SchemaEditor';
import ChannelCopyEditor from '../../../app/catalog/ChannelCopyEditor';
import Economics from '../../../app/marketing/MarketingEconomicsEditor';
import Assets from '../../../app/catalog/AssetPanel';
import Marketing from '../../../app/marketing/page';
describe('server-rendered component accessibility contracts',()=>{
 it('labels every editable control and keeps non-submit actions safe inside forms',()=>{
  const markup=renderToStaticMarkup(h(Fragment,null,h(Login),h(Complete),h(SchemaEditor,{schema:{type:'object',required:['dimensions','values'],properties:{dimensions:{type:'number',minimum:1,description:'Measured value'},values:{type:'array',items:{type:'string'}}}},attributes:{dimensions:2,values:['A']},onChange:()=>{}}),h(ChannelCopyEditor,{value:{locale:'en_US',title:'Sign',bullets:'',description:'',keywords:''},busy:true,channel:'eBay US',hasSavedCopy:false,onChange:()=>{}}),h(Economics,{sku:'FIXTURE',costs:{},profileVersion:null,onDirty:()=>{},onSaved:async()=>{}}),h(Assets,{sku:'FIXTURE',busy:false,run:async()=>{}})));
  const $=load(markup);$('input,select,textarea').each((_,element)=>{const control=$(element),id=control.attr('id');expect(Boolean(control.attr('aria-label')||control.closest('label').length||(id&&$('label').filter((_,label)=>$(label).attr('for')===id).length))).toBe(true);});
  const ids=$('[id]').map((_,element)=>$(element).attr('id')).get();expect(new Set(ids).size).toBe(ids.length);
  $('button').each((_,button)=>{const node=$(button);expect(node.attr('type')).toBe(node.closest('form').length?'submit':'button');});
  expect($('input[maxlength="80"]').attr('disabled')).toBeDefined();expect($('input[type="number"][step="any"]').attr('min')).toBe('1');
 });
 it('announces marketing loading without falsely rendering an empty result',()=>{
  const $=load(renderToStaticMarkup(h(Marketing)));expect($('[aria-busy="true"]').length).toBe(1);expect($('[role="status"]').text()).toContain('Carregando');expect($.text()).not.toContain('Nenhum perfil');
 });
});
