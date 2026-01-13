# UI Components Specification

## Component Hierarchy

```
App
├── Sidebar
│   ├── OpenFileButton
│   └── RecentFilesList
├── MainContent
│   ├── Toolbar
│   │   ├── ServiceBadges
│   │   ├── ActiveFilters
│   │   ├── FilterInput
│   │   └── WatchToggle
│   ├── FileInfo
│   └── LogViewer
│       ├── DropZone
│       └── LogLine (virtualized list)
```

## Component Specifications

### App (`App.tsx`)

**Purpose**: Root component managing file state and routing data flow.

**State**:
```typescript
interface AppState {
  logs: LogEntry[];
  currentFile: OpenedFile | null;
  recentFiles: RecentFile[];
  isLoading: boolean;
  error: string | null;
}
```

**Responsibilities**:
- Load recent files on mount
- Handle file opening (dialog, drag-drop, recent)
- Register `window.onFileUpdate` callback
- Coordinate Sidebar and LogViewer

**Key Functions**:
```typescript
async function handleOpenFile(path?: string): Promise<void>;
async function handleToggleWatch(): Promise<void>;
function handleFileDrop(content: string, fileName: string): void;
```

---

### Sidebar (`components/Sidebar.tsx`)

**Purpose**: Display recent files and provide file open button.

**Props**:
```typescript
interface SidebarProps {
  recentFiles: RecentFile[];
  currentFile: OpenedFile | null;
  onSelectFile: (path?: string) => void;
  onClearRecent: () => void;
}
```

**UI Elements**:
- "Open File..." button (calls `onSelectFile()` with no args)
- Recent files list with:
  - File name
  - Last opened timestamp (relative, e.g., "2 hours ago")
  - Active indicator for current file
- "Clear" button for recent files

**Styling**:
- Width: 256px (w-64)
- Border-right separator
- Light gray background (bg-gray-50)
- Scrollable if many recent files

---

### Toolbar (`components/Toolbar.tsx`)

**Purpose**: Display filters, service badges, and file controls.

**Props**:
```typescript
interface ToolbarProps {
  serviceNames: string[];
  inactiveNames: Set<string>;
  filters: ParsedFilter[];
  filterInput: string;
  currentFile: OpenedFile | null;
  onToggleService: (name: string) => void;
  onAddFilter: (filter: ParsedFilter) => void;
  onRemoveFilter: (index: number) => void;
  onFilterInputChange: (value: string) => void;
  onToggleWatch: () => void;
}
```

**UI Sections**:

1. **File Info** (left):
   - File name or "No file open"
   - Line count badge
   - Truncation indicator ("last 2000 lines")

2. **Service Badges** (center):
   - Clickable badges for each service
   - Grayed out when inactive
   - Color-coded per service

3. **Active Filters** (center-right):
   - Removable filter chips
   - Show filter text (truncated if long)
   - X button to remove

4. **Filter Input** (right):
   - Text input with placeholder "Filter..."
   - Enter to add filter
   - Help text: "Use /regex/ or -exclude"

5. **Watch Toggle** (far right):
   - Toggle button with eye icon
   - Active state indicator

---

### LogViewer (`components/LogViewer.tsx`)

**Purpose**: Virtualized log display with filtering, selection, and keyboard shortcuts.

**Props**:
```typescript
interface LogViewerProps {
  logs: LogEntry[];
}
```

**Zustand Stores Used**:
- `useLogViewerStore`: filters, service visibility (inactiveNames)
- `useSelectionStore`: selection, deleted hashes, wrapped hashes

---

#### Virtualization

Uses `@tanstack/react-virtual` for efficient rendering of large log files.

```typescript
const virtualizer = useVirtualizer({
  count: filteredLogs.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 44,  // Default collapsed row height in px
  overscan: 10,            // Render 10 extra rows above/below viewport
  measureElement: (element) => element.getBoundingClientRect().height,
})
```

**Key Points**:
- Only ~30-50 DOM nodes rendered at any time (vs 1000+ without virtualization)
- Dynamic measurement via `measureElement` for variable-height expanded rows
- `overscan: 10` provides smooth scrolling buffer
- Absolute positioning with `transform: translateY()` for performance

---

#### Filtering Pipeline

