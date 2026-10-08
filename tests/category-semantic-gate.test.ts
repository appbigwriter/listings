import { describe, expect, it } from 'vitest';
import { isCategorySemanticallyCompatible, recommendCategory } from '../lib/ai/classify';

describe('category semantic safety gate', () => {
  it('rejects luggage for an LED light box', () => {
    expect(isCategorySemanticallyCompatible('LED Light Box 24"', '', { id: 'LUGGAGE', name: 'Luggage' })).toBe(false);
  });

  it('returns an explicit rejected recommendation for an incompatible singleton', async () => {
    await expect(recommendCategory('LED Light Box 24"', '', [{ id: 'LUGGAGE', name: 'Luggage' }])).resolves.toMatchObject({
      id: 'LUGGAGE', confidence: 0, accepted: false,
    });
  });

  it('accepts luggage when the product is actually luggage', () => {
    expect(isCategorySemanticallyCompatible('24 inch carry-on suitcase', '', { id: 'LUGGAGE', name: 'Luggage' })).toBe(true);
  });

  it('does not reject neutral official taxonomy names', () => {
    expect(isCategorySemanticallyCompatible('LED Light Box 24"', '', { id: 'LIGHTING', name: 'Lighting' })).toBe(true);
  });
});
