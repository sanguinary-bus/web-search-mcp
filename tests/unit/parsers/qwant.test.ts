import { describe, it, expect } from 'vitest';
import { parseQwantResults } from '../../../src/engines/qwant.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Qwant Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/qwant.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseQwantResults', () => {
    it('should parse results from HTML', () => {
      const results = parseQwantResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseQwantResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseQwantResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseQwantResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle serp-item data-testid', () => {
      const html = `
        <html>
          <body>
            <article data-testid="serp-item">
              <h3><a href="https://test.com">Test Title</a></h3>
              <p class="description">Test description</p>
            </article>
          </body>
        </html>
      `;
      const results = parseQwantResults(html, 5);
      expect(results.length).toBe(1);
    });
  });
});
