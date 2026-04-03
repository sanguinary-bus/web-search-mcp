import { describe, it, expect } from 'vitest';
import { parseMojeekResults } from '../../../src/engines/mojeek.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Mojeek Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/mojeek.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseMojeekResults', () => {
    it('should parse results from HTML', () => {
      const results = parseMojeekResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseMojeekResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseMojeekResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseMojeekResults(html, 5);
      expect(results.length).toBe(0);
    });
  });
});
