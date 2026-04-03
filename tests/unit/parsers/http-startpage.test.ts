import { describe, it, expect } from 'vitest';
import { parseHttpStartpageResults } from '../../../src/engines/http-startpage.js';
import * as fs from 'fs';
import * as path from 'path';

describe('HTTP Startpage Parser', () => {
  const fixturePath = path.join(
    __dirname,
    '../../fixtures/http-startpage.html'
  );
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseHttpStartpageResults', () => {
    it('should parse results from HTML', () => {
      const results = parseHttpStartpageResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseHttpStartpageResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseHttpStartpageResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseHttpStartpageResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle relative URLs', () => {
      const html = `
        <html>
          <body>
            <div class="result">
              <h3><a href="/search/test">Test Title</a></h3>
              <p class="desc">Test description that is long enough to pass validation</p>
            </div>
          </body>
        </html>
      `;
      const results = parseHttpStartpageResults(html, 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].url).toContain('startpage.com');
    });
  });
});
