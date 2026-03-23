import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 604800000 ms

let logStream: fs.WriteStream | null = null;

export function initializeLogger(): void {
  try {
    // Create log directory if it doesn't exist
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // Check if log file exists and is older than 1 week
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      const fileAge = Date.now() - stats.mtimeMs;

      if (fileAge > ONE_WEEK_MS) {
        // Delete old log file
        fs.unlinkSync(LOG_FILE);
      }
    }

    // Create write stream for logging
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    // Write startup message
    logStream.write(`\n${'='.repeat(80)}\n`);
    logStream.write(`[${new Date().toISOString()}] MCP Server Started\n`);
    logStream.write(`${'='.repeat(80)}\n`);

    // Override console methods to also write to file
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: unknown[]) => {
      const message = args
        .map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        )
        .join(' ');
      logStream?.write(`[${new Date().toISOString()}] LOG: ${message}\n`);
      originalLog(...args);
    };

    console.error = (...args: unknown[]) => {
      const message = args
        .map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        )
        .join(' ');
      logStream?.write(`[${new Date().toISOString()}] ERROR: ${message}\n`);
      originalError(...args);
    };

    console.warn = (...args: unknown[]) => {
      const message = args
        .map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        )
        .join(' ');
      logStream?.write(`[${new Date().toISOString()}] WARN: ${message}\n`);
      originalWarn(...args);
    };

    // Log file location to stderr (won't interfere with MCP protocol on stdout)
    process.stderr.write(`[Logger] Log file: ${LOG_FILE}\n`);
  } catch (error) {
    // Don't crash if logging fails, just report it
    process.stderr.write(`[Logger] Failed to initialize logging: ${error}\n`);
  }
}

export function closeLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}
