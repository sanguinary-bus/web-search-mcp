import { describe, it, expect } from 'vitest';
import { parseSearxResults } from '../../../src/engines/searx.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Searx Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/searx.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseSearxResults', () => {
    it('should parse results from HTML', () => {
      const results = parseSearxResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseSearxResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseSearxResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseSearxResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle article.result selector', () => {
      const html = `
        <html>
          <body>
            <article class="result">
              <h3><a href="https://test.com">Test Title</a></h3>
              <p>Test description</p>
            </article>
          </body>
        </html>
      `;
      const results = parseSearxResults(html, 5);
      expect(results.length).toBe(1);
    });
  });
});
