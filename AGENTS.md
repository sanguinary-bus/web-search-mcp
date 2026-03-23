# AGENTS.md - Web Search MCP Server

## Project Overview

TypeScript MCP (Model Context Protocol) server for web search with full page content extraction. Built with ESNext modules, strict TypeScript, Playwright for browser automation, and cheerio for HTML parsing.

---

## Build, Lint, and Test Commands

### Installation & Build

```bash
npm install                 # Install dependencies
npx playwright install      # Install Playwright browsers
npm run build              # Compile TypeScript to dist/
```

### Development

```bash
npm run dev                # Hot-reload with tsx watch
npm start                 # Run compiled server from dist/
```

### Code Quality

```bash
npm run lint              # Run ESLint on src/**/*.ts
npm run format            # Format all files with Prettier
```

### Testing

```bash
# Run test scripts directly (no test framework, uses dist/)
node tests/test-search.js
node tests/test-bing.js
node tests/test-brave.js
node tests/test-duckduckgo.js
node tests/test-all-engines.js

# For any test, first ensure dist/ is built
npm run build && node tests/test-search.js
```

---

## Code Style Guidelines

### TypeScript Configuration

- **Target:** ES2022
- **Module:** ESNext with Node resolution
- **Strict mode:** Enabled (noImplicitAny, strictNullChecks, etc.)
- **Module file extension:** Always use `.js` in imports (e.g., `'./utils.js'`)

### Imports

```typescript
// Named imports with .js extension
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchEngine } from './search-engine.js';
import { SomeType, AnotherType } from './types.js';

// Default imports
import js from '@eslint/js';

// Namespace imports
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
```

### Naming Conventions

| Element         | Convention                       | Example                                             |
| --------------- | -------------------------------- | --------------------------------------------------- |
| Classes         | PascalCase                       | `class WebSearchMCPServer`                          |
| Interfaces      | PascalCase                       | `interface SearchResult`                            |
| Types           | PascalCase                       | `type RegisterToolFn`                               |
| Variables       | camelCase                        | `const searchResults = []`                          |
| Constants       | camelCase or SCREAMING_SNAKE     | `const maxRetries = 3`                              |
| Private methods | camelCase with `private` keyword | `private setupTools(): void`                        |
| File names      | kebab-case or camelCase          | `search-engine.ts`, `enhanced-content-extractor.ts` |

### Type Annotations

- **Prefer explicit types** over `any` (ESLint warns on `any`)
- **Avoid non-null assertions** (`!`) when possible (ESLint warns on `!`)
- **Use Zod** for runtime validation of external inputs
- **Union types** for discriminated unions:
  ```typescript
  fetchStatus: 'success' | 'error' | 'timeout';
  ```

### Error Handling

```typescript
// Type narrowing for errors
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

// Type-safe error checking
error instanceof Error ? error.message : 'Unknown error';
```

### Async/Await

- Use `async/await` over raw Promises
- Always handle promise rejections with try/catch
- Use `Promise.all()` for parallel operations
- Cleanup in `finally` blocks:
  ```typescript
  finally {
    if (browser) {
      await browser.close();
    }
  }
  ```

### Formatting (Prettier)

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### ESLint Rules

- `@typescript-eslint/no-unused-vars`: `error`
- `@typescript-eslint/no-explicit-any`: `warn`
- `prefer-const`: `error`
- `no-var`: `error`
- `no-console`: `warn`

### Logging

- Use `[ClassName]` prefix for log messages: `console.log('[SearchEngine] Starting search...')`
- Use `console.error` for errors and warnings
- Consider KB format for large data: `${(html.length / 1024).toFixed(1)}KB`

### Graceful Shutdown

- Handle `SIGINT` and `SIGTERM` signals
- Close browser pools and connections in shutdown handlers
- Don't exit on unhandled rejections (log only)

### Module Pattern

```typescript
export class ClassName {
  private property: Type;

  constructor() {
    this.property = initialValue;
  }

  public async method(): Promise<ReturnType> {
    // implementation
  }

  private helperMethod(): void {
    // implementation
  }
}
```

---

## File Structure

```
src/
├── index.ts           # Main entry point, MCP server setup
├── search-engine.ts   # Search engine implementations
├── content-extractor.ts
├── enhanced-content-extractor.ts
├── browser-pool.ts
├── rate-limiter.ts
├── logger.ts
├── utils.ts
└── types.ts           # Shared interfaces and types

dist/                  # Compiled output (don't edit)
tests/                 # Standalone test scripts
```

---

## Common Tasks

### Adding a new MCP tool

1. Define input schema using Zod in `registerTool()` call
2. Create handler function with proper error handling
3. Register tool using `(this.server.registerTool as RegisterToolFn)()` pattern
4. Return `{ content: [{ type: 'text' as const, text: responseText }] }`

### Adding a new search engine

1. Create private async method in `SearchEngine` class
2. Return `Promise<SearchResult[]>`
3. Add to the `approaches` array in `search()` method
4. Implement HTML parsing with cheerio

### Environment Variables

| Variable             | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `MAX_CONTENT_LENGTH` | Max characters per result (default: 500000) |
| `DEFAULT_TIMEOUT`    | Request timeout in ms (default: 6000)       |
| `MAX_BROWSERS`       | Max browser instances (default: 3)          |
| `DEBUG_BING_SEARCH`  | Enable Bing debug logs                      |
| `DEBUG_HTML_PARSING` | Enable HTML parsing logs                    |
