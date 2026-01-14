# Tauri Commands Specification (Rust Backend)

## Overview

The Rust backend exposes only 4 commands via Tauri's IPC. Everything else happens in the React frontend.

## Command Summary

| Command | Arguments | Returns | Description |
|---------|-----------|---------|-------------|
| `read_file` | `path: String, offset: u64` | `FileResult` | Read file contents (differential) |
| `get_recent_files` | none | `Vec<RecentFile>` | Get recent files list |
| `add_recent_file` | `path: String` | `bool` | Add to recent files |
| `clear_recent_files` | none | `bool` | Clear all recent files |

## Type Definitions

### Rust Types (src-tauri/src/commands.rs)

```rust
#[derive(Serialize)]
pub struct FileResult {
    pub success: bool,
    pub content: Option<String>,
    pub path: Option<String>,
    pub name: Option<String>,
    pub size: Option<u64>,
    pub prev_size: Option<u64>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: i64,
}
```

### Frontend Types (ui/src/api.ts)

```typescript
interface FileResult {
  success: boolean;
  content?: string;
  path?: string;
  name?: string;
  size?: number;
  prevSize?: number;
  error?: string;
}

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}
```

## Rust Implementation

### commands.rs

```rust
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use chrono::Utc;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit
const MAX_RECENT: usize = 20;

/// Get the path to ~/.mocha/recent.json
fn get_recent_file_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".mocha").join("recent.json"))
}

/// Read file with optional offset for differential/polling reads
#[tauri::command]
pub fn read_file(path: String, offset: u64) -> FileResult {
    // ... implementation
}

/// Get list of recently opened files
#[tauri::command]
pub fn get_recent_files() -> Vec<RecentFile> {
    // ... implementation
}

/// Add a file to the recent files list
#[tauri::command]
pub fn add_recent_file(path: String) -> bool {
    // ... implementation
}

/// Clear all recent files
#[tauri::command]
pub fn clear_recent_files() -> bool {
    // Truncate ~/.mocha/recent.json to empty array
}
```

### lib.rs

```rust
mod commands;

use commands::{read_file, get_recent_files, add_recent_file, clear_recent_files};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            get_recent_files,
            add_recent_file,
            clear_recent_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Frontend API Wrapper

**File**: `ui/src/api.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri context
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

// Backwards compatibility alias
export const isWebUI = isTauri;

// offset = 0 for initial load, or previous size for polling
export async function readFile(path: string, offset: number = 0): Promise<FileResult> {
  if (!isTauri()) {
    return { success: false, error: 'Not running in Tauri' };
  }
  const result = await invoke<FileResult>('read_file', { path, offset });
  return result;
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!isTauri()) {
    return [];
  }
  return await invoke<RecentFile[]>('get_recent_files');
}

export async function addRecentFile(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke<boolean>('add_recent_file', { path });
}

export async function clearRecentFiles(): Promise<void> {
  if (!isTauri()) return;
  await invoke<boolean>('clear_recent_files');
}
```

## Polling Implementation

```typescript
function useFilePolling(
  path: string | null,
  enabled: boolean,
  onNewContent: (content: string) => void
) {
  const fileSizeRef = useRef<number>(0);

  useEffect(() => {
    if (!path || !enabled) return;

    const poll = async () => {
      const result = await readFile(path, fileSizeRef.current);

      if (result.success) {
        fileSizeRef.current = result.size!;
        if (result.content && result.content.length > 0) {
          onNewContent(result.content);
        }
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [path, enabled, onNewContent]);

  useEffect(() => {
    fileSizeRef.current = 0;
  }, [path]);
}
```

## Error Handling

The Rust backend returns `FileResult` with `success: false` and `error` message on failure:

```json
{"success": false, "error": "Cannot stat file"}
{"success": false, "error": "File too large (max 10MB)"}
```

Frontend should display these errors to the user.

## Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-log = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "5"
chrono = "0.4"
```
