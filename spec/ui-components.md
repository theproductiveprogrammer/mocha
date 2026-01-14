# UI Components Specification

## Component Hierarchy

```
App
├── Sidebar
│   ├── Logo/Branding
│   ├── OpenFileButton
│   └── RecentFilesList
│       └── RecentFileItem (with remove button)
├── MainContent
│   ├── Toolbar
│   │   ├── ActiveFileCount
│   │   ├── SearchBar (with up/down/close)
│   │   └── WatchToggle
│   ├── LogViewer
│   │   ├── DropZone
│   │   └── LogLine (virtualized list)
│   └── StoryPane (resizable)
│       ├── StoryTabs (multiple logbooks)
│       └── StoryEntries (draggable for reorder)
```

## Component Specifications

### App (`App.tsx`)

**Purpose**: Root component managing file state, search, and routing data flow.

**State** (uses Zustand stores):
```typescript
// From useFileStore
openedFiles: Map<string, OpenedFileWithLogs>;  // Multi-file support
recentFiles: RecentFile[];
isLoading: boolean;
error: string | null;

// Local state
searchQuery: string;
searchIsRegex: boolean;
currentMatchIndex: number;
searchMatches: Array<{ hash: string; matchIndex: number }>;
```

**Responsibilities**:
- Load recent files on mount from Tauri backend
- Handle file opening (dialog, drag-drop, recent)
- Handle multi-file drag-drop with proper state management
- Manage search state and match navigation
- Coordinate Sidebar, LogViewer, and StoryPane
- Poll for file updates

**Key Functions**:
```typescript
async function handleOpenFile(path?: string): Promise<void>;
async function handleToggleWatch(): Promise<void>;
function handleFileDrop(files: FileList): void;
function handleClearRecent(): void;  // Clears both localStorage and Tauri backend
function handleRemoveFile(path: string): void;  // Remove individual file
function handleSearchChange(query: string, isRegex: boolean): void;
function handleSearchNext(): void;
function handleSearchPrev(): void;
```

---

### Sidebar (`components/Sidebar.tsx`)

**Purpose**: Display recent/opened files and provide file open button. Supports multi-file viewing.

**Props**:
```typescript
interface SidebarProps {
  recentFiles: RecentFile[];
  openedFiles: Map<string, OpenedFileWithLogs>;
  onSelectFile: (path?: string) => void;
  onToggleFile: (path: string) => void;  // Toggle visibility in merged view
  onRemoveFile: (path: string) => void;  // Remove individual file
  onClearRecent: () => void;
}
```

**UI Elements**:
- **Logo/Branding**: Mocha logo with coffee icon
- **"Open File..." button**: Calls `onSelectFile()` with no args
- **Recent files list** with RecentFileItem components:
  - File name (truncated if long)
  - Status indicator (checkbox if opened, clock if recent only)
  - Line count badge (if opened)
  - Last opened timestamp (relative, e.g., "2h ago")
  - **Remove button (X)**: Appears on hover, removes individual file
- **"Clear" button**: Clears all recent files (trash icon)
- **Footer**: Shows active file count (e.g., "3 of 5 active")

**RecentFileItem States**:
| State | Indicator | Background |
|-------|-----------|------------|
| Not opened | FileText icon | transparent |
| Opened but inactive | Circle dot | surface-raised |
| Opened and active | Checkmark | selection with accent border |

**Styling**:
- Width: 256px (w-64)
- Border-right separator (--mocha-border-subtle)
- Surface background (--mocha-surface)
- Scrollable if many recent files
- Slide-in animation with staggered delays

---

### Toolbar (`components/Toolbar.tsx`)

**Purpose**: Display search, file info, and watch controls.

**Props**:
```typescript
interface ToolbarProps {
  activeFileCount: number;
  totalLines: number;
  searchQuery: string;
  searchIsRegex: boolean;
  currentMatchIndex: number;
  totalMatches: number;
  isWatching: boolean;
  onSearchChange: (query: string, isRegex: boolean) => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onSearchClear: () => void;
  onToggleWatch: () => void;
}
```

**UI Sections**:

1. **File Info** (left):
   - Active file count badge (e.g., "3 files")
   - Total line count

2. **Search Bar** (center):
   - Text input with placeholder "Search..."
   - Regex toggle button (slashed circle icon)
   - Match counter (e.g., "3 of 15")
   - Up/Down navigation buttons (ChevronUp/ChevronDown)
   - Clear button (X)
   - Keyboard shortcuts: Enter for next, Shift+Enter for prev, Escape to clear

3. **Watch Toggle** (right):
   - Toggle button with eye icon
   - Active state with accent color

---

### LogViewer (`components/LogViewer.tsx`)

**Purpose**: Virtualized log display with filtering, search highlighting, and story support.

**Props**:
```typescript
interface LogViewerProps {
  logs: LogEntry[];
  searchQuery: string;
  searchIsRegex: boolean;
  currentMatchIndex: number;
  searchMatches: Array<{ hash: string; matchIndex: number }>;
  onToggleStory: (log: LogEntry) => void;
  jumpToHash?: string | null;       // Hash to scroll to (from logbook jump-to-source)
  onJumpComplete?: () => void;      // Called after jump scroll completes
}
```

**Zustand Stores Used**:
- `useLogViewerStore`: filters, service visibility (inactiveNames)
- `useSelectionStore`: selection, deleted hashes, wrapped hashes
- `useStoryStore`: active story hashes for highlighting

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
- Supports multi-file drop (processes each file)

