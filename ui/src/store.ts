/**
 * Mocha Log Viewer - Zustand Stores
 *
 * State management for log viewing, filtering, selection, and file handling.
 * Persisted to localStorage where appropriate.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LogViewerState, StoryState, FileState, ParsedFilter, RecentFile, LogEntry, OpenedFileWithLogs } from './types'

/**
 * Get short service name from log entry.
 * Uses logger if available, otherwise falls back to filename.
 * Duplicated from LogLine.tsx to avoid circular imports.
 */
function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    // Extract short name from logger (e.g., "c.s.c.c.bizlogic.MCPController" -> "MCPController")
    const logger = log.parsed.logger
    const parts = logger.split('.')
    return parts[parts.length - 1] || logger
  }
  return log.name
}

// ============================================================================
// Custom Storage for Set serialization
// ============================================================================

/**
 * Custom StateStorage for LogViewer store that properly handles Set serialization.
 *
 * The problem: Zustand's createJSONStorage uses JSON.stringify which converts Sets to "{}".
 * Solution: Implement StateStorage interface directly with custom serialize/deserialize.
 */
const logViewerStorage = {
  getItem: (name: string) => {
    const str = localStorage.getItem(name)
    if (!str) return null

    try {
      const parsed = JSON.parse(str)
      // Convert arrays back to Sets
      if (parsed.state) {
        if (Array.isArray(parsed.state.inactiveNames)) {
          parsed.state.inactiveNames = new Set(parsed.state.inactiveNames)
        }
      }
      return parsed
    } catch {
      return null
    }
  },
  setItem: (name: string, value: unknown): void => {
    try {
      // value is the raw state object (not stringified yet)
      const toStore = value as { state?: { inactiveNames?: Set<string> }; version?: number }

      // Convert Sets to arrays before serializing
      const serializable = {
        ...toStore,
        state: toStore.state
          ? {
              ...toStore.state,
              inactiveNames: toStore.state.inactiveNames instanceof Set
                ? Array.from(toStore.state.inactiveNames)
                : toStore.state.inactiveNames,
            }
          : undefined,
      }

      localStorage.setItem(name, JSON.stringify(serializable))
    } catch (e) {
      console.error('Failed to persist log viewer state:', e)
    }
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
  },
}


// ============================================================================
// useLogViewerStore - Service visibility and text filters
// ============================================================================

/**
 * Store for managing log viewer state including service visibility and filters.
 *
 * Features:
 * - inactiveNames: Set of service names that are currently hidden
 * - filters: Array of text/regex/exclude filters
 * - input: Current filter input value
 *
 * All state is persisted to localStorage.
 */
export const useLogViewerStore = create<LogViewerState>()(
  persist(
    (set, get) => ({
      // State
      inactiveNames: new Set<string>(),
      filters: [],
      input: '',

      // Actions
      setInactiveNames: (names: Set<string>) => set({ inactiveNames: names }),

      /**
       * Toggle a service name's visibility.
       * If no services are inactive and we click one, hide all others (solo mode).
       * If all but one are inactive and we click the visible one, show all.
       * Otherwise toggle the clicked service.
       */
      toggleName: (allNames: string[], name: string) => {
        const { inactiveNames } = get()
        const newInactive = new Set(inactiveNames)

        if (inactiveNames.size === 0) {
          // No filters active - clicking a service solos it (hides all others)
          for (const n of allNames) {
            if (n !== name) {
              newInactive.add(n)
            }
          }
        } else if (inactiveNames.size === allNames.length - 1 && !inactiveNames.has(name)) {
          // Only this service is visible - clicking it shows all
          newInactive.clear()
        } else {
          // Toggle the specific service
          if (newInactive.has(name)) {
            newInactive.delete(name)
          } else {
            newInactive.add(name)
          }
        }

        set({ inactiveNames: newInactive })
      },

      setFilters: (filters: ParsedFilter[]) => set({ filters }),

      addFilter: (filter: ParsedFilter) =>
        set((state) => ({ filters: [...state.filters, filter] })),

      removeFilter: (index: number) =>
        set((state) => ({
          filters: state.filters.filter((_, i) => i !== index),
        })),

      clearFilters: () => set({ filters: [], inactiveNames: new Set() }),

      setInput: (input: string) => set({ input }),
    }),
    {
      name: 'mocha-log-viewer-state',
      storage: logViewerStorage,
      partialize: (state) => ({
        inactiveNames: state.inactiveNames,
        filters: state.filters,
        // Don't persist input - always start empty
      }),
    }
  )
)

