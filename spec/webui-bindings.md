# WebUI Bindings Specification (C Backend)

## Overview

The C backend exposes only 3 bindings. Everything else happens in the React frontend.

## Binding Summary

| Binding | Arguments | Returns | Description |
|---------|-----------|---------|-------------|
| `readFile` | `path: string, offset: number` | `FileResult` | Read file contents (differential) |
| `getRecentFiles` | none | `RecentFile[]` | Get recent files list |
| `addRecentFile` | `path: string` | `void` | Add to recent files |

## Type Definitions (Frontend)

```typescript
interface FileResult {
  success: boolean;
  content?: string;     // File contents (new bytes only if offset > 0)
  path?: string;        // Full path
  name?: string;        // Filename only
  size?: number;        // Current file size in bytes
  prevSize?: number;    // Offset that was passed in
  error?: string;       // Error message if failed
}

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;   // Unix timestamp ms
}
```

## C Implementation

### main.c

```c
#include "webui.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define MAX_FILE_SIZE (10 * 1024 * 1024)  // 10MB limit
#define MAX_RECENT 20
#define RECENT_FILE_PATH "/.mocha/recent.json"

// Helper: Get home directory
static const char* get_home() {
    const char* home = getenv("HOME");
    if (!home) home = getenv("USERPROFILE");  // Windows
    return home ? home : ".";
}

// Helper: Get recent file path
static void get_recent_path(char* buf, size_t len) {
    snprintf(buf, len, "%s%s", get_home(), RECENT_FILE_PATH);
}

// Binding: readFile(path, offset)
// If offset = 0: read full file (initial load)
// If offset > 0: read only new bytes from offset to end (polling)
void read_file(webui_event_t* e) {
    const char* path = webui_get_string_at(e, 0);
    long offset = (long)webui_get_int_at(e, 1);

    // First, stat the file to get current size
    struct stat st;
    if (stat(path, &st) != 0) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Cannot stat file\"}");
        return;
    }

    long current_size = st.st_size;

    // If file hasn't grown, return empty content with current size
    if (offset > 0 && current_size <= offset) {
        char response[256];
        snprintf(response, sizeof(response),
            "{\"success\":true,\"content\":\"\",\"size\":%ld,\"prevSize\":%ld}",
            current_size, offset);
        webui_return_string(e, response);
        return;
    }

    FILE* f = fopen(path, "rb");
    if (!f) {
        webui_return_string(e, "{\"success\":false,\"error\":\"Cannot open file\"}");
        return;
    }

    // Calculate how much to read
    long read_start = (offset > 0) ? offset : 0;
    long read_size = current_size - read_start;

    if (read_size > MAX_FILE_SIZE) {
        fclose(f);
        webui_return_string(e, "{\"success\":false,\"error\":\"File too large\"}");
        return;
    }

    // Seek to read position
    fseek(f, read_start, SEEK_SET);

    // Read content
    char* content = malloc(read_size + 1);
    fread(content, 1, read_size, f);
    content[read_size] = '\0';
    fclose(f);

    // Extract filename
    const char* name = strrchr(path, '/');
    if (!name) name = strrchr(path, '\\');
    name = name ? name + 1 : path;

    // Build JSON response
    // Note: Real implementation needs proper JSON escaping for content
    char* response = malloc(read_size + 512);
    snprintf(response, read_size + 512,
        "{\"success\":true,\"content\":\"%s\",\"path\":\"%s\",\"name\":\"%s\",\"size\":%ld,\"prevSize\":%ld}",
        content, path, name, current_size, offset);

    webui_return_string(e, response);

    free(content);
    free(response);
}

// Binding: getRecentFiles
void get_recent_files(webui_event_t* e) {
    char path[512];
    get_recent_path(path, sizeof(path));

    FILE* f = fopen(path, "r");
    if (!f) {
        webui_return_string(e, "[]");
        return;
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    char* content = malloc(size + 1);
    fread(content, 1, size, f);
    content[size] = '\0';
    fclose(f);

    webui_return_string(e, content);
    free(content);
}

// Binding: addRecentFile
void add_recent_file(webui_event_t* e) {
    const char* file_path = webui_get_string(e);

    // Extract filename
    const char* name = strrchr(file_path, '/');
    if (!name) name = strrchr(file_path, '\\');
    name = name ? name + 1 : file_path;

    // Get current time
    long long now = (long long)time(NULL) * 1000;

    // Read existing recent files
    char recent_path[512];
    get_recent_path(recent_path, sizeof(recent_path));

    // Create directory if needed
    char dir[512];
    snprintf(dir, sizeof(dir), "%s/.mocha", get_home());
    mkdir(dir, 0755);  // Ignore error if exists

    // For simplicity, just prepend new entry
    // Real implementation should parse JSON, dedupe, limit to MAX_RECENT
    FILE* f = fopen(recent_path, "r");
    char* existing = NULL;
    if (f) {
        fseek(f, 0, SEEK_END);
        long size = ftell(f);
        fseek(f, 0, SEEK_SET);
        existing = malloc(size + 1);
        fread(existing, 1, size, f);
        existing[size] = '\0';
        fclose(f);
    }

    // Build new JSON array
    char* new_json = malloc(strlen(file_path) + strlen(name) +
                           (existing ? strlen(existing) : 0) + 256);

    if (existing && strlen(existing) > 2) {
        // Insert at beginning of existing array
        snprintf(new_json, 65536,
            "[{\"path\":\"%s\",\"name\":\"%s\",\"lastOpened\":%lld},%s",
            file_path, name, now, existing + 1);  // Skip opening [
    } else {
        snprintf(new_json, 65536,
            "[{\"path\":\"%s\",\"name\":\"%s\",\"lastOpened\":%lld}]",
            file_path, name, now);
    }

    // Write back
    f = fopen(recent_path, "w");
    if (f) {
        fputs(new_json, f);
        fclose(f);
    }

    free(existing);
    free(new_json);
}

int main() {
    size_t win = webui_new_window();

    // Register bindings
    webui_bind(win, "readFile", read_file);
    webui_bind(win, "getRecentFiles", get_recent_files);
    webui_bind(win, "addRecentFile", add_recent_file);

    // Serve frontend
    webui_set_root_folder(win, "./dist");
    webui_show(win, "index.html");

    webui_wait();
    return 0;
}
```

