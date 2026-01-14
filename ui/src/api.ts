/**
 * Mocha Log Viewer - Tauri API Wrapper
 *
 * Provides a clean TypeScript interface to the Rust backend via Tauri IPC.
 * All file operations go through these functions when running in Tauri context.
 */

import { invoke } from '@tauri-apps/api/core';
import type { FileResult, RecentFile } from './types';

/**
 * Check if running in Tauri context
 * Returns true when the app is running as a native Tauri app
 */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

// Keep isWebUI as alias for backwards compatibility
export const isWebUI = isTauri;

/**
 * Wait for Tauri to be ready (for compatibility with existing code)
 * In Tauri, we're always ready once the window loads
 */
export async function waitForConnection(_timeoutMs: number = 5000): Promise<boolean> {
  return isTauri();
}

/**
 * Read a file from the filesystem via the Rust backend
 *
 * @param path - Full path to the file
 * @param offset - Byte offset to start reading from (0 for full file, >0 for differential/polling)
 * @returns FileResult with content, size info, and success status
 *
 * For initial file load, use offset=0 to read the entire file.
 * For polling updates, pass the previous file size as offset to only get new bytes.
 */
export async function readFile(path: string, offset: number = 0): Promise<FileResult> {
  if (!isTauri()) {
    return { success: false, error: 'Not running in Tauri context' };
  }

  try {
    const result = await invoke<FileResult>('read_file', { path, offset });
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get the list of recently opened files from ~/.mocha/recent.json
 *
 * @returns Array of RecentFile objects, sorted by lastOpened (newest first)
 */
export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!isTauri()) return [];

  try {
    const files = await invoke<RecentFile[]>('get_recent_files');
    return Array.isArray(files) ? files : [];
  } catch (err) {
    console.error('getRecentFiles error:', err);
    return [];
  }
}

/**
 * Add a file to the recent files list
 *
 * @param path - Full path to the file to add
 *
 * The Rust backend will:
 * - Create ~/.mocha/ directory if needed
 * - Add the file to the beginning of the list
 * - Remove duplicates if the path already exists
 * - Limit the list to 20 entries
 */
export async function addRecentFile(path: string): Promise<void> {
  if (!isTauri()) return;

  try {
    await invoke('add_recent_file', { path });
  } catch (err) {
    console.error('addRecentFile error:', err);
  }
}

/**
 * Clear the recent files list in ~/.mocha/recent.json
 */
export async function clearRecentFiles(): Promise<void> {
  if (!isTauri()) return;

  try {
    await invoke('clear_recent_files');
  } catch (err) {
    console.error('clearRecentFiles error:', err);
  }
}
