# Mocha Log Viewer

A fast powerful log viewer and analyser for sharing and investigating log files.

## Features

### Multi-File Viewing
- Open multiple `.log` and `.txt` files simultaneously
- Logs from all files are merged chronologically in a single interleaved view
- Drag-and-drop files or use the file picker
- Auto-restore previously opened files on startup

### Real-Time Monitoring
- Automatically polls files and shows latest view
- New logs appear at the top as they're written
- "New logs" indicator when scrolled down with count of buffered logs
- Detects file truncation/rotation and reloads automatically

### Log Parsing
Automatically parses 14+ log formats including:
- **Java/Spring**: Logback, Log4j, Spring Boot formats
- **Python**: Standard Python logging format
- **Rust**: Genie/Rust bracketed format `[timestamp][module][LEVEL]`
- **Maven**: Build output with `[INFO]`, `[WARN]` markers
- **JSON**: Structured JSON log lines
- **Grafana/Loki**: Tab-separated export format with epoch timestamps
- **Generic**: Fallback patterns for unstructured logs

Each parsed log extracts:
- Timestamp (normalized to milliseconds)
- Log level (ERROR, WARN, INFO, DEBUG, TRACE)
- Service/logger name (displayed as colored badges)
- Message content with syntax highlighting

### Filtering
### Search
- Press `Cmd+F` (Mac) or `Ctrl+F` (Windows/Linux) to open search
- Supports plain text or regex (toggle with button)
- Match counter shows current position (e.g., "3/15")
- `Enter` → next match, `Shift+Enter` → previous match
- `Escape` → clear search

### Error/Warning Navigation
- Toolbar shows error and warning counts
- Click error/warning buttons to jump between occurrences
- Position indicator shows "2/8 errors" etc.

## Logbooks

Logbooks let you curate and save interesting log entries for investigation or sharing.

### Creating Entries:
- Click the bookmark icon on any log line to add it to the active logbook
- Or click anywhere on the log row

### Managing Logbooks:
- Create multiple named logbooks in the sidebar
- Double-click logbook name to rename
- Each logbook stores full log data (persists even if source files are closed)
- Entries persist across app restarts

### Logbook Panel:
- Toggle the right-side panel with the logbook button in toolbar
- Shows compact preview cards of all entries
- Resize the panel by dragging its edge

### Full Logbook View:
- Click a logbook in the sidebar to open full-screen view
- Shows expanded entries with:
  - Full message content
  - Smart stack trace filtering (hides infrastructure frames)
  - Pretty-printed JSON data
  - RAW mode toggle for original text
- Search within logbook (`Cmd+G`)
- Click crosshair icon to jump back to source line in log viewer
- Copy entire logbook to clipboard (formatted with file headers)

## Themes
Three visual themes available via sidebar footer:
- **System** - Follows OS light/dark preference
- **Observatory** - Dark theme with amber accents
- **Morning Brew** - Light theme with warm tones

## Performance
- Virtualized rendering handles large files smoothly
- Initial load: reads last 2MB of file, displays last 2000 lines
- Memory protection: caps at 30,000 log entries
- Efficient Set-based lookups for filtering

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+F` | Focus search in log viewer |
| `Cmd/Ctrl+G` | Focus search in logbook view |
| `Enter` | Next search match |
| `Shift+Enter` | Previous search match |
| `Escape` | Clear search / close logbook view |

## Installation

### From Release
Download the latest `.dmg` from Releases and drag Mocha.app to Applications.

### From Source

Prerequisites:
- [mise](https://mise.jdx.dev/) (or manually install Node.js 20+ and Rust)
- Xcode Command Line Tools

```bash
# Install dependencies
mise run setup

# Development mode with hot reload
mise run dev

# Production build
mise run build
# Output: src-tauri/target/release/bundle/macos/Mocha.app
```

## Architecture

```
┌─────────────────────────────────────────────┐
│            Rust Backend (Tauri)             │
│  File I/O and recent files persistence      │
│  (~/.mocha/recent.json)                     │
└──────────────────────┬──────────────────────┘
                       │ Tauri IPC
┌──────────────────────┴──────────────────────┐
│              React Frontend                  │
│  - Log parsing (14+ formats)                │
│  - Filtering & search                       │
│  - Logbook curation                         │
│  - Virtualized rendering                    │
│  - State persistence (localStorage)         │
└─────────────────────────────────────────────┘
```

The backend is intentionally minimal - Rust handles only:
- `read_file(path, offset)` - Read file content with differential loading
- `get_recent_files()` - List recent files with metadata
- `add_recent_file(path)` - Add file to recent list
- `remove_recent_file(path)` - Remove from recent list
- `clear_recent_files()` - Clear all recent files

All parsing, filtering, and UI logic lives in the TypeScript frontend.

## Project Structure

```
mocha/
├── ui/                     # React frontend
│   └── src/
│       ├── App.tsx         # Main app orchestration
│       ├── parser.ts       # Log format detection & parsing
│       ├── store.ts        # Zustand state management
│       ├── api.ts          # Tauri IPC wrappers
│       ├── types.ts        # TypeScript definitions
│       └── components/
│           ├── LogViewer.tsx    # Virtualized log display
│           ├── LogLine.tsx      # Individual log rendering
│           ├── Sidebar.tsx      # File & logbook management
│           ├── Toolbar.tsx      # Filters & navigation
│           ├── StoryPane.tsx    # Logbook preview panel
│           └── LogbookView.tsx  # Full logbook view
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands.rs     # Tauri command handlers
│       └── lib.rs          # App setup
├── spec/                   # Detailed specifications
└── CLAUDE.md              # AI assistant instructions
```

## License

MIT

---
Built with Tauri (Rust) and React