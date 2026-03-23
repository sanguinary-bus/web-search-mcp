/**
 * Bing Search Engine
 * Browser-based search using Bing
 */

import * as cheerio from 'cheerio';
import type { Browser, Page } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

const DEBUG_BING = process.env.DEBUG_BING_SEARCH === 'true';

export async function tryBrowserBingSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.error(
    `[BingEngine] Starting browser-based Bing search for query: "${query}"`
  );

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      console.error(
        `[BingEngine] Attempt ${attempt}/2 - Launching Chromium browser...`
      );

      const { chromium } = await import('playwright');
      const startTime = Date.now();
      browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const launchTime = Date.now() - startTime;
      console.error(
        `[BingEngine] Browser launched in ${launchTime}ms, connected: ${browser.isConnected()}`
      );

      const results = await tryBrowserBingSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      console.error(
        `[BingEngine] Search completed with ${results.length} results`
      );
      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[BingEngine] Attempt ${attempt}/2 FAILED: ${errorMessage}`
      );

      if (DEBUG_BING) {
        console.error(`[BingEngine] Full error details:`, error);
      }

      if (attempt === 2) {
        console.error(`[BingEngine] All attempts exhausted`);
        throw error;
      }
      console.error(`[BingEngine] Waiting 500ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY));
    } finally {
      if (browser) {
        try {
          await browser.close();
          if (DEBUG_BING) {
            console.error(`[BingEngine] Browser closed successfully`);
          }
        } catch (closeError) {
          console.error(`[BingEngine] Error closing browser:`, closeError);
        }
      }
    }
  }

  throw new Error('All Bing search attempts failed');
}

async function tryBrowserBingSearchInternal(
  browser: Browser,
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  if (!browser.isConnected()) {
    console.error(`[BingEngine] Browser is not connected`);
    throw new Error('Browser is not connected');
  }

  console.error(
    `[BingEngine] Creating browser context with enhanced fingerprinting...`
  );

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      colorScheme: 'light',
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      extraHTTPHeaders: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    });

    console.error(`[BingEngine] Context created, opening new page...`);
    const page = await context.newPage();
    console.error(`[BingEngine] Page opened successfully`);

    try {
      console.error(
        `[BingEngine] Attempting enhanced search (homepage → form submission)...`
      );
      const results = await tryEnhancedBingSearch(
        page,
        query,
        numResults,
        timeout
      );
      console.error(
        `[BingEngine] Enhanced search succeeded with ${results.length} results`
      );
      await context.close();
      return results;
    } catch (enhancedError) {
      const errorMessage =
        enhancedError instanceof Error
          ? enhancedError.message
          : 'Unknown error';
      console.error(`[BingEngine] Enhanced search failed: ${errorMessage}`);

      if (DEBUG_BING) {
        console.error(
          `[BingEngine] Enhanced search error details:`,
          enhancedError
        );
      }

      console.error(`[BingEngine] Falling back to direct URL search...`);
      const results = await tryDirectBingSearch(
        page,
        query,
        numResults,
        timeout
      );
      console.error(
        `[BingEngine] Direct search succeeded with ${results.length} results`
      );
      await context.close();
      return results;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BingEngine] Internal search failed: ${errorMessage}`);

    if (DEBUG_BING) {
      console.error(`[BingEngine] Internal search error details:`, error);
    }

    throw error;
  }
}

async function tryEnhancedBingSearch(
  page: Page,
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.error(
    `[BingEngine] Enhanced search - navigating to Bing homepage...`
  );

  const startTime = Date.now();
  await page.goto('https://www.bing.com', {
    waitUntil: 'domcontentloaded',
    timeout: timeout / 2,
  });

  const loadTime = Date.now() - startTime;
  const pageTitle = await page.title();
  const currentUrl = page.url();
  console.error(
    `[BingEngine] Homepage loaded in ${loadTime}ms, title: "${pageTitle}", URL: ${currentUrl}`
  );

  await page.waitForTimeout(TIMEOUTS.RETRY_DELAY);

  try {
    console.error(`[BingEngine] Looking for search form elements...`);
    await page.waitForSelector('#sb_form_q', {
      timeout: TIMEOUTS.SELECTOR_WAIT,
    });
    console.error(
      `[BingEngine] Search box found, filling with query: "${query}"`
    );
    await page.fill('#sb_form_q', query);

    console.error(
      `[BingEngine] Clicking search button and waiting for navigation...`
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }),
      page.click('#search_icon'),
    ]);

    const searchLoadTime = Date.now() - startTime;
    const searchPageTitle = await page.title();
    const searchPageUrl = page.url();
    console.error(
      `[BingEngine] Search completed in ${searchLoadTime}ms total, title: "${searchPageTitle}", URL: ${searchPageUrl}`
    );
  } catch (formError) {
    const errorMessage =
      formError instanceof Error ? formError.message : 'Unknown error';
    console.error(
      `[BingEngine] Search form submission failed: ${errorMessage}`
    );

    if (DEBUG_BING) {
      console.error(`[BingEngine] Form error details:`, formError);
    }

    throw formError;
  }

  try {
    console.error(`[BingEngine] Waiting for search results to appear...`);
    await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
    console.error(`[BingEngine] Search results selector found`);
  } catch {
    console.error(
      `[BingEngine] Search results selector not found, proceeding with page content anyway`
    );
  }

  const html = await page.content();
  console.error(
    `[BingEngine] Got page HTML with length: ${html.length} characters`
  );
  debugSaveHtml(html, 'Bing-Enhanced', query);

  if (DEBUG_BING && html.length < 10000) {
    console.error(
      `[BingEngine] WARNING - HTML seems short, possible bot detection or error page`
    );
  }

  const results = parseBingResults(html, numResults);
  console.error(
    `[BingEngine] Enhanced search parsed ${results.length} results`
  );

  if (results.length === 0 && DEBUG_BING) {
    console.error(
      `[BingEngine] WARNING - No results found, possible parsing failure`
    );
    const sampleHtml = html.substring(0, 1000);
    console.error(`[BingEngine] Sample HTML for debugging:`, sampleHtml);
  }

  return results;
}

async function tryDirectBingSearch(
  page: Page,
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.error(`[BingEngine] Direct search with enhanced parameters...`);

  const cvid = generateConversationId();
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(numResults, 10)}&form=QBLH&sp=-1&qs=n&cvid=${cvid}`;
  console.error(`[BingEngine] Navigating to direct URL: ${searchUrl}`);

  const startTime = Date.now();
  await page.goto(searchUrl, {
    waitUntil: 'domcontentloaded',
    timeout,
  });

  const loadTime = Date.now() - startTime;
  const pageTitle = await page.title();
  const currentUrl = page.url();
  console.error(
    `[BingEngine] Direct page loaded in ${loadTime}ms, title: "${pageTitle}", URL: ${currentUrl}`
  );

  try {
    console.error(`[BingEngine] Waiting for search results to appear...`);
    await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
    console.error(`[BingEngine] Search results selector found`);
  } catch {
    console.error(
      `[BingEngine] Search results selector not found, proceeding with page content anyway`
    );
  }

  const html = await page.content();
  console.error(
    `[BingEngine] Got page HTML with length: ${html.length} characters`
  );
  debugSaveHtml(html, 'Bing-Direct', query);

  if (DEBUG_BING && html.length < 10000) {
    console.error(
      `[BingEngine] WARNING - HTML seems short, possible bot detection or error page`
    );
  }

  const results = parseBingResults(html, numResults);
  console.error(`[BingEngine] Direct search parsed ${results.length} results`);

  if (results.length === 0 && DEBUG_BING) {
    console.error(`[BingEngine] WARNING - No results found`);
    const sampleHtml = html.substring(0, 1000);
    console.error(`[BingEngine] Sample HTML for debugging:`, sampleHtml);
  }

  return results;
}

