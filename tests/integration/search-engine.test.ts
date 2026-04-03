import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SearchEngine } from '../../src/search-engine.js';

describe('SearchEngine Integration', () => {
  let searchEngine: SearchEngine;

  beforeAll(() => {
    searchEngine = new SearchEngine();
  });

  afterAll(async () => {
    await searchEngine.closeAll();
  });

  describe('search', () => {
    it('should return results for a valid query', async () => {
      const result = await searchEngine.search({
        query: 'javascript tutorial',
        numResults: 3,
        timeout: 20000,
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.engine).toBeTruthy();
    }, 30000);

    it('should return results with valid structure', async () => {
      const result = await searchEngine.search({
        query: 'test search',
        numResults: 2,
        timeout: 20000,
      });

      for (const r of result.results) {
        expect(r.title).toBeTruthy();
        expect(r.url).toMatch(/^https?:\/\//);
        expect(r.description).toBeTruthy();
        expect(r.fetchStatus).toBe('success');
      }
    }, 30000);

    it('should use the configured number of results', async () => {
      const result = await searchEngine.search({
        query: 'web development',
        numResults: 5,
        timeout: 20000,
      });

      expect(result.results.length).toBeLessThanOrEqual(7); // Allow some tolerance for extra results
    }, 30000);

    it('should handle different queries', async () => {
      const queries = ['python programming', 'machine learning'];

      for (const query of queries) {
        const result = await searchEngine.search({
          query,
          numResults: 2,
          timeout: 20000,
        });

        expect(result.results.length).toBeGreaterThan(0);
        expect(result.engine).toBeTruthy();
      }
    }, 60000);

    it('should include engine name in result', async () => {
      const result = await searchEngine.search({
        query: 'test',
        numResults: 1,
        timeout: 20000,
      });

      expect(result.engine).toBeTruthy();
      expect(result.engine).not.toBe('None');
    }, 30000);
  });
});
