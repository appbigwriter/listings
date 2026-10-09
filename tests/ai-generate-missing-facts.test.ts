import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({ default: class { chat = { completions: { create: mocks.create } }; } }));

import { generateListing } from '../lib/ai/generate';
import { buildAiGenerationPayload } from '../lib/ai/contracts';

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

  it('uses imported source description and images while keeping visual observations outside listing claims', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const input = buildAiGenerationPayload({ title: 'LED Light Box', images: ['https://fbrsigns.com/light-box.jpg'], _catalog: { source: { snapshot: { detailed_description: 'Illuminated display for signs.' } } } });
    expect(input.fbrFacts.description).toBe('Illuminated display for signs.');
    expect(input.imageUrls).toEqual(['https://fbrsigns.com/light-box.jpg']);
    mocks.create
      .mockResolvedValueOnce(response({ title: 'LED Light Box', bullets: 'Illuminated display for signs.', description: 'Illuminated display for signs.', keywords: 'light box', material: '', color: '', included: '', visual_observations: ['Appears to have a bright front panel.'] }))
      .mockResolvedValueOnce(response({ supported: true, reason: 'Supported by source.', evidence: [{ field: 'description', quote: 'Illuminated display for signs.' }] }));
    const result = await generateListing(input);
    const firstRequest = mocks.create.mock.calls[0][0];
    expect(firstRequest.messages[1].content).toContainEqual({ type: 'image_url', image_url: { url: 'https://fbrsigns.com/light-box.jpg', detail: 'low' } });
    expect(result).not.toHaveProperty('visual_observations');
    expect(result.grounding).toMatchObject({ visual_observations: ['Appears to have a bright front panel.'], image_count: 1 });
  });
});
