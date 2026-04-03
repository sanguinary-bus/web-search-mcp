# AGENTS.md - Web Search MCP Server

TypeScript MCP server for web search with full page content extraction. Built with ESNext, strict TypeScript, Playwright, and cheerio.

## Build/Lint/Test Commands

```bash
# Install dependencies and Playwright browsers
npm install && npx playwright install

# Build TypeScript to dist/
npm run build

# Development with hot-reload
npm run dev

# Run compiled server
npm start

# Lint and format
npm run lint    # ESLint with TypeScript recommended rules
npm run format  # Prettier formatting

# Run tests with Vitest
npm run test              # All tests
npm run test:watch        # Watch mode
npm run test:unit         # Unit tests only (parser tests)
npm run test:integration  # Integration tests (SearchEngine)
npm run test:e2e          # E2E tests (real browser tests for all 13 engines)
npm run test:coverage     # Tests with coverage report

# Run a single test file
npx vitest run tests/unit/parsers/duckduckgo.test.ts

# Run tests matching a pattern
npx vitest run -t "parses results"
```

## Code Style

### TypeScript Configuration

- ES2022 target, ESNext modules, strict mode enabled
- **Always use `.js` extension in imports** (e.g., `'./utils.js'`)

### Imports

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
```

### Naming Conventions

| Element                   | Convention        | Example                      |
| ------------------------- | ----------------- | ---------------------------- |
| Classes/Interfaces/Types  | PascalCase        | `class WebSearchMCPServer`   |
| Variables                 | camelCase         | `const searchResults = []`   |
| Constants (const objects) | UPPER_SNAKE_CASE  | `CONTENT_LIMITS.MAX`         |
| Private methods           | `private` keyword | `private setupTools(): void` |

### Type Annotations

- **Prefer explicit types** over `any` (warn) or `!` assertions
- **Use Zod** for external input validation
- **Discriminated unions** for status: `fetchStatus: 'success' | 'error' | 'timeout'`
- **Use `as` only for MCP SDK workarounds**

### Error Handling

```typescript
try {
  // operation
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error('Axios error:', error.response?.status);
  }
  throw new Error(
    `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}
```

### Async/Await

- Use `async/await` over raw Promises
- Handle rejections with try/catch
- Use `Promise.all()` for parallel operations
- Cleanup in `finally` blocks

### JSDoc Comments

Use JSDoc for public methods:

```typescript
/**
 * Categorizes failure reasons from failed content extractions.
 * @param failedResults - Array of SearchResult with fetchStatus='error'
 * @returns Array of categorized failure reasons with counts
 */
```

### Logging

- Use `[ClassName]` prefix: `console.log('[SearchEngine] Starting...')`
- Use `console.error` for errors
- Large data in KB: `` `${(html.length / 1024).toFixed(1)}KB` ``

### Formatting

Prettier: semi, singleQuote, printWidth 80, tabWidth 2, trailingComma es5.

## File Structure

```
src/
├── index.ts                 # MCP server setup, tool registration
├── search-engine.ts         # Multi-engine search orchestration
├── content-extractor.ts     # HTTP-based extraction
├── enhanced-content-extractor.ts
├── browser-pool.ts          # Playwright browser management
├── rate-limiter.ts, logger.ts, utils.ts, constants.ts, types.ts
└── engines/                 # 13 search engine implementations
dist/                        # Compiled output (do not edit)
tests/
├── fixtures/               # HTML fixtures for parser unit tests
├── unit/parsers/           # Parser tests for all 13 engines
└── integration/e2e/        # E2E browser tests
```

## Common Patterns

### Adding an MCP Tool

1. Define input schema using Zod in `registerTool()` call
2. Create async handler with error handling
3. Register: `(this.server.registerTool as RegisterToolFn)('tool-name', config, handler)`
4. Return `{ content: [{ type: 'text' as const, text: responseText }] }`

### Adding a Search Engine

1. Create private async method in `SearchEngine` class, return `Promise<SearchResult[]>`
2. Add to `approaches` array in `search()` method
3. Implement HTML parsing with cheerio

### Constants

All magic numbers go in `src/constants.ts` as const objects:

```typescript
export const TIMEOUTS = { DEFAULT: 10000, CONTENT_EXTRACTION: 12000 } as const;
```

## Environment Variables

| Variable                        | Purpose                                | Default |
| ------------------------------- | -------------------------------------- | ------- |
| `MAX_CONTENT_LENGTH`            | Max chars per result                   | 500000  |
| `DEFAULT_TIMEOUT`               | Request timeout (ms)                   | 12000   |
| `MAX_BROWSERS`                  | Max browser instances                  | 3       |
| `ENABLE_RELEVANCE_CHECKING`     | Enable quality scoring                 | true    |
| `RELEVANCE_THRESHOLD`           | Quality threshold (0.0-1.0)            | 0.3     |
| `BROWSER_EXTRACTION_TIMEOUT_MS` | Per-page extraction timeout            | 12000   |
| `NODE_ENV`                      | Set to `production` to strip call logs | -       |

## Graceful Shutdown

Handle `SIGINT`/`SIGTERM`, close browser pools, don't exit on unhandled rejections.
