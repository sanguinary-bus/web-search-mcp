import axios from 'axios';
import * as cheerio from 'cheerio';
import { SearchOptions, SearchResult, SearchResultWithMetadata } from './types.js';
import { generateTimestamp, sanitizeQuery } from './utils.js';
import { BrowserPool } from './browser-pool.js';
import * as fs from 'fs';
import * as path from 'path';

export class SearchEngine {
  private browserPool: BrowserPool;

  constructor() {
    this.browserPool = new BrowserPool();
  }

  // Stealth is now automatically applied via playwright-extra's stealth plugin in browser-pool.ts

  private debugSaveHtml(html: string, engineName: string, query: string): void {
    // Temporarily always save HTML for debugging
    // if (process.env.DEBUG_SAVE_HTML !== 'true') return;
    
    try {
      const debugDir = path.join(process.cwd(), 'logs', 'html-debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedQuery = query.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${timestamp}_${engineName}_${sanitizedQuery}.html`;
      const filepath = path.join(debugDir, filename);
      
      fs.writeFileSync(filepath, html, 'utf-8');
      console.log(`[SearchEngine] DEBUG: Saved HTML to ${filepath} (${(html.length / 1024).toFixed(1)}KB)`);
    } catch (error) {
      console.error(`[SearchEngine] Failed to save debug HTML:`, error);
    }
  }

  async search(options: SearchOptions): Promise<SearchResultWithMetadata> {
    const { query, numResults = 5, timeout = 10000 } = options;
    const sanitizedQuery = sanitizeQuery(query);
    
    console.log(`[SearchEngine] Starting search for query: "${sanitizedQuery}"`);
    
    try {
      console.log(`[SearchEngine] Starting search with multiple engines...`);
        
        // Configuration from environment variables
        const enableQualityCheck = process.env.ENABLE_RELEVANCE_CHECKING !== 'false';
        const qualityThreshold = parseFloat(process.env.RELEVANCE_THRESHOLD || '0.3');
        const forceMultiEngine = process.env.FORCE_MULTI_ENGINE_SEARCH === 'true';
        const debugBrowsers = process.env.DEBUG_BROWSER_LIFECYCLE === 'true';
        
        console.log(`[SearchEngine] Quality checking: ${enableQualityCheck}, threshold: ${qualityThreshold}, multi-engine: ${forceMultiEngine}, debug: ${debugBrowsers}`);

        // Try multiple approaches to get search results, prioritizing working browser engines with stealth
        const approaches = [
          { method: this.tryMojeekSearch.bind(this), name: 'Browser Mojeek' },
          { method: this.tryYahooSearch.bind(this), name: 'Browser Yahoo' },
          { method: this.tryEcosiaSearch.bind(this), name: 'Browser Ecosia' },
          { method: this.trySearxSearch.bind(this), name: 'Browser Searx' },
          { method: this.trySwisscowsSearch.bind(this), name: 'Browser Swisscows' },
          { method: this.tryHttpBingSearch.bind(this), name: 'HTTP Bing' },
          { method: this.tryHttpStartpageSearch.bind(this), name: 'HTTP Startpage' },
          { method: this.tryHttpQwantSearch.bind(this), name: 'HTTP Qwant' },
          { method: this.tryDuckDuckGoSearch.bind(this), name: 'HTTP DuckDuckGo' },
          { method: this.tryBrowserBingSearch.bind(this), name: 'Browser Bing' },
          { method: this.tryBrowserBraveSearch.bind(this), name: 'Browser Brave' },
          { method: this.tryStartpageSearch.bind(this), name: 'Browser Startpage' },
          { method: this.tryQwantSearch.bind(this), name: 'Browser Qwant' }
        ];
        
        let bestResults: SearchResult[] = [];
        let bestEngine = 'None';
        let bestQuality = 0;
        
        for (let i = 0; i < approaches.length; i++) {
          const approach = approaches[i];
          try {
            console.log(`[SearchEngine] Attempting ${approach.name} (${i + 1}/${approaches.length})...`);
            
            // Use more aggressive timeouts for faster fallback
            const approachTimeout = Math.min(timeout / 3, 4000); // Max 4 seconds per approach for faster fallback
            const results = await approach.method(sanitizedQuery, numResults, approachTimeout);
            if (results.length > 0) {
              console.log(`[SearchEngine] Found ${results.length} results with ${approach.name}`);
              
              // Validate result quality to detect irrelevant results
              const qualityScore = enableQualityCheck ? this.assessResultQuality(results, sanitizedQuery) : 1.0;
              console.log(`[SearchEngine] ${approach.name} quality score: ${qualityScore.toFixed(2)}/1.0`);
              
              // Track the best results so far
              if (qualityScore > bestQuality) {
                bestResults = results;
                bestEngine = approach.name;
                bestQuality = qualityScore;
              }
              
              // If quality is excellent, return immediately (unless forcing multi-engine)
              if (qualityScore >= 0.8 && !forceMultiEngine) {
                console.log(`[SearchEngine] Excellent quality results from ${approach.name}, returning immediately`);
                return { results, engine: approach.name };
              }
              
              // If quality is acceptable and this isn't Bing (first engine), return
              if (qualityScore >= qualityThreshold && approach.name !== 'Browser Bing' && !forceMultiEngine) {
                console.log(`[SearchEngine] Good quality results from ${approach.name}, using as primary`);
                return { results, engine: approach.name };
              }
              
              console.log(`[SearchEngine] ${approach.name} results quality: ${qualityScore.toFixed(2)}, continuing to try other engines...`);
            }
            
            // If this is the last engine, return best available results even if quality is low
            if (i === approaches.length - 1) {
              if (bestQuality >= qualityThreshold || !enableQualityCheck) {
                console.log(`[SearchEngine] Using best results from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`);
                return { results: bestResults, engine: bestEngine };
              } else if (bestResults.length > 0) {
                console.log(`[SearchEngine] Warning: Low quality results from all engines, using best available from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`);
                return { results: bestResults, engine: bestEngine };
              }
            }
          } catch (error) {
            console.error(`[SearchEngine] ${approach.name} approach failed:`, error);
            
            // Handle browser-specific errors (no cleanup needed since each engine uses dedicated browsers)
            await this.handleBrowserError(error, approach.name);
          }
        }
      
      console.log(`[SearchEngine] All approaches failed, returning empty results`);
      return { results: [], engine: 'None' };
    } catch (error) {
      console.error('[SearchEngine] Search error:', error);
      if (axios.isAxiosError(error)) {
        console.error('[SearchEngine] Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data?.substring(0, 500),
        });
      }
      throw new Error(`Failed to perform search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }




  private async tryBrowserBraveSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Brave search with dedicated browser...`);
    
    // Try with retry mechanism
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        // Create a dedicated browser instance for Brave search only
        const { firefox } = await import('playwright');
        browser = await firefox.launch({
          headless: process.env.BROWSER_HEADLESS !== 'false',
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
          ],
        });
        
        console.log(`[SearchEngine] Brave search attempt ${attempt}/2 with fresh browser`);
        const results = await this.tryBrowserBraveSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Brave search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) {
          throw error; // Re-throw on final attempt
        }
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        // Always close the dedicated browser
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.log(`[SearchEngine] Error closing Brave browser:`, closeError);
          }
        }
      }
    }
    
    throw new Error('All Brave search attempts failed');
  }

  private async tryBrowserBraveSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    // Validate browser is still functional before proceeding
    if (!browser.isConnected()) {
      throw new Error('Browser is not connected');
    }
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      try {
        const page = await context.newPage();
        
        // Navigate to Brave search
        const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
        console.log(`[SearchEngine] Browser navigating to Brave: ${searchUrl}`);
        
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle',  // Changed from domcontentloaded to networkidle for better JS execution
          timeout: timeout
        });

        // Wait a bit for JavaScript to fully execute and render results
        await page.waitForTimeout(1500);

        // Try multiple selectors to wait for results
        const possibleSelectors = [
          '[data-type="web"]',
          'div[data-pos]',
          '#results',
          '.snippet',
          'article',
          'a[href^="http"]'  // Fallback: any external link
        ];
        
        let selectorFound = false;
        for (const selector of possibleSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            console.log(`[SearchEngine] Brave found selector: ${selector}`);
            selectorFound = true;
            break;
          } catch {
            // Continue to next selector
          }
        }
        
        if (!selectorFound) {
          console.log(`[SearchEngine] Brave WARNING: No result selectors found, proceeding with HTML parsing anyway`);
        }

        // Get the page content
        const html = await page.content();
        
        console.log(`[SearchEngine] Browser Brave got HTML with length: ${html.length}`);
        
        const results = this.parseBraveResults(html, numResults);
        console.log(`[SearchEngine] Browser Brave parsed ${results.length} results`);
        
        await context.close();
        return results;
      } catch (error) {
        // Ensure context is closed even on error
        await context.close();
        throw error;
      }
    } catch (error) {
      console.error(`[SearchEngine] Browser Brave search failed:`, error);
      throw error;
    }
  }

  private async tryBrowserBingSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = process.env.DEBUG_BING_SEARCH === 'true';
    console.error(`[SearchEngine] BING: Starting browser-based search with dedicated browser for query: "${query}"`);
    
    // Try with retry mechanism
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        console.error(`[SearchEngine] BING: Attempt ${attempt}/2 - Launching Chromium browser...`);
        
        // Create a dedicated browser instance for Bing search only
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
        console.error(`[SearchEngine] BING: Browser launched successfully in ${launchTime}ms, connected: ${browser.isConnected()}`);
        
        const results = await this.tryBrowserBingSearchInternal(browser, query, numResults, timeout);
        console.error(`[SearchEngine] BING: Search completed successfully with ${results.length} results`);
        return results;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SearchEngine] BING: Attempt ${attempt}/2 FAILED with error: ${errorMessage}`);
        
        if (debugBing) {
          console.error(`[SearchEngine] BING: Full error details:`, error);
        }
        
        if (attempt === 2) {
          console.error(`[SearchEngine] BING: All attempts exhausted, giving up`);
          throw error; // Re-throw on final attempt
        }
        // Small delay before retry
        console.error(`[SearchEngine] BING: Waiting 500ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        // Always close the dedicated browser
        if (browser) {
          try {
            await browser.close();
            if (debugBing) {
              console.error(`[SearchEngine] BING: Browser closed successfully`);
            }
          } catch (closeError) {
            console.error(`[SearchEngine] BING: Error closing browser:`, closeError);
          }
        }
      }
    }
    
    throw new Error('All Bing search attempts failed');
  }

  private async tryBrowserBingSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = process.env.DEBUG_BING_SEARCH === 'true';
    
    // Validate browser is still functional before proceeding
    if (!browser.isConnected()) {
      console.error(`[SearchEngine] BING: Browser is not connected`);
      throw new Error('Browser is not connected');
    }
    
    console.error(`[SearchEngine] BING: Creating browser context with enhanced fingerprinting...`);
    
    try {
      // Enhanced browser context with more realistic fingerprinting
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'light',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        }
      });

      console.error(`[SearchEngine] BING: Context created, opening new page...`);
      const page = await context.newPage();
      console.error(`[SearchEngine] BING: Page opened successfully`);
      
      try {
        // Try enhanced Bing search with proper web interface flow
        try {
          console.error(`[SearchEngine] BING: Attempting enhanced search (homepage → form submission)...`);
          const results = await this.tryEnhancedBingSearch(page, query, numResults, timeout);
          console.error(`[SearchEngine] BING: Enhanced search succeeded with ${results.length} results`);
          await context.close();
          return results;
        } catch (enhancedError) {
          const errorMessage = enhancedError instanceof Error ? enhancedError.message : 'Unknown error';
          console.error(`[SearchEngine] BING: Enhanced search failed: ${errorMessage}`);
          
          if (debugBing) {
            console.error(`[SearchEngine] BING: Enhanced search error details:`, enhancedError);
          }
          
          console.error(`[SearchEngine] BING: Falling back to direct URL search...`);
          
          // Fallback to direct URL approach with enhanced parameters
          const results = await this.tryDirectBingSearch(page, query, numResults, timeout);
          console.error(`[SearchEngine] BING: Direct search succeeded with ${results.length} results`);
          await context.close();
          return results;
        }
      } catch (error) {
        // Ensure context is closed even on error
        console.error(`[SearchEngine] BING: All search methods failed, closing context...`);
        await context.close();
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[SearchEngine] BING: Internal search failed: ${errorMessage}`);
      
      if (debugBing) {
        console.error(`[SearchEngine] BING: Internal search error details:`, error);
      }
      
      throw error;
    }
  }

  private async tryEnhancedBingSearch(page: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = process.env.DEBUG_BING_SEARCH === 'true';
    console.error(`[SearchEngine] BING: Enhanced search - navigating to Bing homepage...`);
    
    // Navigate to Bing homepage first to establish proper session
    const startTime = Date.now();
    await page.goto('https://www.bing.com', { 
      waitUntil: 'domcontentloaded',
      timeout: timeout / 2
    });
    
    const loadTime = Date.now() - startTime;
    const pageTitle = await page.title();
    const currentUrl = page.url();
    console.error(`[SearchEngine] BING: Homepage loaded in ${loadTime}ms, title: "${pageTitle}", URL: ${currentUrl}`);
    
    // Wait a moment for page to fully load
    await page.waitForTimeout(500);
    
    // Find and use the search box (more realistic than direct URL)
    try {
      console.error(`[SearchEngine] BING: Looking for search form elements...`);
      await page.waitForSelector('#sb_form_q', { timeout: 2000 });
      console.error(`[SearchEngine] BING: Search box found, filling with query: "${query}"`);
      await page.fill('#sb_form_q', query);
      
      console.error(`[SearchEngine] BING: Clicking search button and waiting for navigation...`);
      // Submit the search form
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeout }),
        page.click('#search_icon')
      ]);
      
      const searchLoadTime = Date.now() - startTime;
      const searchPageTitle = await page.title();
      const searchPageUrl = page.url();
      console.error(`[SearchEngine] BING: Search completed in ${searchLoadTime}ms total, title: "${searchPageTitle}", URL: ${searchPageUrl}`);
      
    } catch (formError) {
      const errorMessage = formError instanceof Error ? formError.message : 'Unknown error';
      console.error(`[SearchEngine] BING: Search form submission failed: ${errorMessage}`);
      
      if (debugBing) {
        console.error(`[SearchEngine] BING: Form error details:`, formError);
      }
      
      throw formError;
    }
    
    // Wait for search results to load
    try {
      console.error(`[SearchEngine] BING: Waiting for search results to appear...`);
      await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
      console.error(`[SearchEngine] BING: Search results selector found`);
    } catch {
      console.error(`[SearchEngine] BING: Search results selector not found, proceeding with page content anyway`);
    }

    const html = await page.content();
    console.error(`[SearchEngine] BING: Got page HTML with length: ${html.length} characters`);
    this.debugSaveHtml(html, 'Bing-Enhanced', query);
    
    if (debugBing && html.length < 10000) {
      console.error(`[SearchEngine] BING: WARNING - HTML seems short, possible bot detection or error page`);
    }
    
    const results = this.parseBingResults(html, numResults);
    console.error(`[SearchEngine] BING: Enhanced search parsed ${results.length} results`);
    
    if (results.length === 0) {
      console.error(`[SearchEngine] BING: WARNING - No results found, possible parsing failure or empty search`);
      
      if (debugBing) {
        const sampleHtml = html.substring(0, 1000);
        console.error(`[SearchEngine] BING: Sample HTML for debugging:`, sampleHtml);
      }
    }
    
    return results;
  }

  private async tryDirectBingSearch(page: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = process.env.DEBUG_BING_SEARCH === 'true';
    console.error(`[SearchEngine] BING: Direct search with enhanced parameters...`);
    
    // Generate a conversation ID (cvid) similar to what Bing uses
    const cvid = this.generateConversationId();
    
    // Construct URL with enhanced parameters based on successful manual searches
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(numResults, 10)}&form=QBLH&sp=-1&qs=n&cvid=${cvid}`;
    console.error(`[SearchEngine] BING: Navigating to direct URL: ${searchUrl}`);
    
    const startTime = Date.now();
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });
    
    const loadTime = Date.now() - startTime;
    const pageTitle = await page.title();
    const currentUrl = page.url();
    console.error(`[SearchEngine] BING: Direct page loaded in ${loadTime}ms, title: "${pageTitle}", URL: ${currentUrl}`);

    // Wait for search results to load
    try {
      console.error(`[SearchEngine] BING: Waiting for search results to appear...`);
      await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
      console.error(`[SearchEngine] BING: Search results selector found`);
    } catch {
      console.error(`[SearchEngine] BING: Search results selector not found, proceeding with page content anyway`);
    }

    const html = await page.content();
    console.error(`[SearchEngine] BING: Got page HTML with length: ${html.length} characters`);
    this.debugSaveHtml(html, 'Bing-Direct', query);
    
    if (debugBing && html.length < 10000) {
      console.error(`[SearchEngine] BING: WARNING - HTML seems short, possible bot detection or error page`);
    }
    
    const results = this.parseBingResults(html, numResults);
    console.error(`[SearchEngine] BING: Direct search parsed ${results.length} results`);
    
    if (results.length === 0) {
      console.error(`[SearchEngine] BING: WARNING - No results found, possible parsing failure or empty search`);
      
      if (debugBing) {
        const sampleHtml = html.substring(0, 1000);
        console.error(`[SearchEngine] BING: Sample HTML for debugging:`, sampleHtml);
      }
    }
    
    return results;
  }

  private generateConversationId(): string {
    // Generate a conversation ID similar to Bing's format (32 hex characters)
    const chars = '0123456789ABCDEF';
    let cvid = '';
    for (let i = 0; i < 32; i++) {
      cvid += chars[Math.floor(Math.random() * chars.length)];
    }
    return cvid;
  }


  private async tryDuckDuckGoSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying DuckDuckGo as fallback...`);
    
    try {
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: {
          q: query,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout,
        validateStatus: (status: number) => status < 400,
      });

      console.log(`[SearchEngine] DuckDuckGo got response with status: ${response.status}`);
      this.debugSaveHtml(response.data, 'DuckDuckGo', query);
      
      const results = this.parseDuckDuckGoResults(response.data, numResults);
      console.log(`[SearchEngine] DuckDuckGo parsed ${results.length} results`);
      
      return results;
    } catch {
      console.error(`[SearchEngine] DuckDuckGo search failed`);
      throw new Error('DuckDuckGo search failed');
    }
  }

  private async tryHttpBingSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying HTTP-based Bing search...`);
    
    try {
      const response = await axios.get('https://www.bing.com/search', {
        params: {
          q: query,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        timeout,
        validateStatus: (status: number) => status < 400,
      });

      console.log(`[SearchEngine] HTTP Bing got response with status: ${response.status}`);
      this.debugSaveHtml(response.data, 'HTTP-Bing', query);
      
      const results = this.parseHttpBingResults(response.data, numResults);
      console.log(`[SearchEngine] HTTP Bing parsed ${results.length} results`);
      
      return results;
    } catch (error) {
      console.error(`[SearchEngine] HTTP Bing search failed:`, error instanceof Error ? error.message : String(error));
      throw new Error('HTTP Bing search failed');
    }
  }

  private async tryHttpStartpageSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying HTTP-based Startpage search...`);
    
    try {
      const response = await axios.get('https://www.startpage.com/sp/search', {
        params: {
          query: query,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout,
        validateStatus: (status: number) => status < 400,
      });

      console.log(`[SearchEngine] HTTP Startpage got response with status: ${response.status}`);
      this.debugSaveHtml(response.data, 'HTTP-Startpage', query);
      
      const results = this.parseHttpStartpageResults(response.data, numResults);
      console.log(`[SearchEngine] HTTP Startpage parsed ${results.length} results`);
      
      return results;
    } catch (error) {
      console.error(`[SearchEngine] HTTP Startpage search failed:`, error instanceof Error ? error.message : String(error));
      throw new Error('HTTP Startpage search failed');
    }
  }

  private async tryHttpQwantSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying HTTP-based Qwant search...`);
    
    try {
      const response = await axios.get('https://www.qwant.com/', {
        params: {
          q: query,
          t: 'web',
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout,
        validateStatus: (status: number) => status < 400,
      });

      console.log(`[SearchEngine] HTTP Qwant got response with status: ${response.status}`);
      this.debugSaveHtml(response.data, 'HTTP-Qwant', query);
      
      const results = this.parseHttpQwantResults(response.data, numResults);
      console.log(`[SearchEngine] HTTP Qwant parsed ${results.length} results`);
      
      return results;
    } catch (error) {
      console.error(`[SearchEngine] HTTP Qwant search failed:`, error instanceof Error ? error.message : String(error));
      throw new Error('HTTP Qwant search failed');
    }
  }

  private parseSearchResults(html: string, maxResults: number): SearchResult[] {
    console.log(`[SearchEngine] Parsing HTML with length: ${html.length}`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Log what selectors we find - more comprehensive debugging
    const gElements = $('div.g');
    const sokobanElements = $('div[data-sokoban-container]');
    const tF2CxcElements = $('.tF2Cxc');
    const rcElements = $('.rc');
    const vedElements = $('[data-ved]');
    const h3Elements = $('h3');
    const linkElements = $('a[href]');
    
    console.log(`[SearchEngine] Found elements:`);
    console.log(`  - div.g: ${gElements.length}`);
    console.log(`  - div[data-sokoban-container]: ${sokobanElements.length}`);
    console.log(`  - .tF2Cxc: ${tF2CxcElements.length}`);
    console.log(`  - .rc: ${rcElements.length}`);
    console.log(`  - [data-ved]: ${vedElements.length}`);
    console.log(`  - h3: ${h3Elements.length}`);
    console.log(`  - a[href]: ${linkElements.length}`);
    
    // Try multiple approaches to find search results
    const searchResultSelectors = [
      'div.g',
      'div[data-sokoban-container]',
      '.tF2Cxc',
      '.rc',
      '[data-ved]',
      'div[jscontroller]'
    ];
    
    let foundResults = false;
    
    for (const selector of searchResultSelectors) {
      if (foundResults) break;
      
      console.log(`[SearchEngine] Trying selector: ${selector}`);
      const elements = $(selector);
      console.log(`[SearchEngine] Found ${elements.length} elements with selector ${selector}`);
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const $element = $(element);
        
        // Try multiple title selectors
        const titleSelectors = ['h3', '.LC20lb', '.DKV0Md', 'a[data-ved]', '.r', '.s'];
        let title = '';
        let url = '';
        
        for (const titleSelector of titleSelectors) {
          const $title = $element.find(titleSelector).first();
          if ($title.length) {
            title = $title.text().trim();
            console.log(`[SearchEngine] Found title with ${titleSelector}: "${title}"`);
            
            // Try to find the link
            const $link = $title.closest('a');
            if ($link.length) {
              url = $link.attr('href') || '';
              console.log(`[SearchEngine] Found URL: "${url}"`);
            } else {
              // Try to find any link in the element
              const $anyLink = $element.find('a[href]').first();
              if ($anyLink.length) {
                url = $anyLink.attr('href') || '';
                console.log(`[SearchEngine] Found URL from any link: "${url}"`);
              }
            }
            break;
          }
        }
        
        // Try multiple snippet selectors
        const snippetSelectors = ['.VwiC3b', '.st', '.aCOpRe', '.IsZvec', '.s3v9rd', '.MUxGbd', '.aCOpRe', '.snippet-content'];
        let snippet = '';
        
        for (const snippetSelector of snippetSelectors) {
          const $snippet = $element.find(snippetSelector).first();
          if ($snippet.length) {
            snippet = $snippet.text().trim();
            console.log(`[SearchEngine] Found snippet with ${snippetSelector}: "${snippet.substring(0, 100)}..."`);
            break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          console.log(`[SearchEngine] Adding result: ${title}`);
          results.push({
            title,
            url: this.cleanGoogleUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
          foundResults = true;
        } else {
          console.log(`[SearchEngine] Skipping result: title="${title}", url="${url}", isValid=${this.isValidSearchUrl(url)}`);
        }
      });
    }

    console.log(`[SearchEngine] Found ${results.length} results with all selectors`);

    // If still no results, try a more aggressive approach - look for any h3 with links
    if (results.length === 0) {
      console.log(`[SearchEngine] No results found, trying aggressive h3 search...`);
      $('h3').each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const $h3 = $(element);
        const title = $h3.text().trim();
        const $link = $h3.closest('a');
        
        if ($link.length && title) {
          const url = $link.attr('href') || '';
          console.log(`[SearchEngine] Aggressive search found: "${title}" -> "${url}"`);
          
          if (this.isValidSearchUrl(url)) {
            results.push({
              title,
              url: this.cleanGoogleUrl(url),
              description: 'No description available',
              fullContent: '',
              contentPreview: '',
              wordCount: 0,
              timestamp,
              fetchStatus: 'success',
            });
          }
        }
      });
      
      console.log(`[SearchEngine] Aggressive search found ${results.length} results`);
    }

    return results;
  }

  private parseBraveResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Brave HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Check page structure
    const pageTitle = $('title').text();
    if (debug) console.log(`[SearchEngine] Brave page title: "${pageTitle}"`);
    
    // Check for bot detection, CAPTCHA, or error pages
    if (pageTitle.toLowerCase().includes('captcha') || 
        pageTitle.toLowerCase().includes('blocked') ||
        pageTitle.toLowerCase().includes('access denied') ||
        html.includes('cf-browser-verification') ||
        html.includes('challenge-platform')) {
      console.log(`[SearchEngine] Brave ERROR: Bot detection or CAPTCHA detected`);
      return results;
    }

    // Comprehensive Brave result selectors (2024-2026 versions)
    const resultSelectors = [
      // Modern Brave selectors
      'div[data-type="web"]',
      'div[data-pos]',
      '#results > div',
      '.snippet',
      '.result',
      '.fdb',
      // Generic article/result containers
      'article',
      '[role="article"]',
      '.card',
      '.search-result',
      // Older Brave formats
      '.web-result',
      '.result-item'
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Brave selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Comprehensive title selectors
        const titleSelectors = [
          'a[data-testid="result-title"]',
          'h2 a',
          'h3 a',
          '.title a',
          '.result-title a',
          'a[href*="://"]',
          'a.result-header',
          'div[class*="title"] a',
          'a[class*="title"]'
        ];
        
        let title = '';
        let url = '';
        
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            if (title && url && url.startsWith('http')) {
              console.log(`[SearchEngine] Brave found with ${titleSelector}: "${title.substring(0, 50)}..." -> "${url.substring(0, 60)}..."`);
              break;
            }
          }
        }
        
        // Comprehensive snippet selectors
        const snippetSelectors = [
          '[data-testid="result-description"]',
          '.snippet-content',
          '.snippet-description',
          '.snippet',
          '.description',
          'p[class*="description"]',
          'div[class*="description"]',
          'p'
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanBraveUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) {
        console.log(`[SearchEngine] Brave selector "${selector}" found ${results.length} results, stopping search`);
        break;
      }
    }

    // Ultimate fallback: Look for ANY external links with reasonable structure
    if (results.length === 0) {
      console.log(`[SearchEngine] Brave fallback: Looking for any external links...`);
      
      $('a[href^="http"]').each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const $link = $(element);
        const url = $link.attr('href') || '';
        let title = $link.text().trim();
        
        // Skip if it's Brave's own domain or common assets
        if (url.includes('brave.com') || url.includes('.css') || url.includes('.js') || url.includes('.png')) {
          return;
        }
        
        // Find nearby description
        let snippet = '';
        const $parent = $link.parent().parent();
        const $desc = $parent.find('p, div[class*="desc"], div[class*="snippet"]').first();
        if ($desc.length) {
          snippet = $desc.text().trim();
        }
        
        // Title validation
        if (!title || title.length < 5 || title.length > 200) {
          const $heading = $link.closest('div, article').find('h2, h3, h4').first();
          if ($heading.length) {
            title = $heading.text().trim();
          }
        }
        
        if (title && title.length >= 5 && this.isValidSearchUrl(url)) {
          console.log(`[SearchEngine] Brave fallback found: "${title.substring(0, 50)}..."`);
          results.push({
            title,
            url: this.cleanBraveUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
    }

    console.log(`[SearchEngine] Brave found ${results.length} results`);
    return results;
  }

  private parseBingResults(html: string, maxResults: number): SearchResult[] {
    const debugBing = process.env.DEBUG_BING_SEARCH === 'true';
    console.error(`[SearchEngine] BING: Parsing HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Check for common Bing error indicators
    const pageTitle = $('title').text();
    if (debugBing) console.error(`[SearchEngine] BING: Page title: "${pageTitle}"`);
    
    if (pageTitle.includes('Access Denied') || pageTitle.includes('blocked') || pageTitle.includes('captcha')) {
      console.error(`[SearchEngine] BING: ERROR - Bot detection detected`);
    }

    // Bing result selectors
    const resultSelectors = [
      '.b_algo',     // Main Bing results
      '.b_result',   // Alternative Bing format
      '.b_card'      // Card format
    ];
    
    if (debugBing) console.error(`[SearchEngine] BING: Checking for result elements...`);
    
    let foundResults = false;
    
    for (const selector of resultSelectors) {
      if (foundResults && results.length >= maxResults) break;
      
      const elements = $(selector);
      if (elements.length === 0) continue;
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Try multiple title selectors for Bing
        const titleSelectors = [
          'h2 a',           // Standard Bing format
          '.b_title a',     // Alternative format
          'a[data-seid]'    // Bing specific
        ];
        
        let title = '';
        let url = '';
        
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            console.log(`[SearchEngine] Bing found title with ${titleSelector}: "${title}"`);
            break;
          }
        }
        
        // Try multiple snippet selectors for Bing
        const snippetSelectors = [
          '.b_caption p',           // Standard Bing snippet
          '.b_snippet',             // Alternative format
          '.b_descript',            // Description format
          '.b_caption',             // Caption without p tag
          '.b_caption > span',      // Caption span
          '.b_excerpt',             // Excerpt format
          'p',                      // Any paragraph in the result
          '.b_algo_content p',      // Content paragraph
          '.b_algo_content',        // Full content area
          '.b_context'              // Context information
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            const candidateSnippet = $snippetElement.text().trim();
            // Skip very short snippets or those that look like metadata
            if (candidateSnippet.length > 20 && !candidateSnippet.match(/^\d+\s*(min|sec|hour|day|week|month|year)/i)) {
              snippet = candidateSnippet;
              console.log(`[SearchEngine] Bing found snippet with ${snippetSelector}: "${snippet.substring(0, 100)}..."`);
              break;
            }
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          console.log(`[SearchEngine] Bing found: "${title}" -> "${url}"`);
          results.push({
            title,
            url: this.cleanBingUrl(url),
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

    console.log(`[SearchEngine] Bing found ${results.length} results`);
    return results;
  }

  private parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing DuckDuckGo HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // DuckDuckGo results are in .result elements
    $('.result').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      
      // Extract title and URL
      const $titleElement = $element.find('.result__title a');
      const title = $titleElement.text().trim();
      const url = $titleElement.attr('href');
      
      // Extract snippet
      const snippet = $element.find('.result__snippet').text().trim();
      
      if (title && url) {
        console.log(`[SearchEngine] DuckDuckGo found: "${title}" -> "${url}"`);
        results.push({
          title,
          url: this.cleanDuckDuckGoUrl(url),
          description: snippet || 'No description available',
          fullContent: '',
          contentPreview: '',
          wordCount: 0,
          timestamp,
          fetchStatus: 'success',
        });
      }
    });

    console.log(`[SearchEngine] DuckDuckGo found ${results.length} results`);
    return results;
  }

  private parseHttpBingResults(html: string, maxResults: number): SearchResult[] {
    console.log(`[SearchEngine] Parsing HTTP Bing HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Bing result selectors
    $('.b_algo').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      
      // Extract title and URL
      const $titleElement = $element.find('h2 a');
      const title = $titleElement.text().trim();
      const url = $titleElement.attr('href');
      
      // Extract snippet
      const snippet = $element.find('.b_caption p').text().trim();
      
      if (title && url && url.startsWith('http')) {
        console.log(`[SearchEngine] HTTP Bing found: "${title}" -> "${url}"`);
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

    console.log(`[SearchEngine] HTTP Bing found ${results.length} results`);
    return results;
  }

  private parseHttpStartpageResults(html: string, maxResults: number): SearchResult[] {
    console.log(`[SearchEngine] Parsing HTTP Startpage HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Startpage result selectors - they use class names like w-gl__result
    $('.w-gl__result').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      
      // Extract title and URL
      const $titleElement = $element.find('.w-gl__result-title');
      const title = $titleElement.text().trim();
      const url = $titleElement.attr('href');
      
      // Extract snippet
      const snippet = $element.find('.w-gl__description').text().trim();
      
      if (title && url && url.startsWith('http')) {
        console.log(`[SearchEngine] HTTP Startpage found: "${title}" -> "${url}"`);
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

    console.log(`[SearchEngine] HTTP Startpage found ${results.length} results`);
    return results;
  }

  private parseHttpQwantResults(html: string, maxResults: number): SearchResult[] {
    console.log(`[SearchEngine] Parsing HTTP Qwant HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    // Qwant stores results in JSON within script tags (similar to Ecosia)
    try {
      // Look for JSON data in script tags
      $('script[type="application/json"]').each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const scriptContent = $(element).html();
        if (!scriptContent) return;
        
        try {
          const data = JSON.parse(scriptContent);
          
          // Try to find results in the JSON structure
          // Qwant's structure may vary, so we'll look for common patterns
          const findResults = (obj: any): any[] => {
            if (Array.isArray(obj)) {
              for (const item of obj) {
                if (item.title && item.url) {
                  return [item];
                }
                const nested = findResults(item);
                if (nested.length > 0) return nested;
              }
            } else if (obj && typeof obj === 'object') {
              for (const key in obj) {
                const nested = findResults(obj[key]);
                if (nested.length > 0) return nested;
              }
            }
            return [];
          };
          
          const foundResults = findResults(data);
          for (const item of foundResults) {
            if (results.length >= maxResults) break;
            if (item.title && item.url && item.url.startsWith('http')) {
              results.push({
                title: item.title,
                url: item.url,
                description: item.description || item.desc || 'No description available',
                fullContent: '',
                contentPreview: '',
                wordCount: 0,
                timestamp,
                fetchStatus: 'success',
              });
            }
          }
        } catch {
          // Skip invalid JSON
        }
      });
    } catch (error) {
      console.error('[SearchEngine] HTTP Qwant JSON parsing error:', error instanceof Error ? error.message : String(error));
    }

    console.log(`[SearchEngine] HTTP Qwant found ${results.length} results`);
    return results;
  }

  private isValidSearchUrl(url: string): boolean {
    // Google search results URLs can be in various formats
    return url.startsWith('/url?') || 
           url.startsWith('http://') || 
           url.startsWith('https://') ||
           url.startsWith('//') ||
           url.startsWith('/search?') ||
           url.startsWith('/') ||
           url.includes('google.com') ||
           url.length > 10; // Accept any reasonably long URL
  }

  private cleanGoogleUrl(url: string): string {
    // Handle Google's redirect URLs
    if (url.startsWith('/url?')) {
      try {
        const urlParams = new URLSearchParams(url.substring(5));
        const actualUrl = urlParams.get('q') || urlParams.get('url');
        if (actualUrl) {
          return actualUrl;
        }
      } catch {
        console.warn('Failed to parse Google redirect URL:', url);
      }
    }

    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      return 'https:' + url;
    }

    return url;
  }

  private cleanBraveUrl(url: string): string {
    // Brave URLs are usually direct, but check for any redirect patterns
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    // If it's already a full URL, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    return url;
  }

  private cleanBingUrl(url: string): string {
    // Bing URLs are usually direct, but check for any redirect patterns
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    // If it's already a full URL, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    return url;
  }

  private cleanDuckDuckGoUrl(url: string): string {
    // DuckDuckGo URLs are redirect URLs that need to be decoded
    if (url.startsWith('//duckduckgo.com/l/')) {
      try {
        // Extract the uddg parameter which contains the actual URL
        const urlParams = new URLSearchParams(url.substring(url.indexOf('?') + 1));
        const actualUrl = urlParams.get('uddg');
        if (actualUrl) {
          // Decode the URL
          const decodedUrl = decodeURIComponent(actualUrl);
          console.log(`[SearchEngine] Decoded DuckDuckGo URL: ${decodedUrl}`);
          return decodedUrl;
        }
      } catch {
        console.log(`[SearchEngine] Failed to decode DuckDuckGo URL: ${url}`);
      }
    }
    
    // If it's a protocol-relative URL, add https:
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    return url;
  }

  private assessResultQuality(results: SearchResult[], originalQuery: string): number {
    if (results.length === 0) return 0;

    // Extract keywords from the original query (ignore common words)
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'group', 'members']);
    const queryWords = originalQuery.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word));

    if (queryWords.length === 0) return 0.5; // Default score if no meaningful keywords

    console.log(`[SearchEngine] Quality assessment - Query keywords: [${queryWords.join(', ')}]`);

    let totalScore = 0;
    let scoredResults = 0;

    for (const result of results) {
      const titleText = result.title.toLowerCase();
      const descText = result.description.toLowerCase();
      const urlText = result.url.toLowerCase();
      const combinedText = `${titleText} ${descText} ${urlText}`;

      // Count keyword matches
      let keywordMatches = 0;
      let phraseMatches = 0;

      // Check for exact phrase matches (higher value)
      if (queryWords.length >= 2) {
        const queryPhrases = [];
        for (let i = 0; i < queryWords.length - 1; i++) {
          queryPhrases.push(queryWords.slice(i, i + 2).join(' '));
        }
        if (queryWords.length >= 3) {
          queryPhrases.push(queryWords.slice(0, 3).join(' '));
        }

        for (const phrase of queryPhrases) {
          if (combinedText.includes(phrase)) {
            phraseMatches++;
          }
        }
      }

      // Check individual keyword matches
      for (const keyword of queryWords) {
        if (combinedText.includes(keyword)) {
          keywordMatches++;
        }
      }

      // Calculate score for this result
      const keywordRatio = keywordMatches / queryWords.length;
      const phraseBonus = phraseMatches * 0.3; // Bonus for phrase matches
      const resultScore = Math.min(1.0, keywordRatio + phraseBonus);

      // Penalty for obvious irrelevant content
      const irrelevantPatterns = [
        /recipe/i, /cooking/i, /food/i, /restaurant/i, /menu/i,
        /weather/i, /temperature/i, /forecast/i,
        /shopping/i, /sale/i, /price/i, /buy/i, /store/i,
        /movie/i, /film/i, /tv show/i, /entertainment/i,
        /sports/i, /game/i, /score/i, /team/i,
        /fashion/i, /clothing/i, /style/i,
        /travel/i, /hotel/i, /flight/i, /vacation/i,
        /car/i, /vehicle/i, /automotive/i,
        /real estate/i, /property/i, /house/i, /apartment/i
      ];

      let penalty = 0;
      for (const pattern of irrelevantPatterns) {
        if (pattern.test(combinedText)) {
          penalty += 0.2;
        }
      }

      const finalScore = Math.max(0, resultScore - penalty);
      
      console.log(`[SearchEngine] Result "${result.title.substring(0, 50)}..." - Score: ${finalScore.toFixed(2)} (keywords: ${keywordMatches}/${queryWords.length}, phrases: ${phraseMatches}, penalty: ${penalty.toFixed(2)})`);
      
      totalScore += finalScore;
      scoredResults++;
    }

    const averageScore = scoredResults > 0 ? totalScore / scoredResults : 0;
    return averageScore;
  }

  private async validateBrowserHealth(browser: any): Promise<boolean> {
    const debugBrowsers = process.env.DEBUG_BROWSER_LIFECYCLE === 'true';
    
    try {
      if (debugBrowsers) console.log(`[SearchEngine] Validating browser health...`);
      
      // Check if browser is still connected
      if (!browser.isConnected()) {
        if (debugBrowsers) console.log(`[SearchEngine] Browser is not connected`);
        return false;
      }
      
      // Try to create a simple context to test browser responsiveness
      const testContext = await browser.newContext();
      await testContext.close();
      
      if (debugBrowsers) console.log(`[SearchEngine] Browser health check passed`);
      return true;
    } catch (error) {
      console.log(`[SearchEngine] Browser health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async handleBrowserError(error: any, engineName: string, attemptNumber: number = 1): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SearchEngine] ${engineName} browser error (attempt ${attemptNumber}): ${errorMessage}`);
    
    // Check for specific browser-related errors
    if (errorMessage.includes('Target page, context or browser has been closed') ||
        errorMessage.includes('Browser has been closed') ||
        errorMessage.includes('Session has been closed')) {
      
      console.log(`[SearchEngine] Detected browser session closure, attempting to refresh browser pool`);
      
      // Try to refresh the browser pool for subsequent attempts
      try {
        await this.browserPool.closeAll();
        console.log(`[SearchEngine] Browser pool refreshed for ${engineName}`);
      } catch (refreshError) {
        console.error(`[SearchEngine] Failed to refresh browser pool: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}`);
      }
    }
  }

  async closeAll(): Promise<void> {
    await this.browserPool.closeAll();
  }

  // Yahoo Search using browser automation
  private async tryYahooSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Yahoo search...`);
    
    // Try with retry mechanism
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        // Create a dedicated browser instance for Yahoo search
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
        
        console.log(`[SearchEngine] Yahoo search attempt ${attempt}/2 with fresh browser`);
        const results = await this.tryYahooSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Yahoo search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error(`[SearchEngine] Error closing Yahoo browser:`, closeError);
          }
        }
      }
    }
    
    throw new Error('All Yahoo search attempts failed');
  }

  private async tryYahooSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) {
      throw new Error('Browser is not connected');
    }
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });

      try {
        const page = await context.newPage();
        
        const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
        console.log(`[SearchEngine] Browser navigating to Yahoo: ${searchUrl}`);
        
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle',
          timeout: timeout
        });

        await page.waitForTimeout(1000);

        const html = await page.content();
        console.log(`[SearchEngine] Yahoo got HTML (${(html.length / 1024).toFixed(1)}KB)`);
        this.debugSaveHtml(html, 'Yahoo', query);
        
        const results = this.parseYahooResults(html, numResults);
        console.log(`[SearchEngine] Yahoo parsed ${results.length} results`);
        
        await context.close();
        return results;
      } catch (error) {
        await context.close();
        throw error;
      }
    } catch (error) {
      console.error(`[SearchEngine] Yahoo search failed:`, error);
      throw error;
    }
  }

  private parseYahooResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Yahoo HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const pageTitle = $('title').text();
    if (debug) console.log(`[SearchEngine] Yahoo page title: "${pageTitle}"`);
    
    // Check for blocks
    if (pageTitle.toLowerCase().includes('captcha') || 
        pageTitle.toLowerCase().includes('blocked')) {
      console.log(`[SearchEngine] Yahoo ERROR: Bot detection detected`);
      return results;
    }

    // Yahoo result selectors
    const resultSelectors = [
      '.algo',                    // Main Yahoo organic results
      '.searchCenterMiddle li',   // Alternative format
      '#web > ol > li',          // Direct web results
      '[data-bkt*="result"]',    // Data attribute results
      '.dd.algo',                // Desktop results
      '.compTitle'               // Component title results
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Yahoo selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Find title and URL
        const titleSelectors = [
          'h3 a',
          '.title a',
          'a.ac-algo',
          'a[data-matarget]',
          'a[href*="://"]'
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
        
        // Find snippet
        const snippetSelectors = [
          '.compText',
          'p',
          '.ac-21th',
          '[class*="abstract"]'
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) {
        if (debug) console.log(`[SearchEngine] Yahoo selector "${selector}" found ${results.length} results`);
        break;
      }
    }

    // Fallback: Look for any reasonable links
    if (results.length === 0) {
      if (debug) console.log(`[SearchEngine] Yahoo fallback: Looking for any external links...`);
      
      $('a[href^="http"]').each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const $link = $(element);
        const url = $link.attr('href') || '';
        let title = $link.text().trim();
        
        // Skip Yahoo's own domains
        if (url.includes('yahoo.com') || url.includes('.css') || url.includes('.js')) {
          return;
        }
        
        // Find nearby description
        let snippet = '';
        const $parent = $link.closest('div, li, article');
        const $desc = $parent.find('p, span, div').filter((_i, el) => {
          const text = $(el).text().trim();
          return text.length > 30 && text.length < 300;
        }).first();
        
        if ($desc.length) {
          snippet = $desc.text().trim();
        }
        
        if (title && title.length >= 5 && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
    }

    console.log(`[SearchEngine] Yahoo found ${results.length} results`);
    return results;
  }

  // Startpage Search (uses Google results, privacy-focused)
  private async tryStartpageSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Startpage search...`);
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({
          headless: process.env.BROWSER_HEADLESS !== 'false',
          args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'],
        });
        
        console.log(`[SearchEngine] Startpage search attempt ${attempt}/2`);
        const results = await this.tryStartpageSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Startpage search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Startpage search attempts failed');
  }

  private async tryStartpageSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.startpage.com/do/dsearch?query=${encodeURIComponent(query)}`;
      console.log(`[SearchEngine] Navigating to Startpage: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(1500);

      const html = await page.content();
      console.log(`[SearchEngine] Startpage got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Startpage', query);
      
      const results = this.parseStartpageResults(html, numResults);
      console.log(`[SearchEngine] Startpage parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseStartpageResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Startpage HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const resultSelectors = [
      '.w-gl__result',           // Main Startpage results
      '.result',                 // Alternative
      'article',                 // Article format
      '[data-testid="result"]'   // Test ID format
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Startpage selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        const $element = $(element);
        
        const titleSelectors = ['h2 a', 'h3 a', '.w-gl__result-title a', 'a.w-gl__result-url'];
        let title = '', url = '';
        
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            if (title && url && url.startsWith('http')) break;
          }
        }
        
        const snippetSelectors = ['.w-gl__description', 'p', '.result-abstract'];
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '', contentPreview: '', wordCount: 0, timestamp, fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) break;
    }

    console.log(`[SearchEngine] Startpage found ${results.length} results`);
    return results;
  }

  // Qwant Search (European search engine)
  private async tryQwantSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Qwant search...`);
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({
          headless: process.env.BROWSER_HEADLESS !== 'false',
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        
        console.log(`[SearchEngine] Qwant search attempt ${attempt}/2`);
        const results = await this.tryQwantSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Qwant search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Qwant search attempts failed');
  }

  private async tryQwantSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
      console.log(`[SearchEngine] Navigating to Qwant: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(2000); // Qwant needs more time for JS

      const html = await page.content();
      console.log(`[SearchEngine] Qwant got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Qwant', query);
      
      const results = this.parseQwantResults(html, numResults);
      console.log(`[SearchEngine] Qwant parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseQwantResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Qwant HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const resultSelectors = [
      'article[data-testid="serp-item"]',  // Main Qwant results
      '[data-testid="webResult"]',
      '.result',
      'article',
      '[class*="Result"]'
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Qwant selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        const $element = $(element);
        
        const titleSelectors = ['h3 a', 'a[data-testid="title"]', 'h2 a', 'a[href^="http"]'];
        let title = '', url = '';
        
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            if (title && url && url.startsWith('http')) break;
          }
        }
        
        const snippetSelectors = ['p[data-testid="description"]', 'p', '.description', 'div[class*="desc"]'];
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '', contentPreview: '', wordCount: 0, timestamp, fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) break;
    }

    console.log(`[SearchEngine] Qwant found ${results.length} results`);
    return results;
  }

  // Ecosia Search (tree-planting search engine, uses Bing results)
  private async tryEcosiaSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Ecosia search...`);
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({
          headless: process.env.BROWSER_HEADLESS !== 'false',
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        
        console.log(`[SearchEngine] Ecosia search attempt ${attempt}/2`);
        const results = await this.tryEcosiaSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Ecosia search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Ecosia search attempts failed');
  }

  private async tryEcosiaSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
      console.log(`[SearchEngine] Navigating to Ecosia: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(1500);

      const html = await page.content();
      console.log(`[SearchEngine] Ecosia got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Ecosia', query);
      
      const results = this.parseEcosiaResults(html, numResults);
      console.log(`[SearchEngine] Ecosia parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseEcosiaResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Ecosia HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    try {
      // Ecosia is a JavaScript SPA that embeds results in JSON within a script tag
      const $ = cheerio.load(html);
      const scriptTag = $('script#vike_pageContext');
      
      if (scriptTag.length === 0) {
        console.log('[SearchEngine] Ecosia: No vike_pageContext script tag found');
        return results;
      }

      const jsonContent = scriptTag.html();
      if (!jsonContent) {
        console.log('[SearchEngine] Ecosia: vike_pageContext script tag is empty');
        return results;
      }

      const pageData = JSON.parse(jsonContent);
      
      // Navigate to the results array: initialState.main.mainlineResults
      const mainlineResults = pageData?.initialState?.main?.mainlineResults;
      if (!Array.isArray(mainlineResults) || mainlineResults.length === 0) {
        console.log('[SearchEngine] Ecosia: No mainlineResults array found in JSON');
        return results;
      }

      // mainlineResults is an array of arrays, flatten it
      const allResults = mainlineResults.flat();
      
      if (debug) {
        console.log(`[SearchEngine] Ecosia: Found ${allResults.length} total items in mainlineResults`);
      }

      // Filter for web results and map to SearchResult format
      for (const item of allResults) {
        if (results.length >= maxResults) break;
        
        // Only process web results (skip ads, videos, etc.)
        if (item.type !== 'web') continue;
        
        const title = item.title?.trim();
        const url = item.url?.trim();
        const description = item.description?.trim();
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: description || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      }

      console.log(`[SearchEngine] Ecosia found ${results.length} results`);
      
    } catch (error) {
      console.error('[SearchEngine] Ecosia JSON parsing error:', error instanceof Error ? error.message : String(error));
    }

    return results;
  }

  // ==================== Mojeek Search ====================
  
  private async tryMojeekSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Mojeek search...`);
    
    // Try with retry mechanism
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
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
        
        console.log(`[SearchEngine] Mojeek search attempt ${attempt}/2`);
        const results = await this.tryMojeekSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Mojeek search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Mojeek search attempts failed');
  }

  private async tryMojeekSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      const searchUrl = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
      console.log(`[SearchEngine] Navigating to Mojeek: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(1500);

      const html = await page.content();
      console.log(`[SearchEngine] Mojeek got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Mojeek', query);
      
      const results = this.parseMojeekResults(html, numResults);
      console.log(`[SearchEngine] Mojeek parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseMojeekResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Mojeek HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const pageTitle = $('title').text();
    if (debug) console.log(`[SearchEngine] Mojeek page title: "${pageTitle}"`);

    // Mojeek result selectors
    const resultSelectors = [
      'li.result',              // Main Mojeek results
      'ul.results-standard > li',
      '.result-item',
      '[class*="result"]'
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Mojeek selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Find title and URL
        const titleSelectors = [
          'h2 a',
          'a.title',
          '.result-title a',
          'a[href^="http"]'
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
        
        // Find snippet
        const snippetSelectors = [
          'p.s',
          '.result-snippet',
          'p',
          '.desc'
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) {
        if (debug) console.log(`[SearchEngine] Mojeek selector "${selector}" found ${results.length} results`);
        break;
      }
    }

    return results;
  }

  // ==================== Searx Search ====================
  
  private async trySearxSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Searx search...`);
    
    // Use searx.be as a reliable public instance
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
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
        
        console.log(`[SearchEngine] Searx search attempt ${attempt}/2`);
        const results = await this.trySearxSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Searx search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Searx search attempts failed');
  }

  private async trySearxSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      // Using searx.be as primary instance
      const searchUrl = `https://searx.be/search?q=${encodeURIComponent(query)}&categories=general`;
      console.log(`[SearchEngine] Navigating to Searx: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(1500);

      const html = await page.content();
      console.log(`[SearchEngine] Searx got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Searx', query);
      
      const results = this.parseSearxResults(html, numResults);
      console.log(`[SearchEngine] Searx parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseSearxResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Searx HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const pageTitle = $('title').text();
    if (debug) console.log(`[SearchEngine] Searx page title: "${pageTitle}"`);

    // Searx result selectors
    const resultSelectors = [
      'article.result',          // Main Searx results
      '.result',
      '#urls article',
      '[class*="result"]'
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Searx selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Find title and URL
        const titleSelectors = [
          'h3 a',
          'a.url_wrapper',
          '.result__title a',
          'a[href^="http"]'
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
        
        // Find snippet
        const snippetSelectors = [
          '.result__content',
          '.content',
          'p',
          '.result-desc'
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) {
        if (debug) console.log(`[SearchEngine] Searx selector "${selector}" found ${results.length} results`);
        break;
      }
    }

    return results;
  }

  // ==================== Swisscows Search ====================
  
  private async trySwisscowsSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Swisscows search...`);
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
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
        
        console.log(`[SearchEngine] Swisscows search attempt ${attempt}/2`);
        const results = await this.trySwisscowsSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Swisscows search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        if (browser) {
          try { await browser.close(); } catch {}
        }
      }
    }
    throw new Error('All Swisscows search attempts failed');
  }

  private async trySwisscowsSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    try {
      const page = await context.newPage();
      const searchUrl = `https://swisscows.com/en/web?query=${encodeURIComponent(query)}`;
      console.log(`[SearchEngine] Navigating to Swisscows: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });
      await page.waitForTimeout(2000); // Swisscows needs more time for rendering

      const html = await page.content();
      console.log(`[SearchEngine] Swisscows got HTML (${(html.length / 1024).toFixed(1)}KB)`);
      this.debugSaveHtml(html, 'Swisscows', query);
      
      const results = this.parseSwisscowsResults(html, numResults);
      console.log(`[SearchEngine] Swisscows parsed ${results.length} results`);
      
      await context.close();
      return results;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  private parseSwisscowsResults(html: string, maxResults: number): SearchResult[] {
    const debug = process.env.DEBUG_HTML_PARSING === 'true';
    console.log(`[SearchEngine] Parsing Swisscows HTML (${(html.length / 1024).toFixed(1)}KB)`);
    
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    const pageTitle = $('title').text();
    if (debug) console.log(`[SearchEngine] Swisscows page title: "${pageTitle}"`);

    // Swisscows result selectors
    const resultSelectors = [
      'article.web-result',      // Main Swisscows results
      '.result-item',
      'article',
      '[class*="result"]'
    ];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (debug && elements.length > 0) {
        console.log(`[SearchEngine] Swisscows selector "${selector}" found ${elements.length} elements`);
      }
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;

        const $element = $(element);
        
        // Find title and URL
        const titleSelectors = [
          'h2 a',
          'a.title',
          '.result-title a',
          'a[href^="http"]'
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
        
        // Find snippet
        const snippetSelectors = [
          '.description',
          'p.desc',
          'p',
          '.result-desc'
        ];
        
        let snippet = '';
        for (const snippetSelector of snippetSelectors) {
          const $snippetElement = $element.find(snippetSelector).first();
          if ($snippetElement.length) {
            snippet = $snippetElement.text().trim();
            if (snippet.length > 20) break;
          }
        }
        
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: this.cleanSearchUrl(url),
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success',
          });
        }
      });
      
      if (results.length > 0) {
        if (debug) console.log(`[SearchEngine] Swisscows selector "${selector}" found ${results.length} results`);
        break;
      }
    }

    return results;
  }

  private cleanSearchUrl(url: string): string {
    // Generic URL cleaner for various search engines
    try {
      // Handle Yahoo redirect URLs
      if (url.includes('yahoo.com') && url.includes('RU=')) {
        const match = url.match(/RU=([^/]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      
      // Handle other redirect patterns
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      
      // Common redirect parameter names
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
}

