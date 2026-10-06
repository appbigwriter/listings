import {afterEach,describe,expect,it,vi} from 'vitest';
import {configuredAiPricing,costMicroUsd,reservationMicroUsd,dailyMicroUsd} from '../lib/ai/cost';
import {reserveAiOperation} from '../lib/ai/usage';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe('AI cost reservation and estimation',()=>{
  it('blocks extra calls, changed models and excessive context before any API request',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05'));vi.stubEnv('OPENAI_MODEL','gpt-4o-mini');
    const db={rpc:vi.fn().mockResolvedValue({data:'reservation',error:null})};
    const operation=await reserveAiOperation(db as any,{userId:'owner',organizationId:'org',mode:'supabase-session'},'A','classify');
    const request={model:'gpt-4o-mini',max_completion_tokens:1000,messages:[]};operation.runtime.beforeCall(request);expect(()=>operation.runtime.beforeCall(request)).toThrow('reserva');
    const second=await reserveAiOperation(db as any,{userId:'owner',organizationId:'org',mode:'supabase-session'},'A','generate');
    expect(()=>second.runtime.beforeCall({...request,model:'different'})).toThrow('Modelo');
    expect(()=>second.runtime.beforeCall({...request,messages:['x'.repeat(128000)]})).toThrow('contexto');
  });
  it('reserves both generation calls at full context/output and rounds conservatively',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05'));
    const pricing=configuredAiPricing('gpt-4o-mini')!;
    expect(reservationMicroUsd(pricing,'generate')).toBe(41400);expect(reservationMicroUsd(pricing,'classify')).toBe(19800);
    expect(costMicroUsd(pricing,1,1)).toBe(1);expect(costMicroUsd(pricing,1000000,1000000)).toBe(750000);
  });
  it('does not silently invent rates for another model or retain expired rates',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-12-01'));
    expect(configuredAiPricing('gpt-4o-mini')).toBeNull();expect(configuredAiPricing('unknown-model')).toBeNull();
    vi.stubEnv('PRELISTING_AI_PRICING_JSON','{"model":"other"}');expect(()=>configuredAiPricing('gpt-4o-mini')).toThrow('não corresponde');
  });
  it('validates money precision and does not accept negative or fractional usage',()=>{
    vi.stubEnv('PRELISTING_AI_DAILY_USD','2.500001');expect(dailyMicroUsd()).toBe(2500001);
    vi.stubEnv('PRELISTING_AI_DAILY_USD','-1');expect(()=>dailyMicroUsd()).toThrow('inválido');
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05'));expect(()=>costMicroUsd(configuredAiPricing('gpt-4o-mini')!,1.5,0)).toThrow('tokens');
  });
});
