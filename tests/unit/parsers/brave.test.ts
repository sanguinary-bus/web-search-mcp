import { describe, it, expect } from 'vitest';
import {
  parseBraveResults,
  cleanBraveUrl,
} from '../../../src/engines/brave.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Brave Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/brave.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseBraveResults', () => {
    it('should parse results from HTML', () => {
      const results = parseBraveResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseBraveResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseBraveResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle bot detection page titles', () => {
      const html =
        '<html><head><title>Access Denied - Brave</title></head><body></body></html>';
      const results = parseBraveResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseBraveResults(html, 5);
      expect(results.length).toBe(0);
    });
  });

  describe('cleanBraveUrl', () => {
    it('should return https URL for protocol-relative URLs', () => {
      const url = cleanBraveUrl('//example.com/page');
      expect(url).toBe('https://example.com/page');
    });

    it('should return direct URLs unchanged', () => {
      const url = cleanBraveUrl('https://example.com/page');
      expect(url).toBe('https://example.com/page');
    });
  });
});
