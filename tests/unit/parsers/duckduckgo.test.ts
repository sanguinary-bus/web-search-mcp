import { describe, it, expect } from 'vitest';
import {
  parseDuckDuckGoResults,
  cleanDuckDuckGoUrl,
} from '../../../src/engines/duckduckgo.js';
import * as fs from 'fs';
import * as path from 'path';

describe('DuckDuckGo Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/duckduckgo.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseDuckDuckGoResults', () => {
    it('should parse results from HTML', () => {
      const results = parseDuckDuckGoResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseDuckDuckGoResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseDuckDuckGoResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty HTML', () => {
      const results = parseDuckDuckGoResults('<html><body></body></html>', 5);
      expect(results.length).toBe(0);
    });
  });

  describe('cleanDuckDuckGoUrl', () => {
    it('should return https URL for protocol-relative URLs', () => {
      const url = cleanDuckDuckGoUrl('//example.com/page');
      expect(url).toBe('https://example.com/page');
    });

    it('should return direct URLs unchanged', () => {
      const url = cleanDuckDuckGoUrl('https://example.com/page');
      expect(url).toBe('https://example.com/page');
    });

    it('should decode DuckDuckGo redirect URLs', () => {
      const url = cleanDuckDuckGoUrl(
        '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage'
      );
      expect(url).toBe('https://example.com/page');
    });
  });
});
