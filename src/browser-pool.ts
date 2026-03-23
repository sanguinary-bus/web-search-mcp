import { chromium, firefox, webkit } from 'playwright-extra';
import type { Browser } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BROWSER, BROWSER_BY_OS } from './constants.js';

const VALID_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
type BrowserType = (typeof VALID_BROWSERS)[number];

function getOsAppropriateBrowsers(envBrowsers: string[]): string[] {
  const platform = process.platform;

  let browsers = envBrowsers
    .map(b => b.toLowerCase().trim())
    .filter((b): b is BrowserType => VALID_BROWSERS.includes(b as BrowserType));

  if (platform !== 'darwin') {
    const webkitIndex = browsers.indexOf('webkit');
    if (webkitIndex > -1) {
      browsers.splice(webkitIndex, 1);
      console.log(
        `[BrowserPool] webkit filtered out (only available on macOS)`
      );
    }
  }

  if (browsers.length === 0) {
    console.warn(
      `[BrowserPool] No valid browsers configured, using defaults for ${platform}`
    );
    browsers = [
      ...(platform === 'darwin' ? BROWSER_BY_OS.darwin : BROWSER_BY_OS.default),
    ];
  }

  return browsers;
}

// Apply stealth plugin to all browser types
chromium.use(StealthPlugin());
firefox.use(StealthPlugin());
webkit.use(StealthPlugin());

// Singleton instance
let browserPoolInstance: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool();
  }
  return browserPoolInstance;
}

export async function getBrowserPoolAsync(): Promise<BrowserPool> {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool();
    await browserPoolInstance.initialize();
  }
  return browserPoolInstance;
}

export class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
  private maxBrowsers: number;
  private browserTypes: string[];
  private currentBrowserIndex = 0;
  private headless: boolean;
  private lastUsedBrowserType: string = '';
  private closed: boolean = false;
  private initialized: boolean = false;

  constructor() {
    // Read configuration from environment variables
    this.maxBrowsers = parseInt(
      process.env.MAX_BROWSERS || String(BROWSER.MAX_INSTANCES),
      10
    );
    this.headless = process.env.BROWSER_HEADLESS !== 'false';

    // Configure browser types based on environment with OS filtering
    const browserTypesEnv = process.env.BROWSER_TYPES || '';
    const envBrowsers = browserTypesEnv ? browserTypesEnv.split(',') : [];
    this.browserTypes = getOsAppropriateBrowsers(envBrowsers);

    console.log(
      `[BrowserPool] Configuration: maxBrowsers=${this.maxBrowsers}, headless=${this.headless}, types=${this.browserTypes.join(',')}`
    );
  }

  private async isBrowserInstalled(browserType: BrowserType): Promise<boolean> {
    try {
      let browserLauncher;
      switch (browserType) {
        case 'chromium':
          browserLauncher = chromium;
          break;
        case 'firefox':
          browserLauncher = firefox;
          break;
        case 'webkit':
          browserLauncher = webkit;
          break;
      }

      const testBrowser = await browserLauncher.launch({
        headless: true,
        timeout: 5000,
      });
      await testBrowser.close();
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Executable doesn't exist")
      ) {
        return false;
      }
      // Other errors mean browser exists but had issues launching
      // Treat as installed
      return true;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const installedBrowsers: string[] = [];
    for (const browserType of this.browserTypes) {
      const installed = await this.isBrowserInstalled(
        browserType as BrowserType
      );
      if (installed) {
        installedBrowsers.push(browserType);
      } else {
        console.warn(
          `[BrowserPool] ${browserType} not installed, skipping. Run: npx playwright install`
        );
      }
    }

    if (installedBrowsers.length === 0) {
      throw new Error('No browsers installed. Run: npx playwright install');
    }

    this.browserTypes = installedBrowsers;
    this.initialized = true;
    console.log(
      `[BrowserPool] Available browsers: ${this.browserTypes.join(', ')}`
    );
  }

  async getBrowser(): Promise<Browser> {
    // Lazy initialization - check browser availability on first use
    if (!this.initialized) {
      await this.initialize();
    }

    // Rotate between browser types for variety
    const browserType =
      this.browserTypes[this.currentBrowserIndex % this.browserTypes.length];
    this.currentBrowserIndex++;
    this.lastUsedBrowserType = browserType;

    if (this.browsers.has(browserType)) {
      const browser = this.browsers.get(browserType)!;

      // Check if browser is still connected and healthy
      try {
        if (browser.isConnected()) {
          // Quick health check by trying to create and close a context
          // Use minimal options to avoid Firefox isMobile issues
          const testContext = await browser.newContext({
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          });
          await testContext.close();
          return browser;
        }
      } catch (error) {
        console.log(
          `[BrowserPool] Browser ${browserType} health check failed:`,
          error
        );
        // Browser is unhealthy, remove it and close if possible
        this.browsers.delete(browserType);
        try {
          await browser.close();
        } catch (closeError) {
          console.log(
            `[BrowserPool] Error closing unhealthy browser:`,
            closeError
          );
        }
      }
    }

    // Launch new browser
    console.log(`[BrowserPool] Launching new ${browserType} browser`);

    const launchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
      ],
    };

    let browser: Browser;
    try {
      switch (browserType) {
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          browser = await chromium.launch(launchOptions);
      }

      this.browsers.set(browserType, browser);

      // Clean up old browsers if we have too many
      if (this.browsers.size > this.maxBrowsers) {
        const oldestBrowser = this.browsers.entries().next().value;
        if (oldestBrowser) {
          try {
            await oldestBrowser[1].close();
          } catch (error) {
            console.error(`[BrowserPool] Error closing old browser:`, error);
          }
          this.browsers.delete(oldestBrowser[0]);
        }
      }

      return browser;
    } catch (error) {
      console.error(
        `[BrowserPool] Failed to launch ${browserType} browser:`,
        error
      );
      throw error;
    }
  }

  async closeAll(): Promise<void> {
    // Idempotent - do nothing if already closed
    if (this.closed) {
      return;
    }
    this.closed = true;

    console.log(`[BrowserPool] Closing ${this.browsers.size} browsers`);

    const closePromises = Array.from(this.browsers.values()).map(browser =>
      browser
        .close()
        .catch(error => console.error('Error closing browser:', error))
    );

    await Promise.all(closePromises);
    this.browsers.clear();
  }

  getLastUsedBrowserType(): string {
    return this.lastUsedBrowserType;
  }
}
