import { describe, it, expect } from 'vitest';
import {
  parseYahooResults,
  cleanSearchUrl,
} from '../../../src/engines/yahoo.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Yahoo Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/yahoo.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseYahooResults', () => {
    it('should parse results from HTML', () => {
      const results = parseYahooResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseYahooResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseYahooResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle bot detection page titles', () => {
      const html =
        '<html><head><title>Yahoo - CAPTCHA</title></head><body></body></html>';
      const results = parseYahooResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseYahooResults(html, 5);
      expect(results.length).toBe(0);
    });
  });

  describe('cleanSearchUrl', () => {
    it('should extract URL from Yahoo redirect', () => {
      const url = cleanSearchUrl(
        'https://www.yahoo.com/redirect?url=https%3A%2F%2Fexample.com%2Fpage'
      );
      expect(url).toBe('https://example.com/page');
    });

    it('should return direct URLs unchanged', () => {
      const url = cleanSearchUrl('https://example.com/page');
      expect(url).toBe('https://example.com/page');
    });
  });
});