function generateConversationId(): string {
  const chars = '0123456789ABCDEF';
  let cvid = '';
  for (let i = 0; i < 32; i++) {
    cvid += chars[Math.floor(Math.random() * chars.length)];
  }
  return cvid;
}

export function parseBingResults(
  html: string,
  maxResults: number
): SearchResult[] {
  console.error(
    `[BingEngine] Parsing HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (DEBUG_BING) {
    console.error(`[BingEngine] Page title: "${pageTitle}"`);
  }

  if (
    pageTitle.includes('Access Denied') ||
    pageTitle.includes('blocked') ||
    pageTitle.includes('captcha')
  ) {
    console.error(`[BingEngine] ERROR - Bot detection detected`);
  }

  const resultSelectors = ['.b_algo', '.b_result', '.b_card'];
  let foundResults = false;

  for (const selector of resultSelectors) {
    if (foundResults && results.length >= maxResults) break;

    const elements = $(selector);
    if (elements.length === 0) continue;

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      const titleSelectors = ['h2 a', '.b_title a', 'a[data-seid]'];
      let title = '';
      let url = '';

      for (const titleSelector of titleSelectors) {
        const $titleElement = $element.find(titleSelector).first();
        if ($titleElement.length) {
          title = $titleElement.text().trim();
          url = $titleElement.attr('href') || '';
          console.log(
            `[BingEngine] Found title with ${titleSelector}: "${title}"`
          );
          break;
        }
      }

      const snippetSelectors = [
        '.b_caption p',
        '.b_snippet',
        '.b_descript',
        '.b_caption',
        '.b_caption > span',
        '.b_excerpt',
        'p',
        '.b_algo_content p',
        '.b_algo_content',
        '.b_context',
      ];
      let snippet = '';
      for (const snippetSelector of snippetSelectors) {
        const $snippetElement = $element.find(snippetSelector).first();
        if ($snippetElement.length) {
          const candidateSnippet = $snippetElement.text().trim();
          if (
            candidateSnippet.length > 20 &&
            !candidateSnippet.match(
              /^\d+\s*(min|sec|hour|day|week|month|year)/i
            )
          ) {
            snippet = candidateSnippet;
            console.log(
              `[BingEngine] Found snippet with ${snippetSelector}: "${snippet.substring(0, 100)}..."`
            );
            break;
          }
        }
      }

      if (title && url && isValidSearchUrl(url)) {
        console.log(`[BingEngine] Found: "${title}" -> "${url}"`);
        results.push({
          title,
          url: cleanBingUrl(url),
          description: snippet || 'No description available',
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp,
          fetchStatus: 'success',
        });
        foundResults = true;
      }
    });
  }

  console.log(`[BingEngine] Found ${results.length} results`);
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

function cleanBingUrl(url: string): string {
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return url;
}
