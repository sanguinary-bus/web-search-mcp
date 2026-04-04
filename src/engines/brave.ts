/**
 * Brave Search Engine
 * Browser-based search using Brave
 */

import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp, getResultType } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

export async function tryBrowserBraveSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[BraveEngine] Starting browser-based Brave search...`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      const { firefox } = await import('playwright');
      browser = await firefox.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      console.log(`[BraveEngine] Search attempt ${attempt}/2`);
      const results = await tryBrowserBraveSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      return results;
    } catch (error) {
      console.error(`[BraveEngine] Attempt ${attempt}/2 failed:`, error);
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY));
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`[BraveEngine] Error closing browser:`, closeError);
        }
      }
    }
  }
  throw new Error('All Brave search attempts failed');
}

async function tryBrowserBraveSearchInternal(
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
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  try {
    const page = await context.newPage();
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    console.log(`[BraveEngine] Navigating to Brave: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(TIMEOUTS.JS_RENDER_WAIT);

    const possibleSelectors = [
      '[data-type="web"]',
      'div[data-pos]',
      '#results',
      '.snippet',
      'article',
      'a[href^="http"]',
    ];
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, {
          timeout: TIMEOUTS.SELECTOR_WAIT,
        });
        console.log(`[BraveEngine] Found selector: ${selector}`);
        break;
      } catch {
        // Try next selector
      }
    }

    const html = await page.content();
    console.log(
      `[BraveEngine] Got HTML (${(html.length / 1024).toFixed(1)}KB)`
    );
    debugSaveHtml(html, 'Brave', query);

    const results = parseBraveResults(html, numResults);
    console.log(`[BraveEngine] Parsed ${results.length} results`);

    await context.close();
    return results;
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function parseBraveResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[BraveEngine] Parsing Brave HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (debug) console.log(`[BraveEngine] Page title: "${pageTitle}"`);

  if (
    pageTitle.toLowerCase().includes('captcha') ||
    pageTitle.toLowerCase().includes('blocked') ||
    pageTitle.toLowerCase().includes('access denied') ||
    html.includes('cf-browser-verification') ||
    html.includes('challenge-platform')
  ) {
    console.log(`[BraveEngine] Bot detection or CAPTCHA detected`);
    return results;
  }

  const resultSelectors = [
    'div[data-type="web"]',
    'div[data-pos]',
    '#results > div',
    '.snippet',
    '.result',
    '.fdb',
    'article',
    '[role="article"]',
    '.card',
    '.search-result',
    '.web-result',
    '.result-item',
  ];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (debug && elements.length > 0) {
      console.log(
        `[BraveEngine] Selector "${selector}" found ${elements.length} elements`
      );
    }

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      const titleSelectors = [
        'a[data-testid="result-title"]',
        'h2 a',
        'h3 a',
        '.title a',
        '.result-title a',
        'a[href*="://"]',
        'a.result-header',
        'div[class*="title"] a',
        'a[class*="title"]',
      ];
      let title = '';
      let url = '';

      for (const titleSelector of titleSelectors) {
        const $titleElement = $element.find(titleSelector).first();
        if ($titleElement.length) {
          title = $titleElement.text().trim();
          url = $titleElement.attr('href') || '';
          if (title && url && isValidSearchUrl(url)) {
            if (debug)
              console.log(
                `[BraveEngine] Found with ${titleSelector}: "${title.substring(0, 50)}..."`
              );
            break;
          }
        }
      }

      const snippetSelectors = [
        '[data-testid="result-description"]',
        '.snippet-content',
        '.snippet-description',
        '.snippet',
        '.description',
        'p[class*="description"]',
        'div[class*="description"]',
        'p',
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
        const cleanUrl = cleanBraveUrl(url);
        results.push({
          title,
          url: cleanUrl,
          description: snippet || 'No description available',
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

  console.log(`[BraveEngine] Found ${results.length} results`);
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

export function cleanBraveUrl(url: string): string {
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return url;
}