```typescript
const filteredLogs = useMemo(() => {
  const filtered = filterLogs(logs, filters, inactiveNames, deletedHashes)
  const reversed = [...filtered].reverse()  // Newest-first display

  // Group consecutive logs, then reverse within each group for chronological order
  // This keeps overall newest-first, but entries within a group are chronological
  const result: LogEntry[] = []
  let currentGroup: LogEntry[] = []

  for (const log of reversed) {
    if (currentGroup.length === 0 || isSameGroup(currentGroup[currentGroup.length - 1], log)) {
      currentGroup.push(log)
    } else {
      result.push(...currentGroup.reverse())
      currentGroup = [log]
    }
  }
  if (currentGroup.length > 0) {
    result.push(...currentGroup.reverse())
  }
  return result
}, [logs, filters, inactiveNames, deletedHashes])
```

1. Apply service filter (exclude `inactiveNames`)
2. Apply text/regex filters
3. Exclude deleted hashes
4. Reverse array for newest-first ordering
5. Group consecutive logs (within 100ms + same logger), reverse within each group for chronological order

---

#### Line Continuation Detection

Lines are grouped together when they logically belong to the same log event. Continuation lines hide their timestamp/service badge and remove the bottom border.

**Continuation Rules** (checked in order):
```typescript
const isContinuation = !!(prev && (
  // 1. Stack trace lines are always continuations
  isStackTraceLine ||
  // 2. Within 100ms + same logger = grouped output
  (timestampWithin100ms && sameLogger) ||
  // 3. Line with no logger following a line with logger
  (hasNoLogger && prevHasLogger) ||
  // 4. Both have no logger (likely related plain lines)
  (hasNoLogger && !prev.parsed?.logger)
))
```

**Stack Trace Detection**:
```typescript
const isStackTraceLine = /^\s*at\s/.test(content) || /Exception|Error:/.test(content)
```

**Timestamp Proximity** (100ms threshold):
```typescript
const timestampWithin100ms = prev?.timestamp && log.timestamp &&
  Math.abs(prev.timestamp - log.timestamp) <= 100
```

**Same Logger Check**:
```typescript
const sameLogger = log.parsed?.logger && prev?.parsed?.logger &&
  log.parsed.logger === prev.parsed.logger
```

---

#### Selection

- **Gutter click**: Toggle single line selection
- **Shift+click**: Range select from last selected
- **Ctrl/Cmd+click**: Add to selection (same as regular click currently)

---

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+A` / `Cmd+A` | Select all visible logs |
| `Ctrl+C` / `Cmd+C` | Copy selected logs (raw data) |
| `Delete` / `Backspace` | Hide selected logs |
| `Escape` | Clear selection |

Shortcuts are disabled when focus is in input/textarea/select elements.

---

#### Drop Zone

- Overlay appears when dragging files
- Accepts `.log`, `.txt` files
- Parses and displays dropped content

---

### LogLine (`components/LogLine.tsx`)

**Purpose**: Render individual log entry with two-column layout.

**Props**:
```typescript
interface LogLineProps {
  log: LogEntry;
  isSelected: boolean;
  isWrapped: boolean;
  isContinuation: boolean;  // Hide timestamp/badge when true
  isLastInGroup: boolean;   // Show bottom border when true (end of group)
  onSelect: (hash: string, event: React.MouseEvent) => void;
  onToggleWrap: (hash: string) => void;
}
```

---

#### Two-Column Layout

```
┌────────┬─────────────┬──────────────────────────────────────────────────────┐
│ Gutter │ Left Column │ Right Column (Content)                               │
├────────┼─────────────┼──────────────────────────────────────────────────────┤
│   ○    │ 04:48:45    │ ActivityScheduler: Starting batch processing...      │
│        │ ActivitySch │ ← header row with timestamp, badge, and logger prefix│
├────────┼─────────────┼──────────────────────────────────────────────────────┤
│   ○    │             │ Processing batch #1 with limit 50                    │
│        │ (empty)     │ ← continuation: no timestamp/badge/logger prefix     │
├────────┼─────────────┼──────────────────────────────────────────────────────┤
│   ○    │             │ Found 2 activities in batch #1                       │
│        │ (empty)     │ ← continuation: content only                         │
└────────┴─────────────┴──────────────────────────────────────────────────────┘
```

**Column Widths**:
- Gutter: `w-6` (24px) - selection checkbox
- Left column: `w-28` (112px) - timestamp + service badge
- Right column: `flex-1` - log content

---

#### Row Heights

| Row Type | Height | Padding |
|----------|--------|---------|
| Normal row | `min-h-[40px]` | `py-2` (8px top/bottom) |
| Continuation row | Auto (content) | `py-0.5` (2px top/bottom) |
| Expanded row | Dynamic | `py-2` with wrapped content |

**Estimated Size**: 44px (used by virtualizer for initial layout)

---

#### Service Name Simplification

Logger paths are simplified to just the class name for display:

```typescript
// Input:  "c.s.c.controller.LeadVerificationHistoryController:466"
// Output: "LeadVerificationHistoryController"

