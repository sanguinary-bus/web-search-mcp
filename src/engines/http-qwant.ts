/**
 * HTTP Qwant Search Engine
 * HTTP-based search using Qwant
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { debugSaveHtml } from './base.js';

export async function tryHttpQwantSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[HttpQwantEngine] Starting HTTP-based Qwant search...`);

  try {
    const response = await axios.get('https://www.qwant.com/', {
      params: { q: query, t: 'web' },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout,
      validateStatus: (status: number) => status < 400,
    });

    console.log(
      `[HttpQwantEngine] Got response with status: ${response.status}`
    );
    debugSaveHtml(response.data, 'HTTP-Qwant', query);

    const results = parseHttpQwantResults(response.data, numResults);
    console.log(`[HttpQwantEngine] Parsed ${results.length} results`);

    return results;
  } catch (error) {
    console.error(
      `[HttpQwantEngine] HTTP Qwant search failed:`,
      error instanceof Error ? error.message : String(error)
    );
    throw new Error('HTTP Qwant search failed');
  }
}

export function parseHttpQwantResults(
  html: string,
  maxResults: number
): SearchResult[] {
  console.log(
    `[HttpQwantEngine] Parsing HTTP Qwant HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  // Qwant stores results in JSON within script tags
  try {
    $('script[type="application/json"]').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const scriptContent = $(element).html();
      if (!scriptContent) return;

      try {
        const data = JSON.parse(scriptContent);

        const findResults = (obj: unknown): unknown[] => {
          if (Array.isArray(obj)) {
            for (const item of obj) {
              if (
                item &&
                typeof item === 'object' &&
                'title' in item &&
                'url' in item
              ) {
                return [item];
              }
              const nested = findResults(item);
              if (nested.length > 0) return nested;
            }
          } else if (obj && typeof obj === 'object') {
            for (const key in obj) {
              const nested = findResults((obj as Record<string, unknown>)[key]);
              if (nested.length > 0) return nested;
            }
          }
          return [];
        };

        const foundResults = findResults(data) as Array<{
          title?: string;
          url?: string;
          description?: string;
          desc?: string;
        }>;
        for (const item of foundResults) {
          if (results.length >= maxResults) break;
          if (item.title && item.url && item.url.startsWith('http')) {
            results.push({
              title: item.title,
              url: item.url,
              description:
                item.description || item.desc || 'No description available',
              fullContent: '',
              contentPreview: '',
              wordCount: 0,
              timestamp,
              fetchStatus: 'success',
            });
          }
        }
      } catch {
        // Skip invalid JSON
      }
    });
  } catch (error) {
    console.error(
      `[HttpQwantEngine] JSON parsing error:`,
      error instanceof Error ? error.message : String(error)
    );
  }

  console.log(`[HttpQwantEngine] Found ${results.length} results`);
  return results;
}
