import { describe, expect, it } from 'vitest';
import { internalFamilySuggestion } from '../lib/catalog/internal-family';

describe('internal preparation family', () => {
  it('places LED light boxes in illuminated displays without claiming an Amazon type', () => {
    expect(internalFamilySuggestion({ title: 'LED Light Box 24"' })).toBe('Displays e placas iluminadas');
  });
  it('leaves an unrelated product unclassified', () => {
    expect(internalFamilySuggestion({ title: 'Unknown item' })).toBeNull();
  });
});
