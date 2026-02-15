# GOOSE MCP Configuration for Debug Mode

## Full GOOSE Config with Debug Enabled

Add this to your GOOSE configuration file (usually `~/.config/goose/mcp-hermit/config.json` or similar):

```json
{
  "mcpServers": {
    "web-search-mcp": {
      "command": "node",
      "args": [
        "/mnt/media2/DEV2/web-search-mcp/dist/index.js"
      ],
      "env": {
        "DEBUG_SAVE_HTML": "true",
        "DEBUG_HTML_PARSING": "true",
        "DEBUG_BING_SEARCH": "true",
        "DEBUG_BROWSER_LIFECYCLE": "true"
      }
    }
  }
}
```

## Debug Flags Explained

- **DEBUG_SAVE_HTML**: Save raw HTML responses to `logs/html-debug/` directory
  - Critical for diagnosing parsing issues
  - Files named: `TIMESTAMP_EngineName_QuerySnippet.html`
  - Example: `2026-02-15T17-23-30-462Z_Bing_best_alternative_search.html`

- **DEBUG_HTML_PARSING**: Verbose logging of HTML parsing
  - Shows selectors tried
  - Shows what elements were found
  - Helps identify selector issues

- **DEBUG_BING_SEARCH**: Extra Bing-specific logging
  - Navigation steps
  - Form interactions
  - Timing information

- **DEBUG_BROWSER_LIFECYCLE**: Browser creation/destruction logs
  - When browsers launch
  - When browsers close
  - Memory management info

## After Enabling Debug Mode

1. **Restart GOOSE completely** (close and reopen)
2. **Check if new build loaded:**
   - Log should show: "MCP Server Started"
   - First search should attempt 7 engines, not 3
   - Look for "(1/7)" in logs instead of "(1/7)"

3. **Run test searches:**
   ```
   search the web for "rust programming"
   ```

4. **Check debug files:**
   ```bash
   ls -lh /mnt/media2/DEV2/web-search-mcp/logs/html-debug/
   ```

5. **Inspect HTML:**
   ```bash
   # View a saved HTML file
   cat logs/html-debug/2026-*_Bing_rust_programming.html | head -100
   
   # Check file sizes
   du -h logs/html-debug/*.html
   ```

## Quick File Inspection Commands

```bash
# Count HTML files saved
ls -1 logs/html-debug/ | wc -l

# Find CAPTCHA pages
grep -l "captcha\|Captcha\|CAPTCHA" logs/html-debug/*.html

# Find rate limit pages  
grep -l "rate limit\|slow down\|202" logs/html-debug/*.html

# Check which engines succeeded
for file in logs/html-debug/*.html; do
  echo "$file: $(wc -c < "$file") bytes"
done
```

## Disabling Debug Mode (After Diagnosis)

Remove or set to false in config:

```json
{
  "mcpServers": {
    "web-search-mcp": {
      "command": "node",
      "args": ["/mnt/media2/DEV2/web-search-mcp/dist/index.js"],
      "env": {
        "DEBUG_SAVE_HTML": "false"
      }
    }
  }
}
```

**Note:** Debug mode can generate large files. Each search saves 7 HTML files (one per engine), typically 100-200KB each = ~1MB per search. Manually delete `logs/html-debug/` directory when done debugging.
