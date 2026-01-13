/**
 * Mocha Log Viewer - TypeScript Type Definitions
 *
 * Core types used throughout the application for log parsing,
 * file handling, and UI state management.
 */

// ============================================================================
// Log Entry Types
// ============================================================================

/**
 * Log level enum for parsed log lines
 */
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

/**
 * API call direction
 */
export type ApiDirection = 'outgoing' | 'incoming';

/**
 * API call phase
 */
export type ApiPhase = 'request' | 'response' | 'complete';

/**
 * Information about an API call extracted from a log line
 */
export interface ApiCallInfo {
  direction: ApiDirection;
  phase: ApiPhase;
  method?: string;
  endpoint: string;
  status?: number;
  timing?: string;
  requestBody?: string;
  responseBody?: string;
}

/**
 * Parsed information extracted from a log line
 */
export interface ParsedLogLine {
  timestamp?: string;
  level?: LogLevel;
  logger?: string;
  content: string;
  apiCall?: ApiCallInfo;
}

/**
 * A single log entry with original and parsed data
 */
export interface LogEntry {
  name: string;           // Service/file name
  data: string;           // Original line (for clipboard)
  isErr: boolean;         // Whether from stderr
  hash?: string;          // Unique identifier
  timestamp?: number;     // Unix timestamp
  parsed?: ParsedLogLine; // Parsed log information
}

/**
 * Result from parsing an entire log file
 */
export interface ParsedLogFileResult {
  logs: LogEntry[];
  totalLines: number;
  truncated: boolean;
}

// ============================================================================
// File Types
// ============================================================================

/**
 * Information about a currently opened file
 */
export interface OpenedFile {
  path: string;    // Full file path
  name: string;    // Filename only
  size?: number;   // File size in bytes
}

/**
 * An opened file with its parsed logs and active state.
 * Used for multi-file viewing where multiple files can be open simultaneously.
 */
export interface OpenedFileWithLogs extends OpenedFile {
  logs: LogEntry[];       // Parsed log entries from this file
  isActive: boolean;      // Whether logs are shown in merged view
  lastModified: number;   // For polling - last known file size
}

/**
 * A file in the recent files list
 */
export interface RecentFile {
  path: string;        // Full file path
  name: string;        // Filename only
  lastOpened: number;  // Unix timestamp in milliseconds
}

/**
 * Result from readFile Tauri command
 */
export interface FileResult {
  success: boolean;
  content?: string;   // File contents (new bytes only if offset > 0)
  path?: string;      // Full file path
  name?: string;      // Filename only
  size?: number;      // Current file size in bytes
  prevSize?: number;  // Offset that was passed in
  error?: string;     // Error message if failed
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Type of filter applied to logs
 */
export type FilterType = 'regex' | 'exclude' | 'text';

/**
 * A parsed filter for log filtering
 */
export interface ParsedFilter {
  type: FilterType;
  value: string;  // The pattern/value to match
  text: string;   // Display text for the filter chip
}

// ============================================================================
// Store State Types (Zustand)
// ============================================================================

/**
 * LogViewer store state for service filtering and text filters
 */
export interface LogViewerState {
  inactiveNames: Set<string>;
  filters: ParsedFilter[];
  input: string;

  // Actions
  setInactiveNames: (names: Set<string>) => void;
  toggleName: (allNames: string[], name: string) => void;
  setFilters: (filters: ParsedFilter[]) => void;
  addFilter: (filter: ParsedFilter) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;
  setInput: (input: string) => void;
}

/**
 * Selection store state for log line selection and deletion
 */
export interface SelectionState {
  selectedHashes: Set<string>;
  deletedHashes: Set<string>;
  wrappedHashes: Set<string>;
  lastSelectedHash: string | null;

  // Actions
  toggleSelection: (hash: string) => void;
  selectRange: (hash1: string, hash2: string, allHashes: string[]) => void;
  selectAll: (allHashes: string[]) => void;
  deleteSelected: () => void;
  clearSelection: () => void;
  clearDeleted: () => void;
  toggleWrap: (hash: string) => void;
  cleanupInvalidHashes: (validHashes: string[]) => void;
}

/**
 * File store state for opened files and recent files.
 * Supports multi-file viewing with interleaved logs.
 */
export interface FileState {
  openedFiles: Map<string, OpenedFileWithLogs>;  // path -> file data with logs
  recentFiles: RecentFile[];
  isLoading: boolean;
  error: string | null;

  // Actions
  openFile: (file: OpenedFileWithLogs) => void;
  toggleFileActive: (path: string) => void;
  updateFileLogs: (path: string, logs: LogEntry[]) => void;
  appendFileLogs: (path: string, newLogs: LogEntry[]) => void;
  setRecentFiles: (files: RecentFile[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for the Sidebar component
 */
export interface SidebarProps {
  recentFiles: RecentFile[];
  openedFiles: Map<string, OpenedFileWithLogs>;
  onSelectFile: (path?: string) => void;
  onToggleFile: (path: string) => void;
  onClearRecent: () => void;
}

/**
 * Props for the Toolbar component
 */
export interface ToolbarProps {
  filters: ParsedFilter[];
  filterInput: string;
  activeFileCount: number;
  totalLines: number;
  onAddFilter: (filter: ParsedFilter) => void;
  onRemoveFilter: (index: number) => void;
  onFilterInputChange: (value: string) => void;
  onToggleWatch: () => void;
}

/**
 * Props for the LogViewer component
 */
export interface LogViewerProps {
  logs: LogEntry[];
}

/**
 * Props for the LogLine component
 */
export interface LogLineProps {
  log: LogEntry;
  isSelected: boolean;
  isWrapped: boolean;
  onSelect: (hash: string, event: React.MouseEvent) => void;
  onToggleWrap: (hash: string) => void;
}

// Export empty object to make this a module
export {};