---

### StoryPane (`components/StoryPane.tsx`)

**Purpose**: Resizable pane for building curated "logbooks" (stories) of important log entries.

**Visibility**: Shown when there are logs loaded OR any stories exist. This allows accessing logbook entries even when no files are open.

**Features**:
- Multiple named stories (logbooks) with tabs
- Drag-and-drop reordering of entries within a story
- Maximize/minimize toggle
- Resizable height via drag handle
- Collapse/expand functionality
- Jump-to-source: Click crosshair icon on entry to scroll to original log in viewer
  - Opens file if closed (uses `filePath` or falls back to matching filename in recent files)
  - Activates file if open but inactive
  - Scrolls to entry with flash highlight
- Auto-collapses when no logs are open (can still be manually expanded)

**Props**:
```typescript
interface StoryPaneProps {
  stories: Story[];
  activeStoryId: string | null;
  height: number;
  isCollapsed: boolean;
  isMaximized: boolean;
  onCreateStory: () => void;
  onDeleteStory: (id: string) => void;
  onRenameStory: (id: string, name: string) => void;
  onSelectStory: (id: string) => void;
  onRemoveEntry: (hash: string) => void;
  onClearStory: () => void;
  onReorderStory: (fromIndex: number, toIndex: number) => void;
  onHeightChange: (height: number) => void;
  onToggleCollapse: () => void;
  onToggleMaximize: () => void;
  onJumpToSource?: (log: LogEntry) => void;  // Opens file if needed, scrolls to entry
}
```

**Story Naming**:
- Default names: "Logbook 1", "Logbook 2", etc.
- When creating new story, finds next available number (avoids duplicates after deletion)
- Click to rename inline

**UI Elements**:
- **Header**: Collapse toggle, story tabs, new story button (+), maximize toggle
- **Tabs**: One per story, with close button on hover
- **Entry List**: Draggable log entries with timestamp, service badge, content
- **Drag Handle**: Resize pane height

---

### LogLine (`components/LogLine.tsx`)

**Purpose**: Render individual log entry with two-column layout and story support.

**Props**:
```typescript
interface LogLineProps {
  log: LogEntry;
  isInStory: boolean;       // Highlighted if in active story
  isContinuation: boolean;  // Hide timestamp/badge when true
  isLastInGroup: boolean;   // Show bottom border when true (end of group)
  searchQuery?: string;     // For search highlighting
  searchIsRegex?: boolean;
  isCurrentMatch?: boolean; // Yellow highlight for current search match
  isFlashing?: boolean;     // Flash animation for jump-to-source
  onToggleStory: (hash: string) => void;  // Add/remove from story
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
  openedFiles: Map<string, OpenedFileWithLogs>;  // Multi-file support
  recentFiles: RecentFile[];
  isLoading: boolean;
  error: string | null;

  openFile: (file: OpenedFileWithLogs) => void;
  toggleFileActive: (path: string) => void;
  updateFileLogs: (path: string, logs: LogEntry[]) => void;
  appendFileLogs: (path: string, newLogs: LogEntry[], newSize?: number) => void;
  setRecentFiles: (files: RecentFile[]) => void;
  addRecentFile: (file: RecentFile) => void;  // Uses get() to avoid race conditions
  removeRecentFile: (path: string) => void;   // Removes from recent AND opened
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Persisted to localStorage: mocha-file-state (recentFiles only)
```

### useStoryStore

```typescript
interface Story {
  id: string;
  name: string;
  entries: LogEntry[];  // Full log entries (independent of source files)
  createdAt: number;
}

interface StoryState {
  stories: Story[];
  activeStoryId: string | null;
  storyPaneHeight: number;
  storyPaneCollapsed: boolean;
  storyPaneMaximized: boolean;

  // Story management
  createStory: (name?: string) => string;  // Returns new story ID
  deleteStory: (id: string) => void;
  renameStory: (id: string, name: string) => void;
  setActiveStory: (id: string | null) => void;

  // Entry management (operates on active story)
  addToStory: (log: LogEntry) => void;
  removeFromStory: (hash: string) => void;
  toggleStory: (log: LogEntry) => void;
  clearStory: () => void;
  reorderStory: (fromIndex: number, toIndex: number) => void;

  // UI state
  setStoryPaneHeight: (height: number) => void;
  setStoryPaneCollapsed: (collapsed: boolean) => void;
  setStoryPaneMaximized: (maximized: boolean) => void;

  // Helper
  getActiveStoryHashes: () => string[];
}

// Persisted to localStorage: mocha-story-state
```

---

## Icons (Lucide)

| Icon | Usage |
|------|-------|
| `FolderOpen` | Open file button |
| `X` | Remove filter/file, close, clear search |
| `XCircle` | Clear error |
| `Check` | Selection indicator, active file checkbox |
| `Eye` / `EyeOff` | Watch toggle |
| `FileText` | File indicator (not opened) |
| `Clock` | Recent files timestamp |
| `Trash2` | Clear recent, delete story |
| `ChevronDown` / `ChevronUp` | Search navigation, expand/collapse |
| `Coffee` | App logo |
| `Plus` | Create new story |
| `Maximize2` / `Minimize2` | Story pane maximize toggle |
| `Book` | Story/logbook icon |
| `GripVertical` | Drag handle for reordering |
| `Search` | Search input icon |
| `CircleSlash` | Regex toggle (off) |
| `CircleDot` | Regex toggle (on) |

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
