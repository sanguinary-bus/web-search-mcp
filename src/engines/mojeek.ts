/**
 * Mojeek Search Engine
 * Browser-based search using Mojeek
 */

import * as cheerio from 'cheerio';
import type { Browser, Page } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

export interface MojeekEngineConfig {
  browser: Browser;
  page: Page;
  query: string;
  numResults: number;
  timeout: number;
}

export async function tryMojeekSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<{ browser: Browser; page: Page }> {
  console.log(`[MojeekEngine] Starting browser-based Mojeek search...`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const searchUrl = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  console.log(`[MojeekEngine] Navigating to Mojeek: ${searchUrl}`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(TIMEOUTS.JS_RENDER_WAIT);

  return { browser, page };
}

export function parseMojeekResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[MojeekEngine] Parsing Mojeek HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (debug) console.log(`[MojeekEngine] Mojeek page title: "${pageTitle}"`);

  const resultSelectors = [
    'li.result',
    'ul.results-standard > li',
    '.result-item',
    '[class*="result"]',
  ];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (debug && elements.length > 0) {
      console.log(
        `[MojeekEngine] Mojeek selector "${selector}" found ${elements.length} elements`
      );
    }

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);

      const titleSelectors = [
        'h2 a',
        'a.title',
        '.result-title a',
        'a[href^="http"]',
      ];
      let title = '';
      let url = '';

      for (const titleSelector of titleSelectors) {
        const $titleElement = $element.find(titleSelector).first();
        if ($titleElement.length) {
          title = $titleElement.text().trim();
          url = $titleElement.attr('href') || '';
          if (title && url && url.startsWith('http')) {
            break;
          }
        }
      }

      const descriptionSelectors = [
        'p.s',
        '.result-desc',
        '.snippet',
        '.description',
        'p',
      ];
      let description = '';

      for (const descSelector of descriptionSelectors) {
        const $descElement = $element.find(descSelector).first();
        if ($descElement.length) {
          description = $descElement.text().trim();
          if (description.length > 20) {
            break;
          }
        }
      }

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          url,
          description,
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp,
          fetchStatus: 'success',
        });
      }
    });
  }

  if (debug) {
    console.log(`[MojeekEngine] Total Mojeek results: ${results.length}`);
    if (results.length > 0) {
      console.log(
        `[MojeekEngine] First result: "${results[0].title.substring(0, 50)}..."`
      );
    }
  }

  return results;
}

export async function runMojeekSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      console.log(`[MojeekEngine] Mojeek search attempt ${attempt}/2`);
      const result = await tryMojeekSearch(query, numResults, timeout);
      browser = result.browser;

      const html = await result.page.content();
      console.log(
        `[MojeekEngine] Mojeek got HTML (${(html.length / 1024).toFixed(1)}KB)`
      );
      debugSaveHtml(html, 'Mojeek', query);

      const results = parseMojeekResults(html, numResults);
      console.log(`[MojeekEngine] Mojeek parsed ${results.length} results`);

      await result.page.context().close();
      await browser.close();
      return results;
    } catch (error) {
      console.error(
        `[MojeekEngine] Mojeek search attempt ${attempt}/2 failed:`,
        error
      );
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
  throw new Error('All Mojeek search attempts failed');
}
