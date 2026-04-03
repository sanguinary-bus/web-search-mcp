import { describe, it, expect } from 'vitest';
import { parseEcosiaResults } from '../../../src/engines/ecosia.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Ecosia Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/ecosia.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseEcosiaResults', () => {
    it('should parse results from JSON embedded in HTML', () => {
      const results = parseEcosiaResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseEcosiaResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseEcosiaResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without vike_pageContext', () => {
      const html = '<html><body></body></html>';
      const results = parseEcosiaResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle invalid JSON', () => {
      const html =
        '<html><body><script id="vike_pageContext">invalid json</script></body></html>';
      const results = parseEcosiaResults(html, 5);
      expect(results.length).toBe(0);
    });
  });
});
