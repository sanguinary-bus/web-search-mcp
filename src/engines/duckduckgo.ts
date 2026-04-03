/**
 * DuckDuckGo Search Engine
 * HTTP-based fallback search using DuckDuckGo's HTML endpoint
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { debugSaveHtml } from './base.js';

export async function tryDuckDuckGoSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[DuckDuckGoEngine] Starting HTTP-based DuckDuckGo search...`);

  try {
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout,
      validateStatus: (status: number) => status < 400,
    });

    console.log(
      `[DuckDuckGoEngine] Got response with status: ${response.status}`
    );
    debugSaveHtml(response.data, 'DuckDuckGo', query);

    const results = parseDuckDuckGoResults(response.data, numResults);
    console.log(`[DuckDuckGoEngine] Parsed ${results.length} results`);

    return results;
  } catch (error) {
    console.error(
      `[DuckDuckGoEngine] DuckDuckGo search failed`,
      error instanceof Error ? error.message : String(error)
    );
    throw new Error('DuckDuckGo search failed');
  }
}

export function parseDuckDuckGoResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[DuckDuckGoEngine] Parsing DuckDuckGo HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  $('.result').each((_index, element) => {
    if (results.length >= maxResults) return false;

    const $element = $(element);
    const $titleElement = $element.find('.result__title a');
    const title = $titleElement.text().trim();
    const url = $titleElement.attr('href');
    const snippet = $element.find('.result__snippet').text().trim();

    if (title && url) {
      if (debug)
        console.log(`[DuckDuckGoEngine] Found: "${title}" -> "${url}"`);
      results.push({
        title,
        url: cleanDuckDuckGoUrl(url),
        description: snippet || 'No description available',
        fullContent: '',
        contentPreview: '',
        wordCount: 0,
        timestamp,
        fetchStatus: 'success',
      });
    }
  });

  console.log(`[DuckDuckGoEngine] Found ${results.length} results`);
  return results;
}

export function cleanDuckDuckGoUrl(url: string): string {
  if (url.startsWith('//duckduckgo.com/l/')) {
    try {
      const urlParams = new URLSearchParams(
        url.substring(url.indexOf('?') + 1)
      );
      const actualUrl = urlParams.get('uddg');
      if (actualUrl) {
        const decodedUrl = decodeURIComponent(actualUrl);
        console.log(`[DuckDuckGoEngine] Decoded URL: ${decodedUrl}`);
        return decodedUrl;
      }
    } catch {
      console.log(`[DuckDuckGoEngine] Failed to decode URL: ${url}`);
    }
  }

  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  return url;
}
