import { describe, it, expect, afterAll } from 'vitest';
import { SearchEngine } from '../../../src/search-engine.js';
import { EnhancedContentExtractor } from '../../../src/enhanced-content-extractor.js';

describe('E2E: Search Flow', () => {
  const searchEngine = new SearchEngine();
  const contentExtractor = new EnhancedContentExtractor();

  afterAll(async () => {
    await searchEngine.closeAll();
    await contentExtractor.closeAll();
  });

  it('should perform full search flow: search -> extract content', async () => {
    const query = 'javascript tutorial';

    const searchResult = await searchEngine.search({
      query,
      numResults: 3,
      timeout: 20000,
    });

    expect(searchResult.results.length).toBeGreaterThan(0);

    const firstResult = searchResult.results[0];
    expect(firstResult.url).toMatch(/^https?:\/\//);

    const content = await contentExtractor.extractContent({
      url: firstResult.url,
      timeout: 15000,
    });

    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  }, 45000);

  it('should handle multiple search results with content extraction', async () => {
    const searchResult = await searchEngine.search({
      query: 'web development',
      numResults: 2,
      timeout: 20000,
    });

    const enhancedResults = await contentExtractor.extractContentForResults(
      searchResult.results.slice(0, 2),
      2
    );

    expect(enhancedResults.length).toBeGreaterThan(0);

    for (const result of enhancedResults) {
      expect(result.url).toMatch(/^https?:\/\//);
      expect(result.fetchStatus).toBeTruthy();
    }
  }, 60000);
});