function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    const logger = log.parsed.logger
    const withoutLineNum = logger.split(':')[0]  // Remove ":466"
    const parts = withoutLineNum.split('.')
    return parts[parts.length - 1] || withoutLineNum
  }
  return log.name
}
```

**Badge Tooltip**: Shows full logger path on hover (e.g., `c.s.c.controller.LeadVerificationHistoryController`)

---

#### Content Display

**Logger Prefix in Content**:
```typescript
const loggerInfo = parseLogger(log.parsed?.logger)
// Displays: "LeadController:466: " in bold before content
// Only shown on first line of group (header), hidden on continuation lines
```

**Continuation Lines**: Show only the content without the logger prefix, since the logger is already displayed in the header row's badge and content prefix.

**Line Number Coloring**:
- Normal logs: Line number in `text-green-600`
- ERROR/WARN logs: Line number inherits row color (red/amber)

**Truncation vs Wrap**:
- Default: `truncate` (single line with ellipsis)
- Expanded: `whitespace-pre-wrap break-words` (full content)
- Click content area to toggle

---

#### Service Badge Colors

Service colors are matched by checking if the service name **contains** the key:

```typescript
const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  core:        { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300' },
  app:         { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  platform:    { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300' },
  runner:      { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300' },
  iwf:         { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  rag:         { bg: 'bg-cyan-100',   text: 'text-cyan-700',   border: 'border-cyan-300' },
  transcriber: { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-300' },
  tracker:     { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  verify:      { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' },
  pixel:       { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-300' },
}

// Default (no match):
{ bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' }
```

**Badge Styling**:
```css
text-[10px] px-1.5 py-0.5 rounded border font-medium max-w-full truncate
```

---

#### Row Background Colors (by Log Level)

```typescript
function getRowStyle(log: LogEntry): { bg: string; text: string } {
  // ERROR level or exception pattern
  if (log.parsed?.level === 'ERROR') return { bg: 'bg-red-50', text: 'text-red-700' }
  if (/[.][A-Za-z0-9]*Exception/.test(log.data)) return { bg: 'bg-red-50', text: 'text-red-700' }

  // WARN level
  if (log.parsed?.level === 'WARN') return { bg: 'bg-amber-50', text: 'text-amber-800' }

  // INFO, DEBUG, TRACE, or unknown
  return { bg: 'bg-white', text: 'text-gray-800' }
}
```

---

#### Selection Gutter

| State | Background | Icon |
|-------|------------|------|
| Unselected | `bg-gray-50` | `○` (gray) |
| Selected | `bg-blue-500` | `✓` (white) |

**Selected Row Indicator**: `ring-2 ring-inset ring-blue-400`

---

#### API Call Display

When `log.parsed.apiCall` exists, shows additional line below content:

```typescript
{log.parsed.apiCall && (
  <div className="mt-1 text-cyan-600 text-xs">
    {direction === 'outgoing' ? '→' : '←'}
    {method} {endpoint} [{status}] ({timing}ms)
  </div>
)}
```

Example: `← POST /api/leads [200] (45ms)`

---

#### Click Interactions

| Area | Action |
|------|--------|
| Gutter | Toggle selection (supports Shift+click for range) |
| Content area | Toggle wrap/expand |

---

#### Borders

- Last row in group (`isLastInGroup`): `border-b border-gray-200` (bottom border)
- Other rows: No bottom border (visually grouped with next row)
- Left column: `border-r border-gray-200` (right border separator)

**Group Border Logic**: Border appears at the END of a group (after the last continuation line), not at the beginning. This visually connects the header with its continuations.

---

### DropZone (`components/DropZone.tsx`)

**Purpose**: Handle drag-and-drop file loading.

**Props**:
```typescript
interface DropZoneProps {
  onFileDrop: (content: string, fileName: string) => void;
  children: React.ReactNode;
}
```

**States**:
- Normal: invisible
- Dragging: Blue dashed border overlay

**Behavior**:
- Accept only .log, .txt files
- Read as text
- Call `onFileDrop` with content

---

## Zustand Stores

### useLogViewerStore

```typescript
interface LogViewerState {
  inactiveNames: Set<string>;
  filters: ParsedFilter[];
  input: string;

  setInactiveNames: (names: Set<string>) => void;
  toggleName: (allNames: string[], name: string) => void;
  setFilters: (filters: ParsedFilter[]) => void;
  addFilter: (filter: ParsedFilter) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;
  setInput: (input: string) => void;
}

// Persisted to localStorage: mocha-log-viewer-state
```

### useSelectionStore

```typescript
interface SelectionState {
  selectedHashes: Set<string>;
  deletedHashes: Set<string>;
  wrappedHashes: Set<string>;
  lastSelectedHash: string | null;

  toggleSelection: (hash: string) => void;
  selectRange: (hash1: string, hash2: string, allHashes: string[]) => void;
  selectAll: (allHashes: string[]) => void;
  deleteSelected: () => void;
  clearSelection: () => void;
  clearDeleted: () => void;
  toggleWrap: (hash: string) => void;
  cleanupInvalidHashes: (validHashes: string[]) => void;
}

// Persisted to localStorage: mocha-selection-state
```

### useFileStore

```typescript
interface FileState {
  currentFile: OpenedFile | null;
  recentFiles: RecentFile[];
  isLoading: boolean;
  error: string | null;

  setCurrentFile: (file: OpenedFile | null) => void;
  setRecentFiles: (files: RecentFile[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Persisted to localStorage: mocha-file-state (recentFiles only)
```

---

## Icons (Lucide)

| Icon | Usage |
|------|-------|
| `FolderOpen` | Open file button |
| `X` | Remove filter, close |
| `XCircle` | Clear error |
| `Check` | Selection indicator |
| `Eye` / `EyeOff` | Watch toggle |
| `FileText` | File indicator |
| `Clock` | Recent files |
| `Trash2` | Clear recent |
| `ChevronDown` / `ChevronUp` | Expand/collapse |

---

## Styling Guidelines

### Typography

**Primary Font**: `font-['Fira_Code',monospace]`
- Log content: `text-[13px] leading-tight`
- Timestamps: `text-xs text-gray-400 font-mono`
- Service badges: `text-[10px] font-medium`
- API calls: `text-xs text-cyan-600`

### Colors

**Backgrounds**:
- App background: `#FAFAFA` (bg-[#FAFAFA])
- Normal row: `bg-white`
- Error row: `bg-red-50`
- Warning row: `bg-amber-50`
- Sidebar: `bg-gray-50`
- Gutter (unselected): `bg-gray-50`
- Gutter (selected): `bg-blue-500`

**Text**:
- Normal: `text-gray-800`
- Error: `text-red-700`
- Warning: `text-amber-800`
- Muted: `text-gray-400`, `text-gray-500`
- Line numbers: `text-green-600` (normal), inherited (error/warn)

**Borders**:
- Default: `border-gray-200`
- Service badges: `border-{color}-300`

**Selection**:
- Ring: `ring-2 ring-inset ring-blue-400`
- Gutter: `bg-blue-500` with white checkmark

### Spacing

| Element | Width/Height | Tailwind Class |
|---------|--------------|----------------|
| Sidebar | 256px | `w-64` |
| Toolbar | 48px | `h-12` |
| Selection gutter | 24px | `w-6` |
| Left column (timestamp/badge) | 112px | `w-28` |
| Normal row min-height | 40px | `min-h-[40px]` |
| Normal row padding | 8px vertical | `py-2` |
| Continuation row padding | 2px vertical | `py-0.5` |
| Content horizontal padding | 12px | `px-3` |

### Visual Hierarchy

1. **Row separation**: Bottom border on last row of each group (connects header with continuations)
2. **Column separation**: Right border on left column
3. **Selection indicator**: Blue ring around selected rows
4. **Error/Warning**: Background tint + text color change
5. **Continuation grouping**: Compact padding + no timestamp/badge, chronological order within group

### Responsive

- Minimum window width: 800px
- Sidebar can be collapsed on narrow screens
- Content truncates with ellipsis, click to expand