// ============================================================================
// useStoryStore - Story building state
// ============================================================================

/**
 * Store for managing the story pane - a curated selection of log lines.
 *
 * Features:
 * - storyHashes: Ordered array of log hashes in the story
 * - storyPaneHeight: Persisted height of the story pane
 * - storyPaneCollapsed: Whether the story pane is collapsed
 *
 * All state is persisted to localStorage.
 */
export const useStoryStore = create<StoryState>()(
  persist(
    (set, get) => ({
      // State
      storyHashes: [],
      storyPaneHeight: 200,
      storyPaneCollapsed: false,

      // Actions

      /**
       * Add a log entry to the story.
       */
      addToStory: (hash: string) => {
        const { storyHashes } = get()
        if (!storyHashes.includes(hash)) {
          set({ storyHashes: [...storyHashes, hash] })
        }
      },

      /**
       * Remove a log entry from the story.
       */
      removeFromStory: (hash: string) => {
        const { storyHashes } = get()
        set({ storyHashes: storyHashes.filter(h => h !== hash) })
      },

      /**
       * Toggle a log entry in/out of the story.
       */
      toggleStory: (hash: string) => {
        const { storyHashes } = get()
        if (storyHashes.includes(hash)) {
          set({ storyHashes: storyHashes.filter(h => h !== hash) })
        } else {
          set({ storyHashes: [...storyHashes, hash] })
        }
      },

      /**
       * Clear all entries from the story.
       */
      clearStory: () => {
        set({ storyHashes: [] })
      },

      /**
       * Set the story pane height.
       */
      setStoryPaneHeight: (height: number) => {
        set({ storyPaneHeight: height })
      },

      /**
       * Set the story pane collapsed state.
       */
      setStoryPaneCollapsed: (collapsed: boolean) => {
        set({ storyPaneCollapsed: collapsed })
      },
    }),
    {
      name: 'mocha-story',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// ============================================================================
// useFileStore - Multi-file viewing state
// ============================================================================

/**
 * Store for managing multi-file state.
 *
 * Features:
 * - openedFiles: Map of path -> OpenedFileWithLogs for loaded files
 * - recentFiles: Array of recently opened files
 * - isLoading: Loading indicator
 * - error: Error message from file operations
 *
 * Only recentFiles is persisted to localStorage (as a fallback for browser mode).
 * openedFiles are not persisted - they reload on app start.
 */

/**
 * Merge function for File store - deduplicates recentFiles by path
 */
const mergeFileState = (
  persistedState: unknown,
  currentState: FileState
): FileState => {
  const persisted = persistedState as Partial<{ recentFiles: RecentFile[] }>

  // If we have persisted recentFiles, use them but ensure no duplicates
  if (persisted?.recentFiles && Array.isArray(persisted.recentFiles)) {
    const seen = new Set<string>()
    const deduplicated = persisted.recentFiles.filter(file => {
      if (seen.has(file.path)) return false
      seen.add(file.path)
      return true
    })
    return {
      ...currentState,
      recentFiles: deduplicated,
    }
  }

  return currentState
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      // State
      openedFiles: new Map<string, OpenedFileWithLogs>(),
      recentFiles: [],
      isLoading: false,
      error: null,

      // Actions

      /**
       * Open a file (add to map or update if exists).
       * New files default to isActive: true.
       */
      openFile: (file: OpenedFileWithLogs) => {
        const { openedFiles } = get()
        const newMap = new Map(openedFiles)
        newMap.set(file.path, file)
        set({ openedFiles: newMap, error: null })
      },

      /**
       * Toggle a file's active state (visible/hidden in merged view).
       */
      toggleFileActive: (path: string) => {
        const { openedFiles } = get()
        const file = openedFiles.get(path)
        if (!file) return

        const newMap = new Map(openedFiles)
        newMap.set(path, { ...file, isActive: !file.isActive })
        set({ openedFiles: newMap })
      },

      /**
       * Replace all logs for a file (used for reload).
       */
      updateFileLogs: (path: string, logs: LogEntry[]) => {
        const { openedFiles } = get()
        const file = openedFiles.get(path)
        if (!file) return

        const newMap = new Map(openedFiles)
        newMap.set(path, { ...file, logs })
        set({ openedFiles: newMap })
      },

      /**
       * Append new logs to a file (used for polling/watching).
       */
      appendFileLogs: (path: string, newLogs: LogEntry[]) => {
        const { openedFiles } = get()
        const file = openedFiles.get(path)
        if (!file) return

        const newMap = new Map(openedFiles)
        newMap.set(path, {
          ...file,
          logs: [...file.logs, ...newLogs],
          lastModified: file.lastModified + newLogs.length, // Approximate, will be updated properly
        })
        set({ openedFiles: newMap })
      },

      // Deduplicate when setting recent files to prevent duplicates from race conditions
      setRecentFiles: (files: RecentFile[]) => {
        const seen = new Set<string>()
        const deduplicated = files.filter(file => {
          if (seen.has(file.path)) return false
          seen.add(file.path)
          return true
        })
        set({ recentFiles: deduplicated })
      },

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      setError: (error: string | null) => set({ error, isLoading: false }),
    }),
    {
      name: 'mocha-file-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist recentFiles - openedFiles should reload on app start
        recentFiles: state.recentFiles,
      }),
      merge: mergeFileState,
    }
  )
)