## Frontend API Wrapper

**File**: `ui/src/api.ts`

```typescript
declare global {
  interface Window {
    webui?: {
      call: (name: string, ...args: unknown[]) => Promise<string>;
    };
  }
}

interface FileResult {
  success: boolean;
  content?: string;
  path?: string;
  name?: string;
  size?: number;
  error?: string;
}

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

// Check if running in WebUI context
export function isWebUI(): boolean {
  return typeof window.webui !== 'undefined';
}

// offset = 0 for initial load, or previous size for polling
export async function readFile(path: string, offset: number = 0): Promise<FileResult> {
  if (!isWebUI()) {
    return { success: false, error: 'Not running in WebUI' };
  }
  const result = await window.webui!.call('readFile', path, offset);
  return JSON.parse(result);
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!isWebUI()) {
    return [];
  }
  const result = await window.webui!.call('getRecentFiles');
  try {
    return JSON.parse(result);
  } catch {
    return [];
  }
}

export async function addRecentFile(path: string): Promise<void> {
  if (!isWebUI()) return;
  await window.webui!.call('addRecentFile', path);
}
```

## File Opening Strategy

Since we're not using native dialogs, files are opened via:

### 1. Browser File Input
```tsx
<input
  type="file"
  accept=".log,.txt"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        // Parse and display
        // Note: Browser doesn't give us the full path for security
        // We only get the filename
      };
      reader.readAsText(file);
    }
  }}
/>
```

### 2. Drag and Drop
```tsx
onDrop={(e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      // Parse and display
    };
    reader.readAsText(file);
  }
}}
```

### 3. Recent Files (via C backend)
```tsx
// Recent files have full paths stored
const result = await readFile(recentFile.path);
if (result.success) {
  // Parse and display result.content
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
      // Pass previous size - only get new bytes
      const result = await readFile(path, fileSizeRef.current);

      if (result.success) {
        // Update tracked size
        fileSizeRef.current = result.size!;

        // If there's new content, notify
        if (result.content && result.content.length > 0) {
          onNewContent(result.content);
        }
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [path, enabled, onNewContent]);

  // Reset size when path changes
  useEffect(() => {
    fileSizeRef.current = 0;
  }, [path]);
}

// Usage in component:
useFilePolling(currentFile?.path, isPolling, (newContent) => {
  // Parse only the new lines and append to existing logs
  const newLines = newContent.split('\n').filter(l => l.trim());
  const newEntries = newLines.map(line => ({
    name: currentFile.name,
    data: line,
    isErr: false,
    parsed: parseLogLine(line),
  }));
  setLogs(prev => [...prev, ...addHashes(newEntries)]);
});
```

## Error Handling

The C backend returns JSON with `success: false` and `error` message on failure:

```json
{"success": false, "error": "Cannot open file"}
{"success": false, "error": "File too large"}
```

Frontend should display these errors to the user.
