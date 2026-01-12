# Implementation Overview

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         C Backend                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WebUI + 3 bindings: readFile, getRecent, addRecent       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebUI bindings (webui.js)
┌──────────────────────────┴──────────────────────────────────────┐
│                      React Frontend                             │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐  │
│  │   App.tsx     │  │  LogViewer    │  │  Zustand Stores    │  │
│  │  file input   │  │  parsing      │  │  state/persist     │  │
│  │  drag-drop    │  │  filtering    │  │                    │  │
│  │  polling      │  │  display      │  │                    │  │
│  └───────────────┘  └───────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
mocha/
├── prd.json                     # Task tracking
├── spec/                        # Specifications
├── src/
│   ├── main.c                   # C backend (single file)
│   └── Makefile                 # Build script
├── ui/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts
│       ├── store.ts
│       ├── api.ts               # WebUI binding wrappers
│       ├── parser.ts            # Log parsing
│       └── components/
│           ├── LogViewer.tsx
│           ├── Sidebar.tsx
│           └── Toolbar.tsx
└── dist/                        # Built React app
```

## C Backend (Minimal)

The C backend is intentionally minimal. Only 3 bindings:

```c
// main.c - approximately 150-200 lines total

#include "webui.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Binding 1: Read file contents
void read_file(webui_event_t* e) {
    const char* path = webui_get_string(e);
    // Read file, return JSON: {content, size, path}
}

// Binding 2: Get recent files
void get_recent_files(webui_event_t* e) {
    // Read ~/.mocha/recent.json, return array
}

// Binding 3: Add to recent files
void add_recent_file(webui_event_t* e) {
    const char* path = webui_get_string(e);
    // Update ~/.mocha/recent.json
}

int main() {
    size_t win = webui_new_window();

    webui_bind(win, "readFile", read_file);
    webui_bind(win, "getRecentFiles", get_recent_files);
    webui_bind(win, "addRecentFile", add_recent_file);

    webui_set_root_folder(win, "./dist");
    webui_show(win, "index.html");
    webui_wait();

    return 0;
}
```

## Frontend Responsibilities

The React frontend handles:
- File selection (browser `<input type="file">`)
- Drag-and-drop
- Log parsing (11+ formats)
- Filtering (text, regex, exclude)
- Selection and clipboard
- Polling for updates
- State persistence (localStorage)

## Data Flow

### Opening a File (Browser Input)
```
User clicks "Open" → <input type="file"> dialog
→ File API reads content → parseLogFile()
→ Display logs → webui.call('addRecentFile', path)
```

### Opening a File (Drag-Drop)
```
User drags file → DropZone onDrop
→ File API reads content → parseLogFile()
→ Display logs → webui.call('addRecentFile', path)
```

### Re-opening Recent File
```
User clicks recent file → webui.call('readFile', path)
→ C reads file → returns content
→ parseLogFile() → Display logs
```

### Polling for Updates (Differential)
```
setInterval (every 2-3s) → webui.call('readFile', path, prevSize)
→ C stats file → if size unchanged, return empty
→ C seeks to prevSize, reads new bytes only
→ Frontend parses new lines → Appends to existing logs
```

## Dependencies

### C Backend
- WebUI library (header-only or static link)
- Standard C library

### React Frontend (npm)
| Package | Purpose |
|---------|---------|
| react, react-dom | UI framework |
| tailwindcss | Styling |
| zustand | State management |
| lucide-react | Icons |
| murmurhash | Hash generation |
| vite | Build tool |

## Build Process

```bash
# Build frontend
cd ui && npm run build

# Build C backend (links WebUI, outputs single binary)
cd src && make

# Run
./mocha
```

## Packaging

### macOS
- Create .app bundle with binary + dist/ folder
- Or use `create-dmg` for distribution

### Linux
- Single binary + dist/ folder
- Or AppImage

### Windows
- Single .exe + dist/ folder
- Or use Inno Setup for installer

## Implementation Phases

### Phase 1: Project Setup
1. Set up WebUI C project with Makefile
2. Initialize React/Vite/Tailwind
3. Test basic "Hello World" binding

### Phase 2: C Backend
1. Implement readFile binding
2. Implement recent files (get/add)
3. Test bindings from browser console

### Phase 3: Frontend Core
1. Types and parser module
2. Zustand stores
3. API wrapper for bindings

### Phase 4: UI Components
1. Sidebar with recent files
2. LogViewer with filtering
3. File input and drag-drop

### Phase 5: Polish
1. Polling implementation
2. Error handling
3. Build and package
