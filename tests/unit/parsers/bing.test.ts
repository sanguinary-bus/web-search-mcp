import { describe, it, expect } from 'vitest';
import { parseBingResults } from '../../../src/engines/bing.js';

describe('Bing Parser', () => {
  describe('parseBingResults', () => {
    it('should return empty results on captcha page', () => {
      const html = `
        <html>
          <head><title>javascript tutorial - Search</title></head>
          <body>
            <div class="captcha">
              <div class="captcha_header">One last step</div>
            </div>
          </body>
        </html>
      `;
      const results = parseBingResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should return empty results on access denied page', () => {
      const html =
        '<html><head><title>Access Denied - Bing</title></head><body></body></html>';
      const results = parseBingResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should return empty results when no results found', () => {
      const html =
        '<html><head><title>Search</title></head><body></body></html>';
      const results = parseBingResults(html, 5);
      expect(results.length).toBe(0);
    });
  });
});
