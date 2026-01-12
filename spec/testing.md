# Testing Specification

## E2E Testing Approach

Run the actual compiled app, not Vite dev server.

### Build & Run
```bash
# 1. Build React frontend
cd ui && npm run build

# 2. Compile C backend
make

# 3. Run app (opens browser window)
./mocha
```

### Why This Approach
- Tests real C backend bindings (`readFile`, `getRecentFiles`, `addRecentFile`)
- Tests WebUI ↔ frontend communication
- Tests differential file reads with real files
- Tests polling with actual file changes
- What users actually experience

### Playwright MCP Test Flow
1. Start `./mocha` binary (opens browser window)
2. Use `browser_snapshot` to see UI state
3. Use `browser_file_upload` to test file loading
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

---

## Verification Checklist

Each PRD task marked `passes: "YYYY-MM-DD"` should be verified:

```
[ ] File loads via file input
[ ] Large files truncated to 2000 lines
[ ] SalesBox format parses correctly
[ ] IWF/Spring format parses correctly
[ ] Genie/Rust format parses correctly
[ ] Maven error format parses correctly
[ ] Text filter works
[ ] Regex filter works
[ ] Exclude filter works
[ ] Service badges toggle visibility
[ ] Ctrl+A selects all
[ ] Ctrl+C copies to clipboard
[ ] Delete hides selected
[ ] Line click toggles wrap
[ ] Polling fetches new content (differential read)
[ ] Recent files list works
[ ] Recent files persist across reload
```
