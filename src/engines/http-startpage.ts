/**
 * HTTP Startpage Search Engine
 * HTTP-based search using Startpage
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.js';
import { generateTimestamp, getResultType } from '../utils.js';
import { debugSaveHtml } from './base.js';

const DEBUG_HTTP_STARTPAGE = process.env.DEBUG_HTTP_STARTPAGE_SEARCH === 'true';

export async function tryHttpStartpageSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[HttpStartpageEngine] Starting HTTP-based Startpage search...`);

  try {
    const response = await axios.get('https://www.startpage.com/sp/search', {
      params: { query },
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
      `[HttpStartpageEngine] Got response with status: ${response.status}`
    );
    debugSaveHtml(response.data, 'HTTP-Startpage', query);

    const results = parseHttpStartpageResults(response.data, numResults);
    console.log(`[HttpStartpageEngine] Parsed ${results.length} results`);

    return results;
  } catch (error) {
    console.error(
      `[HttpStartpageEngine] HTTP Startpage search failed:`,
      error instanceof Error ? error.message : String(error)
    );
    throw new Error('HTTP Startpage search failed');
  }
}

export function parseHttpStartpageResults(
  html: string,
  maxResults: number
): SearchResult[] {
  console.log(
    `[HttpStartpageEngine] Parsing HTTP Startpage HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (DEBUG_HTTP_STARTPAGE) {
    console.error(`[HttpStartpageEngine] Page title: "${pageTitle}"`);
  }

  if (
    pageTitle.includes('Access Denied') ||
    pageTitle.includes('blocked') ||
    pageTitle.includes('captcha') ||
    $('.captcha').length > 0 ||
    html.includes('class="captcha"')
  ) {
    console.error(`[HttpStartpageEngine] ERROR - Bot detection detected`);
  }

  const resultSelectors = ['.result', '.w-gl__result'];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (elements.length === 0) continue;

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);

      let title = '';
      let url = '';
      let description = '';

      if (selector === '.result') {
        const titleSelectors = ['.wgl-site-title', 'h3 a', 'h2 a', 'a.title'];
        for (const ts of titleSelectors) {
          const $titleElement = $element.find(ts).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            if (ts.startsWith('.')) {
              const $urlElement = $element.find('a[href^="http"]').first();
              url = $urlElement.attr('href') || '';
            } else {
              url = $titleElement.attr('href') || '';
            }
            if (title && url) break;
          }
        }
        const $descElement = $element.find('.description, .desc').first();
        description = $descElement.text().trim();
      } else {
        const $titleElement = $element.find('h3 a, h2 a, a.title').first();
        title = $titleElement.text().trim();
        url = $titleElement.attr('href') || '';
        const $descElement = $element
          .find('.desc, .snippet, .result-description, p')
          .first();
        description = $descElement.text().trim();
      }

      if (title && url && (url.startsWith('http') || url.startsWith('/'))) {
        console.log(`[HttpStartpageEngine] Found: "${title}" -> "${url}"`);
        const cleanUrl = url.startsWith('/')
          ? `https://www.startpage.com${url}`
          : url;
        results.push({
          title,
          url: cleanUrl,
          description: description || 'No description available',
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp,
          fetchStatus: 'success',
          type: getResultType(cleanUrl),
        });
      }
    });

    if (results.length > 0) break;
  }

  console.log(`[HttpStartpageEngine] Found ${results.length} results`);
  return results;
}
