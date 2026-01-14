# Testing Specification

## E2E Testing Approach

Run the actual compiled Tauri app, not Vite dev server.

### Build & Run
```bash
# Using mise (recommended)
mise run build          # Production build
mise run build-debug    # Debug build (faster)
mise run launch-mac     # Open the built app

# Or manually:
cd ui && npm run build  # Build React frontend
cargo tauri build       # Build Tauri app
open src-tauri/target/release/bundle/macos/Mocha.app
```

### Why This Approach
- Tests real Rust backend bindings (`read_file`, `get_recent_files`, `add_recent_file`, `clear_recent_files`)
- Tests Tauri IPC communication
- Tests differential file reads with real files
- Tests polling with actual file changes
- What users actually experience

### Playwright MCP Test Flow
1. Start Mocha.app via `mise run launch-mac` or open directly
2. Use `browser_snapshot` to see UI state
3. Use `browser_file_upload` to test file loading (supports multi-file)
4. Use `browser_type` and `browser_press_key` for interactions
5. Use `browser_click` for UI elements
6. Use Bash to append to log files, then verify polling picks up changes

---

## Test Fixtures

All test log files are located in `_tmp/logs/`:

### Quick Tests (< 100KB)
| File | Format | Use Case |
|------|--------|----------|
| `core-log-snippet.txt` | SalesBox app | Basic parsing |
| `genie.log` | Rust/Genie | Alternative format |
| `salesboxai-core-compile-error.log` | Maven | Error format |

### Large Tests (> 10MB)
| File | Format | Use Case |
|------|--------|----------|
| `salesbox_microservice_core.log` | SalesBox | Truncation test |
| `salesbox_microservice_iwf.log` | IWF/Spring | Truncation test |

### Special Formats
| File | Format |
|------|--------|
| `861829982786_elasticloadbalancing_*.log` | AWS ALB access logs |
| `genie.log` | Rust `[date][time][module][LEVEL]` |

---

## E2E Verification with Playwright MCP

### File Loading
```
1. browser_snapshot → verify empty state
2. browser_file_upload with _tmp/logs/core-log-snippet.txt
3. browser_snapshot → verify logs displayed, service badges appear
```

### Large File Truncation
```
1. browser_file_upload with _tmp/logs/salesbox_microservice_core.log (11MB)
2. browser_snapshot → verify truncation indicator, log count <= 2000
```

### Filtering
```
1. Load test file
2. browser_type in filter input: "ERROR"
3. browser_press_key: "Enter"
4. browser_snapshot → verify only ERROR lines visible
5. browser_click on filter chip X
6. browser_snapshot → verify all logs return
```

### Regex Filtering
```
1. Load test file
2. browser_type: "/Controller/"
3. browser_press_key: "Enter"
4. browser_snapshot → verify regex matches only
```

### Search
```
1. Load test file
2. browser_click on search input
3. browser_type: "ERROR"
4. browser_snapshot → verify match counter shows "1 of X"
5. browser_press_key: "Enter" → navigate to next match
6. browser_press_key: "Shift+Enter" → navigate to previous match
7. browser_click on X button → clear search
```

### Regex Search
```
1. Load test file
2. browser_click on regex toggle button
3. browser_type: "Controller.*Error"
4. browser_snapshot → verify matches highlighted
```

### Selection & Keyboard Shortcuts
```
1. Load test file
2. browser_press_key: "Control+a"
3. browser_snapshot → verify all selected
4. browser_press_key: "Delete"
5. browser_snapshot → verify logs hidden, deleted count shows
6. browser_press_key: "Escape"
```

### Polling Test
```
1. Open file via recent files (has full path)
2. browser_click on polling toggle
3. Bash: echo "NEW LOG LINE" >> /path/to/file.log
4. Wait 3+ seconds
5. browser_snapshot → verify new line appears
```

### Recent Files Persistence
```
1. browser_file_upload with test file
2. browser_snapshot → verify in recent files sidebar
3. browser_navigate (reload page)
4. browser_snapshot → verify recent file still listed
5. browser_click on recent file
6. browser_snapshot → verify file loads
```

### Multi-File Support
```
1. browser_file_upload with multiple files (select multiple)
2. browser_snapshot → verify all files in sidebar
3. browser_snapshot → verify "X of Y active" count
4. browser_click on file to toggle active state
5. browser_snapshot → verify logs filtered
```

### Individual File Removal
```
1. Load multiple files
2. browser_hover on file item → reveal X button
3. browser_click on X button
4. browser_snapshot → verify file removed from list
```

### Clear Recent Files
```
1. Load multiple files
2. browser_click on trash icon (clear button)
3. browser_snapshot → verify all files cleared
4. browser_navigate (reload page)
5. browser_snapshot → verify files not restored (Tauri backend cleared)
```

### Story/Logbook
```
1. Load test file
2. browser_click on log line gutter → add to story
3. browser_snapshot → verify story pane shows entry
4. browser_click on + button → create new logbook
5. browser_snapshot → verify new tab "Logbook 2"
6. browser_click on entry X → remove from story
```

---

## Verification Checklist

Each feature should be verified:

```
File Management:
[ ] File loads via file input
[ ] Multi-file drag-drop works
[ ] Large files truncated to 2000 lines
[ ] Recent files list works
[ ] Recent files persist across reload
[ ] Individual file removal works
[ ] Clear all recent files works
[ ] Toggle file active/inactive in merged view

Parsing:
[ ] SalesBox format parses correctly
[ ] IWF/Spring format parses correctly
[ ] Genie/Rust format parses correctly
[ ] Maven error format parses correctly
[ ] Grafana export format parses correctly

Search:
[ ] Text search finds matches
[ ] Regex search works (toggle)
[ ] Match counter shows X of Y
[ ] Up/Down navigation between matches
[ ] Current match highlighted in yellow
[ ] Search highlighting integrates with tokenization

Filtering:
[ ] Text filter works
[ ] Regex filter works
[ ] Exclude filter works
[ ] Service badges toggle visibility

Selection:
[ ] Ctrl+A selects all
[ ] Ctrl+C copies to clipboard
[ ] Delete hides selected
[ ] Line click toggles wrap

Stories/Logbook:
[ ] Create new logbook
[ ] Add logs to logbook (click gutter)
[ ] Remove logs from logbook
[ ] Multiple logbooks with tabs
[ ] Rename logbook
[ ] Delete logbook
[ ] Drag-reorder entries
[ ] Maximize/minimize pane

Polling:
[ ] Polling fetches new content (differential read)
```
