import {describe,expect,it} from 'vitest';
import {submissionMatches} from '../lib/catalog/reconciliation';
describe('uncertain submission reconciliation',()=>{
  it('requires all posted attributes rather than title alone or a buyable status',()=>{
    const posted={attributes:{item_name:[{value:'Sign'}],brand:[{value:'FBRSigns'}]}};
    expect(submissionMatches(posted,{attributes:{item_name:[{value:'Sign'}],brand:[{value:'FBRSigns'}],extra:[{value:'remote'}]}})).toBe(true);
    expect(submissionMatches(posted,{attributes:{item_name:[{value:'Sign'}]}})).toBe(false);
    expect(submissionMatches(posted,{attributes:{...posted.attributes,brand:[{value:'Other'}]}})).toBe(false);
    expect(submissionMatches(null,{attributes:posted.attributes})).toBe(false);
  });
});
