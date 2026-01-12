# Mocha Log Viewer - Requirements

## Overview

Mocha is a desktop log viewer application for viewing and analyzing log files with advanced filtering, parsing, and live streaming capabilities.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | C with WebUI library |
| Frontend | React 19, Vite, Tailwind CSS 4.x, Zustand |
| Desktop | WebUI (browser as GUI, native C library) |
| Packaging | Single binary + bundled web assets |

## Design Principles

- **Cross-platform**: No OS-specific APIs
- **Simple backend**: Minimal C code, heavy lifting in React
- **Browser-native**: Use standard browser APIs where possible

## Core Requirements

### File Operations
- **R-FILE-01**: Open log files via browser file input or drag-and-drop
- **R-FILE-02**: Support `.log` and `.txt` file extensions
- **R-FILE-03**: Limit display to last 2000 lines for large files
- **R-FILE-04**: Show file info (name, size, truncation indicator)

### Live Updates
- **R-LIVE-01**: Poll file for changes (every 2-3 seconds)
- **R-LIVE-02**: Toggle polling on/off via UI
- **R-LIVE-03**: Only fetch new content since last read

### Recent Files
- **R-RECENT-01**: Persist list of recently opened files
- **R-RECENT-02**: Display recent files in sidebar
- **R-RECENT-03**: Click recent file to re-open
- **R-RECENT-04**: Limit to 20 most recent files
- **R-RECENT-05**: Persist across application restarts

### Log Parsing (Frontend)
- **R-PARSE-01**: Parse 11+ log formats automatically
- **R-PARSE-02**: Extract timestamp, level, logger, content
- **R-PARSE-03**: Detect and parse API call patterns
- **R-PARSE-04**: Merge continuation lines

### Filtering (Frontend)
- **R-FILTER-01**: Text-based case-insensitive filtering
- **R-FILTER-02**: Regex filtering with `/pattern/` syntax
- **R-FILTER-03**: Exclude filtering with `-pattern` prefix
- **R-FILTER-04**: Multiple concurrent filters
- **R-FILTER-05**: Service-level filtering via toggle badges
- **R-FILTER-06**: Persist filter state across sessions

### Selection & Actions (Frontend)
- **R-SELECT-01**: Ctrl+Click multi-selection
- **R-SELECT-02**: Shift+Click range selection
- **R-SELECT-03**: Ctrl+A select all visible
- **R-SELECT-04**: Ctrl+C copy selected to clipboard
- **R-SELECT-05**: Delete/Backspace to hide selected lines

### Display (Frontend)
- **R-DISPLAY-01**: Color-coded service badges
- **R-DISPLAY-02**: Log level coloring (ERROR=red, WARN=amber)
- **R-DISPLAY-03**: Click line to toggle text wrapping
- **R-DISPLAY-04**: Monospace font
- **R-DISPLAY-05**: Newest logs first

## Reference Documents

| Document | Description |
|----------|-------------|
| [implementation-overview.md](./implementation-overview.md) | Architecture and implementation details |
| [webui-bindings.md](./webui-bindings.md) | C backend binding specifications |
| [log-parser.md](./log-parser.md) | Log format patterns (12 patterns) |
| [ui-components.md](./ui-components.md) | React component specifications |
| [testing.md](./testing.md) | E2E testing and verification |

## Test Fixtures

77 log files available in `_tmp/logs/` for testing:
- Quick tests: `core-log-snippet.txt`, `genie.log` (< 100KB)
- Large files: `salesbox_microservice_core.log` (11MB) for truncation testing
- Multiple formats: SalesBox, IWF/Spring, Genie/Rust, Maven, AWS ALB

## Task Tracking

All implementation tasks are tracked in [`prd.json`](../prd.json) at the project root.
