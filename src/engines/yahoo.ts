/**
 * Yahoo Search Engine
 * Browser-based search using Yahoo
 */

import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

export async function tryYahooSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[YahooEngine] Starting browser-based Yahoo search...`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      console.log(
        `[YahooEngine] Yahoo search attempt ${attempt}/2 with fresh browser`
      );
      const results = await tryYahooSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      return results;
    } catch (error) {
      console.error(
        `[YahooEngine] Yahoo search attempt ${attempt}/2 failed:`,
        error
      );
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY));
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`[YahooEngine] Error closing browser:`, closeError);
        }
      }
    }
  }

  throw new Error('All Yahoo search attempts failed');
}

async function tryYahooSearchInternal(
  browser: Browser,
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  if (!browser.isConnected()) {
    throw new Error('Browser is not connected');
  }

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  try {
    const page = await context.newPage();
    const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    console.log(`[YahooEngine] Navigating to Yahoo: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(TIMEOUTS.SHORT_DELAY);

    const html = await page.content();
    console.log(
      `[YahooEngine] Got HTML (${(html.length / 1024).toFixed(1)}KB)`
    );
    debugSaveHtml(html, 'Yahoo', query);

    const results = parseYahooResults(html, numResults);
    console.log(`[YahooEngine] Parsed ${results.length} results`);

    await context.close();
    return results;
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function parseYahooResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[YahooEngine] Parsing Yahoo HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (debug) console.log(`[YahooEngine] Yahoo page title: "${pageTitle}"`);

  if (
    pageTitle.toLowerCase().includes('captcha') ||
    pageTitle.toLowerCase().includes('blocked')
  ) {
    console.log(`[YahooEngine] Bot detection detected`);
    return results;
  }

  const resultSelectors = [
    '.algo',
    '.searchCenterMiddle li',
    '#web > ol > li',
    '[data-bkt*="result"]',
    '.dd.algo',
    '.compTitle',
  ];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (debug && elements.length > 0) {
      console.log(
        `[YahooEngine] Selector "${selector}" found ${elements.length} elements`
      );
    }

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      const titleSelectors = [
        'h3 a',
        '.title a',
        'a.ac-algo',
        'a[data-matarget]',
        'a[href*="://"]',
      ];
      let title = '';
      let url = '';

      for (const titleSelector of titleSelectors) {
        const $titleElement = $element.find(titleSelector).first();
        if ($titleElement.length) {
          title = $titleElement.text().trim();
          url = $titleElement.attr('href') || '';
          if (title && url && isValidSearchUrl(url)) {
            break;
          }
        }
      }

      const snippetSelectors = [
        '.compText',
        'p',
        '.ac-21th',
        '[class*="abstract"]',
      ];
      let snippet = '';
      for (const snippetSelector of snippetSelectors) {
        const $snippetElement = $element.find(snippetSelector).first();
        if ($snippetElement.length) {
          snippet = $snippetElement.text().trim();
          if (snippet.length > 20) break;
        }
      }

      if (title && url && isValidSearchUrl(url)) {
        results.push({
          title,
          url: cleanSearchUrl(url),
          description: snippet || 'No description available',
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

  if (debug) {
    console.log(`[YahooEngine] Total Yahoo results: ${results.length}`);
  }

  return results;
}

function isValidSearchUrl(url: string): boolean {
  return (
    url.startsWith('/url?') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.startsWith('/search?') ||
    url.startsWith('/') ||
    url.includes('google.com') ||
    url.length > 10
  );
}

export function cleanSearchUrl(url: string): string {
  try {
    if (url.includes('yahoo.com') && url.includes('RU=')) {
      const match = url.match(/RU=([^/]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    const redirectParams = ['url', 'q', 'link', 'target', 'redirect', 'goto'];
    for (const param of redirectParams) {
      const value = params.get(param);
      if (value && value.startsWith('http')) {
        return decodeURIComponent(value);
      }
    }
  } catch {
    // If URL parsing fails, return as-is
  }

  return url;
}
