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
export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

/**
 * API call direction
 */
export type ApiDirection = "outgoing" | "incoming";

/**
 * API call phase
 */
export type ApiPhase = "request" | "response" | "complete";

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
 * Token type for tokenized log content rendering
 */
export type TokenType =
  | "timestamp"
  | "level"
  | "service"
  | "symbol"
  | "url"
  | "message"
  | "data"
  | "json"
  | "marker.error"
  | "marker.warn"
  | "marker.info" // Log level markers like [ERROR], [WARN], [INFO]
  | "search.match"; // Highlighted search match

/**
 * A single token from tokenized log content
 */
export interface LogToken {
  text: string;
  type: TokenType;
}

/**
 * Result from tokenizing log content
 * Includes detected level if found at start of content
 */
export interface TokenizeResult {
  tokens: LogToken[];
  detectedLevel?: LogLevel;
}

/**
 * A single log entry with original and parsed data
 */
export interface LogEntry {
  name: string; // Service/file name (for display)
  filePath?: string; // Full file path (for reopening)
  data: string; // Original line (for clipboard)
  isErr: boolean; // Whether from stderr
  hash?: string; // Unique identifier
  timestamp?: number; // Unix timestamp (for sorting)
  sortIndex?: number; // Secondary sort key within same timestamp
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
  path: string; // Full file path
  name: string; // Filename only
  size?: number; // File size in bytes
}

/**
 * An opened file with its parsed logs.
 * Used for multi-file viewing where multiple files can be open simultaneously.
 * All opened files are shown in the merged view (no inactive state).
 */
export interface OpenedFileWithLogs extends OpenedFile {
  logs: LogEntry[]; // Parsed log entries from this file
  lastModified: number; // For polling - last known file size
  mtime?: number; // File modification time (Unix millis)
}

/**
 * A file in the recent files list
 */
export interface RecentFile {
  path: string; // Full file path
  name: string; // Filename only
  lastOpened: number; // Unix timestamp in milliseconds
  mtime?: number; // File modification time (Unix millis)
  size?: number; // File size in bytes
  exists: boolean; // Whether file exists on disk
}

/**
 * Result from readFile Tauri command
 */
export interface FileResult {
  success: boolean;
  content?: string; // File contents (new bytes only if offset > 0)
  path?: string; // Full file path
  name?: string; // Filename only
  size?: number; // Current file size in bytes
  prevSize?: number; // Offset that was passed in
  mtime?: number; // File modification time (Unix millis)
  truncated?: boolean; // True if file was truncated/replaced
  error?: string; // Error message if failed
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Type of filter applied to logs
 */
export type FilterType = "regex" | "exclude" | "text";

/**
 * A parsed filter for log filtering
 */
export interface ParsedFilter {
  type: FilterType;
  value: string; // The pattern/value to match
  text: string; // Display text for the filter chip
}

// ============================================================================
// Theme Types
// ============================================================================

/**
 * Available theme names
 * - 'observatory': Dark theme - deep space control room with amber glows
 * - 'morning-brew': Light theme - warm café workspace with espresso accents
 * - 'system': Auto-detect based on OS preference
 */
export type ThemeName = "observatory" | "morning-brew" | "system";

/**
 * Theme metadata for UI display
 */
export interface ThemeInfo {
  id: ThemeName;
  name: string;
  description: string;
  isDark: boolean | "system";
}

/**
 * Settings store state for app-wide settings
 */
export interface SettingsState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
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
 * A logbook containing curated log entries
 * Stores full log data so entries persist even when source files are unloaded
 */
export interface Story {
  id: string;
  name: string;
  entries: LogEntry[]; // Full log entries (independent of source files)
  createdAt: number;
  manuallyAddedHashes: string[]; // Hashes of logs added manually (not streamed)
}

/**
 * Main view mode for the content area
 */
export type MainViewMode = "logs" | "logbook";

/**
 * Story store state for building curated log narratives
 * Supports multiple named stories (notebooks)
 */
export interface StoryState {
  stories: Story[];
  activeStoryId: string | null;
  mainViewMode: MainViewMode;
  streamingToStoryId: string | null; // ID of story currently streaming new logs

  // Story management
  createStory: (name?: string) => string;
  deleteStory: (id: string) => void;
  renameStory: (id: string, name: string) => void;
  setActiveStory: (id: string | null) => void;

  // Log management (operates on active story) - now takes full LogEntry
  addToStory: (log: LogEntry) => void;
  addLogsToStory: (logs: LogEntry[], storyId: string) => void; // Batch add for streaming
  removeFromStory: (hash: string) => void;
  toggleStory: (log: LogEntry) => void;
  clearStory: () => void;
  reorderStory: (fromIndex: number, toIndex: number) => void;

  // UI state
  setMainViewMode: (mode: MainViewMode) => void;

  // Streaming control
  setStreamingStory: (id: string | null) => void;

  // Helper to get hashes from active story (for highlighting in log viewer)
  getActiveStoryHashes: () => string[];
}

/**
 * File store state for opened files and recent files.
 * Supports multi-file viewing with interleaved logs.
 */
export interface FileState {
  openedFiles: Map<string, OpenedFileWithLogs>; // path -> file data with logs
  recentFiles: RecentFile[];
  isLoading: boolean;
  error: string | null;

  // Actions
  openFile: (file: OpenedFileWithLogs) => void;
  closeFile: (path: string) => void;
  updateFileLogs: (path: string, logs: LogEntry[]) => void;
  appendFileLogs: (path: string, newLogs: LogEntry[], newSize?: number) => void;
  setRecentFiles: (files: RecentFile[]) => void;
  addRecentFile: (file: RecentFile) => void;
  removeRecentFile: (path: string) => void;
  clearOpenedFiles: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getOpenedFilePaths: () => string[];
  getPathsToRestore: () => string[];
  clearPathsToRestore: () => void;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for the Sidebar component
 */
export interface SidebarProps {
  // File management
  recentFiles: RecentFile[];
  openedFiles: Map<string, OpenedFileWithLogs>;
  onSelectFile: (path?: string) => void;
  onCloseFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onClearRecent: () => void;

  // Logbook management
  stories: Story[];
  activeStoryId: string | null;
  mainViewMode: MainViewMode;
  onSelectLogbook: (id: string) => void;
  onCreateLogbook: (name?: string) => void;
  onDeleteLogbook: (id: string) => void;
  onRenameLogbook: (id: string, name: string) => void;

  // Streaming control
  streamingToStoryId: string | null;
  streamingBufferCount: number;
  onToggleStreaming: (id: string) => void;

  // Theme
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;

  // UI state
  isCollapsed: boolean;
  onToggleCollapsed: () => void;

  // Highlight newly added file
  highlightedFilePath?: string | null;
}

/**
 * Props for the Toolbar component
 */
export interface ToolbarProps {
  filters: ParsedFilter[];
  filterInput: string;
  activeFileCount: number;
  onAddFilter: (filter: ParsedFilter) => void;
  onRemoveFilter: (index: number) => void;
  onFilterInputChange: (value: string) => void;
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
  isInStory: boolean;
  isContinuation: boolean;
  isLastInGroup: boolean;
  onToggleStory: (hash: string) => void;
}

// Export empty object to make this a module
export {};
