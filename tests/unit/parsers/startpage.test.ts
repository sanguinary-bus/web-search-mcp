import { describe, it, expect } from 'vitest';
import { parseStartpageResults } from '../../../src/engines/startpage.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Startpage Parser', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/startpage.html');
  const html = fs.readFileSync(fixturePath, 'utf-8');

  describe('parseStartpageResults', () => {
    it('should parse results from HTML', () => {
      const results = parseStartpageResults(html, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should have valid result structure', () => {
      const results = parseStartpageResults(html, 3);

      for (const result of results) {
        expect(result.title).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.description).toBeTruthy();
        expect(result.fetchStatus).toBe('success');
        expect(result.timestamp).toBeTruthy();
      }
    });

    it('should limit results to maxResults', () => {
      const results = parseStartpageResults(html, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle HTML without results', () => {
      const html = '<html><body></body></html>';
      const results = parseStartpageResults(html, 5);
      expect(results.length).toBe(0);
    });

    it('should handle w-gl__result class', () => {
      const html = `
        <html>
          <body>
            <div class="w-gl__result">
              <h3><a href="https://test.com">Test Title</a></h3>
              <p class="desc">Test description</p>
            </div>
          </body>
        </html>
      `;
      const results = parseStartpageResults(html, 5);
      expect(results.length).toBe(1);
    });
  });
});
