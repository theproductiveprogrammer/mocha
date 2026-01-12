/**
 * Mocha Log Viewer - WebUI API Wrapper
 *
 * Provides a clean TypeScript interface to the C backend WebUI bindings.
 * All file operations go through these functions when running in WebUI context.
 */

import type { FileResult, RecentFile } from './types';

/**
 * Check if running in WebUI context
 * Returns true when the app is served by the mocha binary
 */
export function isWebUI(): boolean {
  return typeof window.webui !== 'undefined';
}

/**
 * Wait for WebUI WebSocket connection to be established
 * Useful when app loads before the bridge is fully ready
 */
export async function waitForConnection(timeoutMs: number = 5000): Promise<boolean> {
  if (!isWebUI()) return false;

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (window.webui?.isConnected?.()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Read a file from the filesystem via the C backend
 *
 * @param path - Full path to the file
 * @param offset - Byte offset to start reading from (0 for full file, >0 for differential/polling)
 * @returns FileResult with content, size info, and success status
 *
 * For initial file load, use offset=0 to read the entire file.
 * For polling updates, pass the previous file size as offset to only get new bytes.
 */
export async function readFile(path: string, offset: number = 0): Promise<FileResult> {
  if (!isWebUI()) {
    return { success: false, error: 'Not running in WebUI context' };
  }

  try {
    const result = await window.webui!.call('readFile', path, offset);
    return JSON.parse(result);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error reading file',
    };
  }
}

/**
 * Get the list of recently opened files from ~/.mocha/recent.json
 *
 * @returns Array of RecentFile objects, sorted by lastOpened (newest first)
 */
export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!isWebUI()) {
    return [];
  }

  try {
    const result = await window.webui!.call('getRecentFiles');
    const files = JSON.parse(result);
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

/**
 * Add a file to the recent files list
 *
 * @param path - Full path to the file to add
 *
 * The C backend will:
 * - Create ~/.mocha/ directory if needed
 * - Add the file to the beginning of the list
 * - Remove duplicates if the path already exists
 * - Limit the list to 20 entries
 */
export async function addRecentFile(path: string): Promise<void> {
  if (!isWebUI()) return;

  try {
    await window.webui!.call('addRecentFile', path);
  } catch {
    // Silently fail - recent files are not critical
  }
}
