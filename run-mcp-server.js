#!/usr/bin/env node
/**
 * Wrapper to suppress EPIPE errors before loading the MCP server
 * This runs BEFORE any ES6 imports, preventing EPIPE crashes
 */

// Suppress stderr writes when stdout is closed
const originalStderrWrite = process.stderr.write;
process.stderr.write = function(chunk, encoding, callback) {
  if (!process.stdout || !process.stdout.writable) {
    if (typeof callback === 'function') callback();
    return true;
  }
  try {
    return originalStderrWrite.call(process.stderr, chunk, encoding, callback);
  } catch (e) {
    if (e.code === 'EPIPE') {
      if (typeof callback === 'function') callback();
      return true;
    }
    throw e;
  }
};

// Register uncaughtException handler
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE' || error.errno === -32) {
    return; // Silently ignore EPIPE
  }
  process.exit(1);
});

// Suppress console methods if stdout closed
if (!process.stdout || !process.stdout.writable) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
  console.error = () => {};
}

// Now import and run the actual server
import('./dist/index.js').catch((err) => {
  if (err.code !== 'EPIPE') {
    process.exit(1);
  }
});
