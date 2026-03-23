import axios from 'axios';
import {
  SearchOptions,
  SearchResult,
  SearchResultWithMetadata,
} from './types.js';
import { sanitizeQuery } from './utils.js';
import { getBrowserPool, BrowserPool } from './browser-pool.js';
import { TIMEOUTS, QUALITY, SEARCH } from './constants.js';

// Import all engine functions
import {
  // HTTP-based engines
  tryDuckDuckGoSearch,
  tryHttpBingSearch,
  tryHttpStartpageSearch,
  tryHttpQwantSearch,
  // Browser-based engines
  runMojeekSearch,
  tryYahooSearch,
  tryStartpageSearch,
  tryQwantSearch,
  tryEcosiaSearch,
  trySearxSearch,
  trySwisscowsSearch,
  tryBrowserBraveSearch,
  tryBrowserBingSearch,
  // Common utilities
  assessResultQuality,
} from './engines/index.js';

export class SearchEngine {
  private browserPool: BrowserPool;

  constructor() {
    this.browserPool = getBrowserPool();
  }

  async search(options: SearchOptions): Promise<SearchResultWithMetadata> {
    const {
      query,
      numResults = SEARCH.DEFAULT_RESULTS,
      timeout = TIMEOUTS.DEFAULT,
    } = options;
    const sanitizedQuery = sanitizeQuery(query);

    console.log(
      `[SearchEngine] Starting search for query: "${sanitizedQuery}"`
    );

    try {
      console.log(`[SearchEngine] Starting search with multiple engines...`);

      const enableQualityCheck =
        process.env.ENABLE_RELEVANCE_CHECKING !== 'false';
      const qualityThreshold = parseFloat(
        process.env.RELEVANCE_THRESHOLD || String(QUALITY.MIN_ACCEPTABLE)
      );
      const forceMultiEngine = process.env.FORCE_MULTI_ENGINE_SEARCH === 'true';

      console.log(
        `[SearchEngine] Quality checking: ${enableQualityCheck}, threshold: ${qualityThreshold}, multi-engine: ${forceMultiEngine}`
      );

      // Search approaches - ordered by preference
      const approaches = [
        { method: runMojeekSearch, name: 'Browser Mojeek' },
        { method: tryYahooSearch, name: 'Browser Yahoo' },
        { method: tryEcosiaSearch, name: 'Browser Ecosia' },
        { method: trySearxSearch, name: 'Browser Searx' },
        { method: trySwisscowsSearch, name: 'Browser Swisscows' },
        { method: tryHttpBingSearch, name: 'HTTP Bing' },
        { method: tryHttpStartpageSearch, name: 'HTTP Startpage' },
        { method: tryHttpQwantSearch, name: 'HTTP Qwant' },
        { method: tryDuckDuckGoSearch, name: 'HTTP DuckDuckGo' },
        { method: tryBrowserBingSearch, name: 'Browser Bing' },
        { method: tryBrowserBraveSearch, name: 'Browser Brave' },
        { method: tryStartpageSearch, name: 'Browser Startpage' },
        { method: tryQwantSearch, name: 'Browser Qwant' },
      ];

      let bestResults: SearchResult[] = [];
      let bestEngine = 'None';
      let bestQuality = 0;

      for (let i = 0; i < approaches.length; i++) {
        const approach = approaches[i];
        try {
          console.log(
            `[SearchEngine] Attempting ${approach.name} (${i + 1}/${approaches.length})...`
          );

          const approachTimeout = Math.min(
            timeout / 3,
            TIMEOUTS.ENGINE_FALLBACK
          );
          const results = await approach.method(
            sanitizedQuery,
            numResults,
            approachTimeout
          );

          if (results.length > 0) {
            console.log(
              `[SearchEngine] Found ${results.length} results with ${approach.name}`
            );

            const qualityScore = enableQualityCheck
              ? assessResultQuality(results, sanitizedQuery)
              : 1.0;
            console.log(
              `[SearchEngine] ${approach.name} quality score: ${qualityScore.toFixed(2)}/1.0`
            );

            if (qualityScore > bestQuality) {
              bestResults = results;
              bestEngine = approach.name;
              bestQuality = qualityScore;
            }

            if (qualityScore >= QUALITY.EXCELLENT && !forceMultiEngine) {
              console.log(
                `[SearchEngine] Excellent quality results from ${approach.name}, returning immediately`
              );
              return { results, engine: approach.name };
            }

            if (
              qualityScore >= qualityThreshold &&
              approach.name !== 'Browser Bing' &&
              !forceMultiEngine
            ) {
              console.log(
                `[SearchEngine] Good quality results from ${approach.name}, using as primary`
              );
              return { results, engine: approach.name };
            }

            console.log(
              `[SearchEngine] ${approach.name} results quality: ${qualityScore.toFixed(2)}, continuing to try other engines...`
            );
          }

          if (i === approaches.length - 1) {
            if (bestQuality >= qualityThreshold || !enableQualityCheck) {
              console.log(
                `[SearchEngine] Using best results from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`
              );
              return { results: bestResults, engine: bestEngine };
            } else if (bestResults.length > 0) {
              console.log(
                `[SearchEngine] Warning: Low quality results from all engines, using best available from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`
              );
              return { results: bestResults, engine: bestEngine };
            }
          }
        } catch (error) {
          console.error(
            `[SearchEngine] ${approach.name} approach failed:`,
            error
          );
          await this.handleBrowserError(error, approach.name);
        }
      }

      console.log(
        `[SearchEngine] All approaches failed, returning empty results`
      );
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
      throw new Error(
        `Failed to perform search: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleBrowserError(
    error: unknown,
    engineName: string
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[SearchEngine] ${engineName} browser error: ${errorMessage}`
    );

    if (
      errorMessage.includes(
        'Target page, context or browser has been closed'
      ) ||
      errorMessage.includes('Browser has been closed') ||
      errorMessage.includes('Session has been closed')
    ) {
      console.log(
        `[SearchEngine] Detected browser session closure, attempting to refresh browser pool`
      );
      try {
        await this.browserPool.closeAll();
        console.log(`[SearchEngine] Browser pool refreshed for ${engineName}`);
      } catch (refreshError) {
        console.error(
          `[SearchEngine] Failed to refresh browser pool: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}`
        );
      }
    }
  }

  async closeAll(): Promise<void> {
    await this.browserPool.closeAll();
  }
}
