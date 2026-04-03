import { describe, it, expect } from 'vitest';
import { parseHttpQwantResults } from '../../../src/engines/http-qwant.js';
import * as fs from 'fs';
import * as path from 'path';

describe('HTTP Qwant Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/http-qwant.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseHttpQwantResults', () => {
    it('should parse results from HTML', () => {
      const results = parseHttpQwantResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseHttpQwantResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseHttpQwantResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without JSON data', () => {
      const html = '<html><body></body></html>';
      const results = parseHttpQwantResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should parse JSON embedded in script tags', () => {
      const html = `
        <html>
          <body>
            <script type="application/json">
              {"results": [{"title": "Test", "url": "https://test.com", "desc": "Description"}]}
            </script>
          </body>
        </html>
      `;
      const results = parseHttpQwantResults(html, 5);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Test');
    });
  });
});
