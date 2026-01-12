# Testing Specification

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

## E2E Verification (Playwright MCP)

Claude uses the Playwright MCP tools to verify features during development:

### File Loading
1. Navigate to app URL
2. Upload test file via `browser_file_upload`
3. Take snapshot, verify logs displayed
4. Upload large file, verify truncation indicator

### Filtering
1. Load test file
2. Type filter text, press Enter
3. Verify filtered results in snapshot
4. Test regex `/pattern/`
5. Test exclude `-pattern`
6. Click service badge, verify filtering

### Selection
1. Load test file
2. Press Ctrl+A, verify selection in snapshot
3. Press Delete, verify logs hidden
4. Press Ctrl+C, verify clipboard (if possible)

### Polling
1. Load file from recent list (has path)
2. Toggle polling on
3. Append to log file via Bash
4. Wait 3 seconds
5. Verify new content appears

### UI Interactions
1. Click log line content, verify wrap toggle
2. Click filter chip X, verify removal
3. Hover service badge, verify tooltip

## Verification Checklist

Each PRD task marked `passes: "true"` should be verified:

```
[ ] File loads via drag-drop or file input
[ ] Large files truncated to 2000 lines
[ ] All 11 log formats parse correctly
[ ] Text filter works
[ ] Regex filter works
[ ] Exclude filter works
[ ] Service badges toggle visibility
[ ] Ctrl+A selects all
[ ] Ctrl+C copies to clipboard
[ ] Delete hides selected
[ ] Line click toggles wrap
[ ] Polling fetches new content
[ ] Recent files list works
[ ] Recent files persist across reload
```
