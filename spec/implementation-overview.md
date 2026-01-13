# Implementation Overview

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Rust Backend (Tauri)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  3 commands: read_file, get_recent_files, add_recent_file │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Tauri IPC (invoke)
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
├── mise.toml                    # Tool versions & build tasks
├── prd.json                     # Task tracking
├── spec/                        # Specifications
├── src-tauri/                   # Rust backend
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   └── src/
│       ├── main.rs              # Entry point
│       ├── lib.rs               # Tauri setup
│       └── commands.rs          # IPC command handlers
├── ui/                          # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts
│       ├── store.ts
│       ├── api.ts               # Tauri invoke wrappers
│       ├── parser.ts            # Log parsing
│       └── components/
│           ├── LogViewer.tsx
│           ├── Sidebar.tsx
│           └── Toolbar.tsx
└── dist/                        # Built React app
```

## Rust Backend (Minimal)

The Rust backend is intentionally minimal. Only 3 commands:

```rust
// commands.rs

#[tauri::command]
pub fn read_file(path: String, offset: u64) -> FileResult {
    // Read file, return JSON with content, size, path
}

#[tauri::command]
pub fn get_recent_files() -> Vec<RecentFile> {
    // Read ~/.mocha/recent.json, return array
}

#[tauri::command]
pub fn add_recent_file(path: String) -> bool {
    // Update ~/.mocha/recent.json
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
→ Display logs → invoke('add_recent_file', { path })
```

### Opening a File (Drag-Drop)
```
User drags file → DropZone onDrop
→ File API reads content → parseLogFile()
→ Display logs → invoke('add_recent_file', { path })
```

### Re-opening Recent File
```
User clicks recent file → invoke('read_file', { path, offset: 0 })
→ Rust reads file → returns content
→ parseLogFile() → Display logs
```

### Polling for Updates (Differential)
```
setInterval (every 2-3s) → invoke('read_file', { path, offset: prevSize })
→ Rust stats file → if size unchanged, return empty
→ Rust seeks to prevSize, reads new bytes only
→ Frontend parses new lines → Appends to existing logs
```

## Dependencies

### Rust Backend (Cargo.toml)
| Package | Purpose |
|---------|---------|
| tauri | Desktop app framework |
| tauri-plugin-log | Logging |
| serde, serde_json | Serialization |
| dirs | Home directory access |
| chrono | Timestamps |

### React Frontend (package.json)
| Package | Purpose |
|---------|---------|
| react, react-dom | UI framework |
| @tauri-apps/api | Tauri IPC bindings |
| tailwindcss | Styling |
| zustand | State management |
| lucide-react | Icons |
| murmurhash | Hash generation |
| vite | Build tool |

## Build Process

```bash
# Using mise (recommended)
mise run setup          # Install dependencies
mise run dev            # Development mode
mise run build          # Production build

# Or manually:
cd ui && npm install    # Install frontend deps
cargo tauri dev         # Development mode
cargo tauri build       # Production build
```

## Packaging

### macOS
- Native .app bundle at `src-tauri/target/release/bundle/macos/Mocha.app`
- DMG installer at `src-tauri/target/release/bundle/dmg/Mocha_*.dmg`

### Linux (future)
- AppImage or .deb package

### Windows (future)
- .msi or .exe installer

## Implementation Phases

### Phase 1: Project Setup
1. Initialize Tauri project with `cargo tauri init`
2. Configure mise.toml for tool management
3. Test basic window opens

### Phase 2: Rust Backend
1. Implement read_file command
2. Implement recent files (get/add)
3. Test commands from devtools console

### Phase 3: Frontend Core
1. Types and parser module
2. Zustand stores
3. API wrapper using @tauri-apps/api

### Phase 4: UI Components
1. Sidebar with recent files
2. LogViewer with filtering
3. File input and drag-drop

### Phase 5: Polish
1. Polling implementation
2. Error handling
3. Build and package