// ============================================================================
// Helper: Parse filter input string
// ============================================================================

/**
 * Parse a filter input string into a ParsedFilter object.
 *
 * Syntax:
 * - `/pattern/` - regex filter
 * - `-text` - exclude filter (hides matching lines)
 * - `text` - plain text filter (shows matching lines)
 */
export function parseFilterInput(input: string): ParsedFilter | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Check for regex pattern: /pattern/
  if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
    const pattern = trimmed.slice(1, -1)
    // Validate regex
    try {
      new RegExp(pattern)
      return {
        type: 'regex',
        value: pattern,
        text: trimmed,
      }
    } catch {
      // Invalid regex, treat as text
      return {
        type: 'text',
        value: trimmed,
        text: trimmed,
      }
    }
  }

  // Check for exclude pattern: -text
  if (trimmed.startsWith('-') && trimmed.length > 1) {
    return {
      type: 'exclude',
      value: trimmed.slice(1),
      text: trimmed,
    }
  }

  // Plain text filter
  return {
    type: 'text',
    value: trimmed,
    text: trimmed,
  }
}

// ============================================================================
// Helper: Apply filters to log entries
// ============================================================================

/**
 * Check if a log entry matches a single filter.
 */
function matchesFilter(log: LogEntry, filter: ParsedFilter): boolean {
  const searchText = log.data.toLowerCase()
  const content = log.parsed?.content?.toLowerCase() || ''

  switch (filter.type) {
    case 'regex': {
      try {
        const regex = new RegExp(filter.value, 'i')
        return regex.test(log.data) || (log.parsed?.content ? regex.test(log.parsed.content) : false)
      } catch {
        return false
      }
    }
    case 'text': {
      const searchValue = filter.value.toLowerCase()
      return searchText.includes(searchValue) || content.includes(searchValue)
    }
    case 'exclude': {
      const searchValue = filter.value.toLowerCase()
      return !(searchText.includes(searchValue) || content.includes(searchValue))
    }
    default:
      return true
  }
}

/**
 * Filter log entries based on active filters and service visibility.
 *
 * @param logs - Array of log entries to filter
 * @param filters - Array of active filters
 * @param inactiveNames - Set of hidden service names
 * @returns Filtered array of log entries
 */
export function filterLogs(
  logs: LogEntry[],
  filters: ParsedFilter[],
  inactiveNames: Set<string>
): LogEntry[] {
  return logs.filter((log) => {
    // Check if service is visible (using derived service name from logger)
    const serviceName = getServiceName(log)
    if (inactiveNames instanceof Set && inactiveNames.has(serviceName)) {
      return false
    }

    // Apply all filters (AND logic for include, all excludes must pass)
    const includeFilters = filters.filter((f) => f.type !== 'exclude')
    const excludeFilters = filters.filter((f) => f.type === 'exclude')

    // All include filters must match (if any)
    if (includeFilters.length > 0) {
      const matchesAnyInclude = includeFilters.some((f) => matchesFilter(log, f))
      if (!matchesAnyInclude) return false
    }

    // All exclude filters must pass (none should match the exclude pattern)
    if (excludeFilters.length > 0) {
      const passesAllExcludes = excludeFilters.every((f) => matchesFilter(log, f))
      if (!passesAllExcludes) return false
    }

    return true
  })
}
