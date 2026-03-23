/**
 * Ecosia Search Engine
 * Browser-based search using Ecosia
 */

import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';
import type { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { TIMEOUTS } from '../constants.js';
import { debugSaveHtml } from './base.js';

export async function tryEcosiaSearch(
  query: string,
  numResults: number,
  timeout: number
): Promise<SearchResult[]> {
  console.log(`[EcosiaEngine] Starting browser-based Ecosia search...`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      console.log(`[EcosiaEngine] Search attempt ${attempt}/2`);
      const results = await tryEcosiaSearchInternal(
        browser,
        query,
        numResults,
        timeout
      );
      return results;
    } catch (error) {
      console.error(`[EcosiaEngine] Attempt ${attempt}/2 failed:`, error);
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
  throw new Error('All Ecosia search attempts failed');
}

async function tryEcosiaSearchInternal(
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
    const searchUrl = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
    console.log(`[EcosiaEngine] Navigating to Ecosia: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(TIMEOUTS.JS_RENDER_WAIT);

    const html = await page.content();
    console.log(
      `[EcosiaEngine] Got HTML (${(html.length / 1024).toFixed(1)}KB)`
    );
    debugSaveHtml(html, 'Ecosia', query);

    const results = parseEcosiaResults(html, numResults);
    console.log(`[EcosiaEngine] Parsed ${results.length} results`);

    await context.close();
    return results;
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function parseEcosiaResults(
  html: string,
  maxResults: number
): SearchResult[] {
  const debug = process.env.DEBUG_HTML_PARSING === 'true';
  console.log(
    `[EcosiaEngine] Parsing Ecosia HTML (${(html.length / 1024).toFixed(1)}KB)`
  );

  const results: SearchResult[] = [];
  const timestamp = generateTimestamp();

  try {
    const $ = cheerio.load(html);
    const scriptTag = $('script#vike_pageContext');

    if (scriptTag.length === 0) {
      console.log('[EcosiaEngine] No vike_pageContext script tag found');
      return results;
    }

    const jsonContent = scriptTag.html();
    if (!jsonContent) {
      console.log('[EcosiaEngine] vike_pageContext script tag is empty');
      return results;
    }

    const pageData = JSON.parse(jsonContent);
    const mainlineResults = pageData?.initialState?.main?.mainlineResults;

    if (!Array.isArray(mainlineResults) || mainlineResults.length === 0) {
      console.log('[EcosiaEngine] No mainlineResults array found in JSON');
      return results;
    }

    for (const item of mainlineResults) {
      if (results.length >= maxResults) break;

      if (item?.attributes?.url && item?.attributes?.title) {
        const url = item.attributes.url;
        const title = item.attributes.title;
        const description =
          item.attributes.description || 'No description available';

        if (url && title && url.startsWith('http')) {
          if (debug)
            console.log(`[EcosiaEngine] Found: "${title}" -> "${url}"`);
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
      }
    }
  } catch (error) {
    console.error('[EcosiaEngine] Ecosia parsing error:', error);
  }

  console.log(`[EcosiaEngine] Found ${results.length} results`);
  return results;
}
