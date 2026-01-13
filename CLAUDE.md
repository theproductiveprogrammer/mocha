# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
mise run setup        # Install all dependencies (frontend + Tauri CLI)
mise run dev          # Development mode (Tauri + React hot reload)
mise run build        # Production build (outputs to src-tauri/target/release/bundle/macos/Mocha.app)
mise run build-debug  # Debug build (faster compilation)
mise run clean        # Clean all build artifacts
```

Individual commands:
- Frontend only: `cd ui && npm run dev` (http://localhost:5173)
- Frontend build: `cd ui && npm run build` (outputs to ./dist)
- Tauri commands: `cargo tauri dev` / `cargo tauri build`

## Architecture

Mocha is a macOS log viewer built with Tauri (Rust backend) and React (TypeScript frontend).

```
┌─────────────────────────────────────────────┐
│            Rust Backend (Tauri)             │
│  3 commands: read_file, get_recent_files,   │
│              add_recent_file                │
└──────────────────────┬──────────────────────┘
                       │ Tauri IPC (invoke)
┌──────────────────────┴──────────────────────┐
│              React Frontend                  │
│  - Log parsing (11+ formats)                │
│  - Filtering (text, regex, service badges)  │
│  - Selection (Ctrl+A, Ctrl+C, Delete)       │
│  - Polling (3s interval for file changes)   │
│  - Zustand stores (localStorage persist)    │
└─────────────────────────────────────────────┘
```

**Backend is minimal** - Rust handles only file I/O and recent files persistence (`~/.mocha/recent.json`). All parsing, filtering, and UI logic lives in the frontend.

**Key frontend files:**
- `ui/src/parser.ts` - Log format detection (11 regex patterns) and line parsing
- `ui/src/store.ts` - Zustand stores for logs, selection, and file state
- `ui/src/api.ts` - Tauri invoke wrappers
- `ui/src/App.tsx` - Main app with Sidebar, Toolbar, LogViewer

**Key backend files:**
- `src-tauri/src/commands.rs` - Tauri command handlers
- `src-tauri/src/lib.rs` - Tauri app setup

## Testing

E2E testing uses Playwright MCP against the built app:

1. Build: `mise run build` or `mise run build-debug`
2. Launch: `mise run launch-mac` or open `src-tauri/target/debug/bundle/macos/Mocha.app`
3. Use Playwright tools: `browser_snapshot`, `browser_file_upload`, `browser_click`, `browser_press_key`

Test fixtures in `_tmp/logs/`:
- Quick tests: `core-log-snippet.txt`, `genie.log`
- Large file tests: `salesbox_microservice_core.log` (11MB, tests 2000-line truncation)

## Specifications

Detailed specs in `/spec/`:
- `implementation-overview.md` - Architecture and project structure
- `tauri-commands.md` - Rust command specs with TypeScript types
- `log-parser.md` - Log format patterns and regex
- `ui-components.md` - Component specs and Zustand stores
- `testing.md` - E2E testing approach

Task tracking in `prd.json` and development notes in `progress.txt`.
