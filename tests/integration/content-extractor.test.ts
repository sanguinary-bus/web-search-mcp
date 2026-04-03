import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EnhancedContentExtractor } from '../../src/enhanced-content-extractor.js';

describe('EnhancedContentExtractor Integration', () => {
  let extractor: EnhancedContentExtractor;

  beforeAll(() => {
    extractor = new EnhancedContentExtractor();
  });

  afterAll(async () => {
    await extractor.closeAll();
  });

  describe('extractContent', () => {
    it('should extract content from a simple HTML page', async () => {
      const content = await extractor.extractContent({
        url: 'https://example.com',
        timeout: 15000,
      });

      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    }, 20000);

    it('should handle different URLs', async () => {
      const urls = ['https://example.com'];

      for (const url of urls) {
        const content = await extractor.extractContent({
          url,
          timeout: 15000,
        });

        expect(content).toBeTruthy();
        expect(content.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should respect maxContentLength', async () => {
      const content = await extractor.extractContent({
        url: 'https://example.com',
        timeout: 15000,
        maxContentLength: 100,
      });

      expect(content.length).toBeLessThanOrEqual(100);
    }, 20000);
  });

  describe('extractContentForResults', () => {
    it('should extract content for multiple search results', async () => {
      const searchResults = [
        {
          title: 'Example',
          url: 'https://example.com',
          description: 'Example domain',
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp: new Date().toISOString(),
          fetchStatus: 'success' as const,
        },
      ];

      const enhanced = await extractor.extractContentForResults(
        searchResults,
        5
      );

      expect(enhanced.length).toBeGreaterThan(0);
      for (const r of enhanced) {
        expect(r.fetchStatus).toBeTruthy();
      }
    }, 30000);
  });
});
