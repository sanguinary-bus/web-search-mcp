import { describe, it, expect } from 'vitest';
import { assessResultQuality } from '../../../src/engines/base.js';
import type { SearchResult } from '../../../src/types.js';

describe('Quality Assessment', () => {
  const createResult = (title: string, description: string): SearchResult => ({
    title,
    url: 'https://example.com',
    description,
    fullContent: '',
    contentPreview: '',
    wordCount: 0,
    timestamp: new Date().toISOString(),
    fetchStatus: 'success',
  });

  describe('assessResultQuality', () => {
    it('should return 0 for empty results', () => {
      const quality = assessResultQuality([], 'javascript tutorial');
      expect(quality).toBe(0);
    });

    it('should return high score for relevant results', () => {
      const results = [
        createResult('JavaScript Tutorial', 'Learn JavaScript programming'),
        createResult('JS Guide', 'Complete JavaScript reference'),
      ];
      const quality = assessResultQuality(results, 'javascript tutorial');
      expect(quality).toBeGreaterThan(0.5);
    });

    it('should penalize irrelevant results', () => {
      const results = [
        createResult('Pizza Recipe', 'How to make pizza'),
        createResult('Weather Today', 'Sunny with a chance of rain'),
      ];
      const quality = assessResultQuality(results, 'javascript tutorial');
      expect(quality).toBeLessThan(0.5);
    });

    it('should handle queries with multiple words', () => {
      const results = [
        createResult('React JavaScript Tutorial', 'Learn React and JavaScript'),
      ];
      const quality = assessResultQuality(results, 'react javascript tutorial');
      expect(quality).toBeGreaterThan(0.5);
    });

    it('should handle short query words (less than 3 chars)', () => {
      const results = [createResult('C Programming', 'Learn C language')];
      const quality = assessResultQuality(results, 'c programming');
      expect(quality).toBeGreaterThan(0);
    });

    it('should handle empty query', () => {
      const results = [createResult('Any Title', 'Any description')];
      const quality = assessResultQuality(results, '');
      expect(quality).toBe(0.5); // DEFAULT_SCORE
    });
  });
});
