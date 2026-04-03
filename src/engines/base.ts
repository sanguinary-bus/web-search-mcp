import * as fs from 'fs';
import * as path from 'path';
import { SearchResult } from '../types.js';
import { generateTimestamp } from '../utils.js';
import { QUALITY, SEARCH } from '../constants.js';

export function debugSaveHtml(
  html: string,
  engineName: string,
  query: string
): void {
  try {
    const debugDir = path.join(process.cwd(), 'logs', 'html-debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedQuery = query
      .substring(0, SEARCH.QUERY_DEBUG_TRUNCATE)
      .replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${engineName}_${sanitizedQuery}_${timestamp}.html`;
    const filepath = path.join(debugDir, filename);

    fs.writeFileSync(filepath, html, 'utf-8');
    console.log(
      `[SearchEngine] DEBUG: Saved HTML to ${filepath} (${(html.length / 1024).toFixed(1)}KB)`
    );
  } catch (error) {
    console.error(`[SearchEngine] Failed to save debug HTML:`, error);
  }
}

export function assessResultQuality(
  results: SearchResult[],
  query: string
): number {
  if (results.length === 0) {
    return 0;
  }

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2);

  if (queryWords.length === 0) {
    return QUALITY.DEFAULT_SCORE;
  }

  let totalScore = 0;

  for (const result of results) {
    const combinedText = `${result.title} ${result.description}`.toLowerCase();
    let keywordMatches = 0;

    for (const keyword of queryWords) {
      if (combinedText.includes(keyword)) {
        keywordMatches++;
      }
    }

    const resultScore = Math.min(1.0, keywordMatches / queryWords.length);

    const irrelevantPatterns = [
      /recipe/i,
      /cooking/i,
      /food/i,
      /restaurant/i,
      /menu/i,
      /weather/i,
      /temperature/i,
      /forecast/i,
      /shopping/i,
      /sale/i,
      /price/i,
      /buy/i,
      /store/i,
      /movie/i,
      /film/i,
      /tv show/i,
      /entertainment/i,
      /sports/i,
      /game/i,
      /score/i,
      /team/i,
      /fashion/i,
      /clothing/i,
      /style/i,
      /travel/i,
      /hotel/i,
      /flight/i,
      /vacation/i,
      /car/i,
      /vehicle/i,
      /automotive/i,
      /real estate/i,
      /property/i,
      /house/i,
      /apartment/i,
    ];

    let penalty = 0;
    for (const pattern of irrelevantPatterns) {
      if (pattern.test(combinedText)) {
        penalty = 0.2;
        break;
      }
    }

    totalScore += Math.max(0, resultScore - penalty);
  }

  return totalScore / results.length;
}

export function createSearchResult(
  title: string,
  url: string,
  description: string
): SearchResult {
  return {
    title,
    url,
    description,
    fullContent: '',
    contentPreview: '',
    wordCount: 0,
    timestamp: generateTimestamp(),
    fetchStatus: 'success',
  };
}
