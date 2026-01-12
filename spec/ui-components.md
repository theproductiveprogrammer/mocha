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

**Purpose**: Main log display with filtering, selection, and interactions.

**Props**:
```typescript
interface LogViewerProps {
  logs: LogEntry[];
  currentFile: OpenedFile | null;
  onOpenFile: (path?: string) => void;
  onToggleWatch: () => void;
}
```

**Zustand Stores Used**:
- `useLogViewerStore`: filters, service visibility
- `useSelectionStore`: selection, deleted hashes, wrapped hashes

**Features**:

1. **Filtering** (via `useMemo`):
   - Apply service filter (inactiveNames)
   - Apply text/regex filters
   - Exclude deleted hashes
   - Reverse for newest-first

2. **Selection**:
   - Click: toggle selection
   - Ctrl+Click: add to selection
   - Shift+Click: range select
   - Selection gutter on left

3. **Keyboard Shortcuts**:
   - `Ctrl+A`: Select all visible
   - `Ctrl+C`: Copy selected (raw data)
   - `Delete/Backspace`: Hide selected
   - `Escape`: Clear selection

4. **Drop Zone**:
   - Overlay when dragging files
   - Accept .log, .txt files
   - Parse and display dropped content

---

### LogLine (`components/LogLine.tsx`)

**Purpose**: Render individual log entry with formatting.

**Props**:
```typescript
interface LogLineProps {
  log: LogEntry;
  isSelected: boolean;
  isWrapped: boolean;
  onSelect: (hash: string, event: React.MouseEvent) => void;
  onToggleWrap: (hash: string) => void;
}
```

**Layout**:
```
┌──────┬───────────────┬─────────────────────────────────────────┐
│ ☐    │ 13:45:23 core │ [INFO] Application started successfully │
│ gutter│   timestamp   │              content                    │
└──────┴───────────────┴─────────────────────────────────────────┘
```

**Styling by Level**:
```typescript
const LEVEL_STYLES = {
  ERROR: 'bg-red-50 text-red-700',
  WARN: 'bg-amber-50 text-amber-800',
  INFO: '',
  DEBUG: 'text-gray-600',
  TRACE: 'text-gray-500',
};
```

**Service Colors**:
```typescript
const SERVICE_COLORS = {
  core: { bg: "bg-blue-100", text: "text-blue-700" },
  app: { bg: "bg-purple-100", text: "text-purple-700" },
  platform: { bg: "bg-green-100", text: "text-green-700" },
  runner: { bg: "bg-gray-100", text: "text-gray-600" },
  iwf: { bg: "bg-orange-100", text: "text-orange-700" },
  rag: { bg: "bg-cyan-100", text: "text-cyan-700" },
  transcriber: { bg: "bg-pink-100", text: "text-pink-700" },
  tracker: { bg: "bg-yellow-100", text: "text-yellow-700" },
  verify: { bg: "bg-indigo-100", text: "text-indigo-700" },
  pixel: { bg: "bg-teal-100", text: "text-teal-700" },
  // Default for unknown services
  default: { bg: "bg-gray-100", text: "text-gray-700" },
};
```

**Content Display**:
- Click to toggle wrap
- Truncate with `line-clamp-3` when not wrapped
- Full `whitespace-pre-wrap` when wrapped
- Special formatting for API calls

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

**Font**: `font-mono` with Fira Code

**Colors**:
- Background: `#FAFAFA` (bg-gray-50)
- Border: `border-gray-200`
- Selection: `bg-blue-100`
- Hover: `hover:bg-gray-100`

**Spacing**:
- Sidebar width: `w-64` (256px)
- Toolbar height: `h-12` (48px)
- Log line padding: `px-2 py-1`
- Gutter width: `w-6` (24px)

**Responsive**:
- Minimum window width: 800px
- Sidebar can be collapsed on narrow screens
