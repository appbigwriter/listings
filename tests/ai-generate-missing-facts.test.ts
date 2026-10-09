import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({ default: class { chat = { completions: { create: mocks.create } }; } }));

import { generateListing } from '../lib/ai/generate';

const response = (value: unknown) => ({ model: 'gpt-4o-mini', usage: { prompt_tokens: 10, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });

describe('generation with missing factual fields', () => {
  afterEach(() => { vi.unstubAllEnvs(); mocks.create.mockReset(); });

  it('returns the draft without inventing included, material or color when FBR has no values', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.create
      .mockResolvedValueOnce(response({ title: 'LED Light Box', bullets: 'LED light box', description: 'LED light box', keywords: 'light box', material: 'Plastic', color: 'White', included: 'Power adapter' }))
      .mockResolvedValueOnce(response({ supported: false, reason: 'Included items are not in the source.', evidence: [] }));

    const result = await generateListing({ fbrFacts: { title: 'LED Light Box' } });

    expect(result).toMatchObject({ title: 'LED Light Box', material: '', color: '', included: '', grounding: { supported: false, human_review_required: true } });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('uses the exact FBR included value when the model paraphrases it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.create
      .mockResolvedValueOnce(response({ title: 'LED Light Box', bullets: 'LED light box', description: 'LED light box', keywords: 'light box', material: '', color: '', included: 'Power supply' }))
      .mockResolvedValueOnce(response({ supported: false, reason: 'Paraphrased included items.', evidence: [] }));

    const result = await generateListing({ fbrFacts: { title: 'LED Light Box', included: 'Power adapter' } });

    expect(result).toMatchObject({ included: 'Power adapter', grounding: { supported: false, human_review_required: true } });
  });
});
