/**
 * Qwant Search Engine
 * Browser-based search using Qwant
 */

import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

export async function tryQwantSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[QwantEngine] Starting browser-based Qwant search...`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      console.log(`[QwantEngine] Search attempt ${attempt}/2`);
      const results = await tryQwantSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      return results;
    } catch (error) {
      console.error(`[QwantEngine] Attempt ${attempt}/2 failed:`, error);
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY));
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }
  throw new Error('All Qwant search attempts failed');
}

async function tryQwantSearchInternal(
  browser: Browser,
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  if (!browser.isConnected()) throw new Error('Browser is not connected');

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  try {
    const page = await context.newPage();
    const searchUrl = `https://www.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
    console.log(`[QwantEngine] Navigating to Qwant: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(TIMEOUTS.JS_RENDER_WAIT);

    const html = await page.content();
    console.log(
      `[QwantEngine] Got HTML (${(html.length / 1024).toFixed(1)}KB)`
    );
    debugSaveHtml(html, 'Qwant', query);

    const results = parseQwantResults(html, numResults);
    console.log(`[QwantEngine] Parsed ${results.length} results`);

    await context.close();
    return results;
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function parseQwantResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[QwantEngine] Parsing Qwant HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const resultSelectors = [
    'article[data-testid="serp-item"]',
    '[data-testid="webResult"]',
    '.result',
    'article',
    '[class*="Result"]',
  ];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (debug && elements.length > 0) {
      console.log(
        `[QwantEngine] Selector "${selector}" found ${elements.length} elements`
      );
    }

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;
      const $element = $(element);

      const titleSelectors = [
        'h3 a',
        'a[data-testid="title"]',
        'h2 a',
        'a[href^="http"]',
      ];
      let title = '';
      let url = '';

      for (const titleSelector of titleSelectors) {
        const $titleElement = $element.find(titleSelector).first();
        if ($titleElement.length) {
          title = $titleElement.text().trim();
          url = $titleElement.attr('href') || '';
          if (title && url && url.startsWith('http')) break;
        }
      }

      const descSelectors = [
        '.description',
        '.snippet',
        '.result-description',
        'p',
      ];
      let description = '';
      for (const descSelector of descSelectors) {
        const $descElement = $element.find(descSelector).first();
        if ($descElement.length) {
          description = $descElement.text().trim();
          if (description.length > 10) break;
        }
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          url,
          description: description || 'No description available',
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp,
          fetchStatus: 'success',
        });
      }
    });

    if (results.length > 0) break;
  }

  console.log(`[QwantEngine] Found ${results.length} results`);
  return results;
}
