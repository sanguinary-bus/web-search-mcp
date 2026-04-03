import { describe, it, expect } from 'vitest';
import {
  // tryDuckDuckGoSearch,
  tryHttpBingSearch,
  tryHttpStartpageSearch,
  // tryHttpQwantSearch,
  runMojeekSearch,
  tryYahooSearch,
  tryEcosiaSearch,
  // trySearxSearch,
  // trySwisscowsSearch,
  tryBrowserBraveSearch,
  tryBrowserBingSearch,
  tryStartpageSearch,
  // tryQwantSearch,
  assessResultQuality,
} from '../../../src/engines/index.js';
import type { SearchResult } from '../../../src/types.js';

const TEST_QUERY = 'javascript tutorial';
const NUM_RESULTS = 10;
const TIMEOUT = 20000;

interface EngineTest {
  name: string;
  method: (
    query: string,
    numResults: number,
    timeout: number
  ) => Promise<SearchResult[]>;
}

const allEngines: EngineTest[] = [
  { method: tryEcosiaSearch, name: 'Browser Ecosia' },
  { method: runMojeekSearch, name: 'Browser Mojeek' },
  { method: tryHttpBingSearch, name: 'HTTP Bing' },
  { method: tryHttpStartpageSearch, name: 'HTTP Startpage' },
  { method: tryBrowserBraveSearch, name: 'Browser Brave' },
  { method: tryYahooSearch, name: 'Browser Yahoo' },
  { method: tryBrowserBingSearch, name: 'Browser Bing' },
  { method: tryStartpageSearch, name: 'Browser Startpage' },
  // { method: trySearxSearch, name: 'Browser Searx' },
  // { method: trySwisscowsSearch, name: 'Browser Swisscows' },
  // { method: tryHttpQwantSearch, name: 'HTTP Qwant' },
  // { method: tryDuckDuckGoSearch, name: 'HTTP DuckDuckGo' },
  // { method: tryQwantSearch, name: 'Browser Qwant' },
];

describe('E2E: All Engines Combined', () => {
  it('should have tests for all 8 engines', () => {
    expect(allEngines.length).toBe(8);
  });

  it('should test engine fallback - at least one engine returns results', async () => {
    let atLeastOneWorked = false;

    for (const engine of allEngines) {
      try {
        const results = await engine.method(TEST_QUERY, NUM_RESULTS, 15000);
        if (results.length > 0) {
          atLeastOneWorked = true;
          break;
        }
      } catch {
        // Engine failed, try next one
      }
    }

    expect(atLeastOneWorked).toBe(true);
  }, 120000);
});

describe('E2E: Quality Score - All Engines', () => {
  describe('Basic Quality Assessment', () => {
    for (const engine of allEngines) {
      it(`${engine.name} should return quality score > 0`, async () => {
        const results = await engine.method(TEST_QUERY, NUM_RESULTS, TIMEOUT);
        const quality = assessResultQuality(results, TEST_QUERY);
        expect(quality).toBeGreaterThan(0);
      }, 30000);
    }
  });

  describe('Quality Comparison Between Engines', () => {
    it('should compare quality scores across all engines', async () => {
      const engineQualities: {
        name: string;
        quality: number;
        results: number;
      }[] = [];

      for (const engine of allEngines) {
        try {
          const results = await engine.method(TEST_QUERY, NUM_RESULTS, TIMEOUT);
          const quality = assessResultQuality(results, TEST_QUERY);
          engineQualities.push({
            name: engine.name,
            quality,
            results: results.length,
          });
        } catch {
          engineQualities.push({
            name: engine.name,
            quality: 0,
            results: 0,
          });
        }
      }

      const workingEngines = engineQualities.filter(e => e.results > 0);
      expect(workingEngines.length).toBeGreaterThan(0);

      const bestEngine = workingEngines.reduce((best, current) =>
        current.quality > best.quality ? current : best
      );

      console.log(
        `Quality scores: ${engineQualities
          .map(e => `${e.name}: ${e.quality.toFixed(2)} (${e.results} results)`)
          .join(', ')}`
      );
      console.log(
        `Best engine: ${bestEngine.name} with quality ${bestEngine.quality.toFixed(2)}`
      );

      expect(bestEngine.quality).toBeGreaterThan(0);
    }, 180000);
  });
});
