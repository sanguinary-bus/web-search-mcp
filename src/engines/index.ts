/**
 * Search Engine Modules
 *
 * This directory contains the search engine implementations extracted from search-engine.ts.
 * Each engine is in its own file.
 *
 * HTTP-based engines:
 * - duckduckgo.ts    - DuckDuckGo search (HTML endpoint)
 * - http-bing.ts     - Bing search (HTTP)
 * - http-startpage.ts - Startpage search (HTTP)
 * - http-qwant.ts    - Qwant search (HTTP)
 *
 * Browser-based engines:
 * - mojeek.ts       - Mojeek search
 * - yahoo.ts        - Yahoo search
 * - ecosia.ts       - Ecosia search
 * - searx.ts        - Searx search
 * - swisscows.ts     - Swisscows search
 * - brave.ts        - Brave search
 * - startpage.ts     - Startpage search (browser)
 * - qwant.ts        - Qwant search (browser)
 * - bing.ts         - Bing search (browser)
 *
 * Common utilities:
 * - base.ts         - Shared utilities
 */

// Common utilities
export {
  debugSaveHtml,
  assessResultQuality,
  createSearchResult,
} from './base.js';

// HTTP-based engines
export {
  tryDuckDuckGoSearch,
  parseDuckDuckGoResults,
  cleanDuckDuckGoUrl,
} from './duckduckgo.js';
export { tryHttpBingSearch, parseHttpBingResults } from './http-bing.js';
export {
  tryHttpStartpageSearch,
  parseHttpStartpageResults,
} from './http-startpage.js';
export { tryHttpQwantSearch, parseHttpQwantResults } from './http-qwant.js';

// Browser-based engines
export {
  runMojeekSearch,
  parseMojeekResults,
  tryMojeekSearch,
} from './mojeek.js';
export { tryYahooSearch, parseYahooResults, cleanSearchUrl } from './yahoo.js';
export { tryStartpageSearch, parseStartpageResults } from './startpage.js';
export { tryQwantSearch, parseQwantResults } from './qwant.js';
export { tryEcosiaSearch, parseEcosiaResults } from './ecosia.js';
export { trySearxSearch, parseSearxResults } from './searx.js';
export { trySwisscowsSearch, parseSwisscowsResults } from './swisscows.js';
export {
  tryBrowserBraveSearch,
  parseBraveResults,
  cleanBraveUrl,
} from './brave.js';
export { tryBrowserBingSearch, parseBingResults } from './bing.js';
