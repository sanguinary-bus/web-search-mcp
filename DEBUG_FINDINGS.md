# Search Engine Debug Findings - February 15, 2026

## Search Tests Performed

### Test 1: "best alternative search engines 2026 Mojeek Yandex Swisscows"

**Status:** Poor Quality (0.11/1.0 score)

**Engines Attempted:**

1. **Browser Bing** - ✅ Returned 10 results
   - **Problem:** Completely irrelevant results (English grammar Q&A from Stack Exchange)
   - Quality: 0.11/1.0 (only 1/8 keywords matched)
   - All results about "best" grammar usage, not about search engines
2. **Browser Brave** - ❌ CAPTCHA blocked
   - HTML: 84.5 KB
   - Title: "PoW Captcha - Brave Search"
   - Bot detection triggered
3. **Axios DuckDuckGo** - ❌ Rate limited
   - HTTP Status: 202
   - HTML: 14.3 KB (should be ~36 KB for results)
   - Parsed: 0 results

**Result:** Returned Bing's irrelevant results as "best available"

---

### Test 2: "privacy search engines automation friendly scraping"

**Status:** Zero Results

**Engines Attempted:**

1. **Browser Bing** - ❌ No results found
   - HTML: 207 KB returned
   - Parsed: 0 results
   - Possible bot detection or empty search

2. **Browser Brave** - ❌ CAPTCHA blocked
   - Same PoW CAPTCHA issue
3. **Axios DuckDuckGo** - ❌ Rate limited
   - HTTP Status: 202
   - Parsed: 0 results

**Result:** All engines failed - returned 0 results

---

## Critical Issues Discovered

### 1. Only 3 Engines Active

**Problem:** Logs show "(1/3)" instead of "(1/7)"

- Old compiled code was running in GOOSE
- The 4 new engines (Yahoo, Startpage, Qwant, Ecosia) weren't being used
- **Fixed:** Just rebuilt with `npm run build`
- **Action Required:** Restart GOOSE to load new build

### 2. Bing Returns Irrelevant Results

**Problem:** Bing's results don't match query intent

- Search: "best alternative search engines 2026 Mojeek Yandex Swisscows"
- Results: English grammar discussions about the word "best"
- This suggests Bing might be:
  - Ignoring technical keywords
  - Applying heavy personalization/filtering
  - Experiencing locale-specific issues

### 3. Brave Always CAPTCHA

**Problem:** Every Brave search hits PoW (Proof of Work) CAPTCHA

- Even with Firefox browser
- Even with 1.5s wait time
- HTML size: consistently 84KB
- **Possible causes:**
  - Playwright detection
  - Too-fast navigation
  - Missing cookies/session
  - Need more stealth techniques

### 4. DuckDuckGo Rate Limited

**Problem:** HTTP 202 status = "Please slow down"

- HTML: 14KB (rate limit page) vs 36KB (results page)
- Happening despite using HTTP requests (not browser)
- **Possible causes:**
  - IP-based rate limiting
  - Too many recent requests
  - Need delay between searches

---

## Missing: HTML Debug Files

**Problem:** No HTML files saved for inspection

- Directory `/mnt/media2/DEV2/web-search-mcp/logs/html-debug/` doesn't exist
- DEBUG_SAVE_HTML environment variable not enabled

**Solution:** Add to GOOSE MCP config:

```json
{
  "mcpServers": {
    "web-search-mcp": {
      "command": "node",
      "args": ["/mnt/media2/DEV2/web-search-mcp/dist/index.js"],
      "env": {
        "DEBUG_SAVE_HTML": "true",
        "DEBUG_HTML_PARSING": "true"
      }
    }
  }
}
```

---

## Recommended Next Steps

### Immediate Actions:

1. **Restart GOOSE** to load newly compiled code with all 7 engines
2. **Enable DEBUG flags** in GOOSE config (see above)
3. **Run test searches** with simpler, clear queries:
   - "rust programming language"
   - "python tutorial"
   - "javascript documentation"

### After HTML Collection:

4. **Inspect HTML files** in `logs/html-debug/`
5. **Analyze each engine's response:**
   - Bing: Why wrong results? Check if HTML contains correct results but parser missed them
   - Brave: What does CAPTCHA page look like? Can we detect sooner?
   - DuckDuckGo: What's in the 202 page? Rate limit message?
   - Yahoo/Startpage/Qwant/Ecosia: Do these work better?

### Potential Fixes to Test:

- **For Bing:** Try different search URLs, parameters, or locale settings
- **For Brave:** Add more delays, randomized timing, cookie management
- **For DuckDuckGo:** Add delays between searches (currently none)
- **For new engines:** Test if they work better than the original 3

---

## Engine Reliability Summary

| Engine     | Status            | Issue            | Quality  |
| ---------- | ----------------- | ---------------- | -------- |
| Bing       | 🟡 Works but poor | Wrong results    | 0.11/1.0 |
| Brave      | 🔴 Blocked        | CAPTCHA          | N/A      |
| Yahoo      | ⚪ Untested       | Not in old build | N/A      |
| Startpage  | ⚪ Untested       | Not in old build | N/A      |
| Qwant      | ⚪ Untested       | Not in old build | N/A      |
| Ecosia     | ⚪ Untested       | Not in old build | N/A      |
| DuckDuckGo | 🔴 Blocked        | Rate limited     | N/A      |

**Current Working Engines:** 0/7 (Bing has poor relevance)

---

## Files Modified Today

- ✅ `src/search-engine.ts` - Added all debugSaveHtml() calls
- ✅ `README.md` - Added debug documentation
- ✅ `dist/index.js` - Just rebuilt with latest changes

## Test Environment

- **Date:** February 15, 2026
- **OS:** Ubuntu 25.10 (Questing Quokka)
- **MCP Client:** GOOSE Desktop
- **Browser:** Playwright (Chromium 143, Firefox 144, Webkit 26)
- **Logs:** `/mnt/media2/DEV2/web-search-mcp/logs/server.log`
