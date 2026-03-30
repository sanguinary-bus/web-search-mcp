# AGENTS.md - Web Search MCP Server

TypeScript MCP server for web search with full page content extraction. Built with ESNext, strict TypeScript, Playwright, and cheerio.

## Build/Lint/Test Commands

```bash
npm install && npx playwright install  # Install dependencies and browsers
npm run build                         # Compile TypeScript to dist/
npm run dev                           # Hot-reload with tsx watch
npm start                             # Run compiled server from dist/
npm run lint                          # Run ESLint
npm run format                        # Format with Prettier

# Testing (no framework - runs from dist/)
npm run build && node tests/test-search.js          # All engines
npm run build && node tests/test-bing.js           # Bing only
npm run build && node tests/test-duckduckgo.js     # DuckDuckGo only
npm run build && node tests/test-brave.js          # Brave only
npm run build && node tests/test-all-engines.js    # All engines verbose
```

## Code Style

### TypeScript

- **ES2022 + ESNext modules** | **Strict mode enabled**
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
- **Discriminated unions** for status:
  ```typescript
  fetchStatus: 'success' | 'error' | 'timeout';
  ```
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

### Prettier (`.prettierrc`)

`{ "semi": true, "trailingComma": "es5", "singleQuote": true, "printWidth": 80, "tabWidth": 2, "useTabs": false }`

### ESLint

- `no-unused-vars`: error | `no-explicit-any`: warn | `prefer-const`: error
- `no-var`: error | `no-console`: warn

### Graceful Shutdown

Handle `SIGINT`/`SIGTERM`, close browser pools, don't exit on unhandled rejections.

## File Structure

```
src/
├── index.ts              # MCP server setup, tool registration
├── search-engine.ts      # Multi-engine search orchestration
├── content-extractor.ts  # HTTP-based extraction
├── enhanced-content-extractor.ts
├── browser-pool.ts       # Playwright browser management
├── rate-limiter.ts
├── logger.ts             # File logging to /tmp/
├── utils.ts              # Helpers
├── constants.ts           # Magic numbers as const objects
└── types.ts               # Interfaces and types
dist/                     # Compiled output (do not edit)
tests/                    # Standalone test scripts (*.js)
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
| `FORCE_MULTI_ENGINE_SEARCH`     | Try all engines                        | false   |
| `BROWSER_MAX_RETRIES`           | Retry attempts on timeout              | 2       |
| `BROWSER_EXTRACTION_TIMEOUT_MS` | Per-page extraction timeout            | 12000   |
| `BROWSER_GLOBAL_TIMEOUT_MS`     | Global extraction timeout              | 12000   |
| `NODE_ENV`                      | Set to `production` to strip call logs | -       |
