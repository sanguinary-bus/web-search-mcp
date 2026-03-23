/**
 * HTTP Bing Search Engine
 * HTTP-based search using Bing
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { debugSaveHtml } from './base.js';

export async function tryHttpBingSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[HttpBingEngine] Starting HTTP-based Bing search...`);

  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: { q: query },
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
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      timeout,
      validateStatus: (status: number) => status < 400,
    });

    console.log(
      `[HttpBingEngine] Got response with status: ${response.status}`
    );
    debugSaveHtml(response.data, 'HTTP-Bing', query);

    const results = parseHttpBingResults(response.data, numResults);
    console.log(`[HttpBingEngine] Parsed ${results.length} results`);

    return results;
  } catch (error) {
    console.error(
      `[HttpBingEngine] HTTP Bing search failed:`,
      error instanceof Error ? error.message : String(error)
    );
    throw new Error('HTTP Bing search failed');
  }
}

export function parseHttpBingResults(
  html: string,
  maxResults: number
): SearchResult[] {
  console.log(
    `[HttpBingEngine] Parsing HTTP Bing HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  $('.b_algo').each((_index, element) => {
    if (results.length >= maxResults) return false;

    const $element = $(element);
    const $titleElement = $element.find('h2 a');
    const title = $titleElement.text().trim();
    const url = $titleElement.attr('href');
    const snippet = $element.find('.b_caption p').text().trim();

    if (title && url && url.startsWith('http')) {
      console.log(`[HttpBingEngine] Found: "${title}" -> "${url}"`);
      results.push({
        title,
        url,
        description: snippet || 'No description available',
        fullContent: '',
        contentPreview: '',
        wordCount: 0,
        timestamp,
        fetchStatus: 'success',
      });
    }
  });

  console.log(`[HttpBingEngine] Found ${results.length} results`);
  return results;
}
