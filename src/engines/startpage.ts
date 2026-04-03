/**
 * Startpage Search Engine
 * Browser-based search using Startpage
 */

import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

const DEBUG_STARTPAGE = process.env.DEBUG_STARTPAGE_SEARCH === 'true';

export async function tryStartpageSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[StartpageEngine] Starting browser-based Startpage search...`);

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
        ],
      });

      console.log(`[StartpageEngine] Search attempt ${attempt}/2`);
      const results = await tryStartpageSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      return results;
    } catch (error) {
      console.error(`[StartpageEngine] Attempt ${attempt}/2 failed:`, error);
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
  throw new Error('All Startpage search attempts failed');
}

async function tryStartpageSearchInternal(
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
    const searchUrl = `https://www.startpage.com/do/dsearch?query=${encodeURIComponent(query)}`;
    console.log(`[StartpageEngine] Navigating to Startpage: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(TIMEOUTS.JS_RENDER_WAIT);

    const html = await page.content();
    console.log(
      `[StartpageEngine] Got HTML (${(html.length / 1024).toFixed(1)}KB)`
    );
    debugSaveHtml(html, 'Startpage', query);

    const results = parseStartpageResults(html, numResults);
    console.log(`[StartpageEngine] Parsed ${results.length} results`);

    await context.close();
    return results;
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function parseStartpageResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[StartpageEngine] Parsing Startpage HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  const pageTitle = $('title').text();
  if (DEBUG_STARTPAGE) {
    console.error(`[StartpageEngine] Page title: "${pageTitle}"`);
  }

  if (
    pageTitle.includes('Access Denied') ||
    pageTitle.includes('blocked') ||
    pageTitle.includes('captcha') ||
    $('.captcha').length > 0 ||
    html.includes('class="captcha"')
  ) {
    console.error(`[StartpageEngine] ERROR - Bot detection detected`);
  }

  const resultSelectors = ['.result', '.w-gl__result'];

  for (const selector of resultSelectors) {
    if (results.length >= maxResults) break;

    const elements = $(selector);
    if (debug && elements.length > 0) {
      console.log(
        `[StartpageEngine] Selector "${selector}" found ${elements.length} elements`
      );
    }

    elements.each((_index, element) => {
      if (results.length >= maxResults) return false;
      const $element = $(element);

      let title = '';
      let url = '';
      let description = '';

      if (selector === '.result') {
        const $titleElement = $element.find('.wgl-site-title').first();
        title = $titleElement.text().trim();
        const $urlElement = $element.find('a[href^="http"]').first();
        url = $urlElement.attr('href') || '';
        const $descElement = $element.find('.description').first();
        description = $descElement.text().trim();
      } else {
        const $titleElement = $element.find('h3 a, h2 a, .title a').first();
        title = $titleElement.text().trim();
        url = $titleElement.attr('href') || '';
        const $descElement = $element
          .find('.desc, .snippet, .result-description, p')
          .first();
        description = $descElement.text().trim();
      }

      if (title && url) {
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
        });
      }
    });

    if (results.length > 0) break;
  }

  console.log(`[StartpageEngine] Found ${results.length} results`);
  return results;
}
