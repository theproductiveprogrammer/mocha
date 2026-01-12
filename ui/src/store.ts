/**
 * Mocha Log Viewer - Zustand Stores
 *
 * State management for log viewing, filtering, selection, and file handling.
 * Persisted to localStorage where appropriate.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LogViewerState, SelectionState, FileState, ParsedFilter, OpenedFile, RecentFile } from './types'

// ============================================================================
// Custom Storage for Set serialization
// ============================================================================

/**
 * Custom storage that handles Set serialization/deserialization for localStorage.
 * Sets are converted to arrays for JSON storage and back to Sets on load.
 */
const setAwareStorage = {
  getItem: (name: string): string | null => {
    const str = localStorage.getItem(name)
    if (!str) return null

    try {
      const parsed = JSON.parse(str)
      // Convert arrays back to Sets for known Set fields
      if (parsed.state) {
        if (Array.isArray(parsed.state.inactiveNames)) {
          parsed.state.inactiveNames = new Set(parsed.state.inactiveNames)
        }
      }
      return JSON.stringify(parsed)
    } catch {
      return str
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      const parsed = JSON.parse(value)
      // Convert Sets to arrays for JSON storage
      if (parsed.state) {
        if (parsed.state.inactiveNames instanceof Set) {
          parsed.state.inactiveNames = Array.from(parsed.state.inactiveNames)
        }
      }
      localStorage.setItem(name, JSON.stringify(parsed))
    } catch {
      localStorage.setItem(name, value)
    }
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
  },
}

/**
 * Custom storage for Selection store - handles multiple Set fields
 */
const selectionStorage = {
  getItem: (name: string): string | null => {
    const str = localStorage.getItem(name)
    if (!str) return null

    try {
      const parsed = JSON.parse(str)
      // Convert arrays back to Sets for all Set fields
      if (parsed.state) {
        if (Array.isArray(parsed.state.selectedHashes)) {
          parsed.state.selectedHashes = new Set(parsed.state.selectedHashes)
        }
        if (Array.isArray(parsed.state.deletedHashes)) {
          parsed.state.deletedHashes = new Set(parsed.state.deletedHashes)
        }
        if (Array.isArray(parsed.state.wrappedHashes)) {
          parsed.state.wrappedHashes = new Set(parsed.state.wrappedHashes)
        }
      }
      return JSON.stringify(parsed)
    } catch {
      return str
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      const parsed = JSON.parse(value)
      // Convert Sets to arrays for JSON storage
      if (parsed.state) {
        if (parsed.state.selectedHashes instanceof Set) {
          parsed.state.selectedHashes = Array.from(parsed.state.selectedHashes)
        }
        if (parsed.state.deletedHashes instanceof Set) {
          parsed.state.deletedHashes = Array.from(parsed.state.deletedHashes)
        }
        if (parsed.state.wrappedHashes instanceof Set) {
          parsed.state.wrappedHashes = Array.from(parsed.state.wrappedHashes)
        }
      }
      localStorage.setItem(name, JSON.stringify(parsed))
    } catch {
      localStorage.setItem(name, value)
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
      storage: createJSONStorage(() => setAwareStorage),
      partialize: (state) => ({
        inactiveNames: state.inactiveNames,
        filters: state.filters,
        // Don't persist input - always start empty
      }),
    }
  )
)

// ============================================================================
// useSelectionStore - Selection, deletion, and wrap state
// ============================================================================

/**
 * Store for managing log line selection, deletion (hiding), and text wrapping.
 *
 * Features:
 * - selectedHashes: Set of currently selected log hashes
 * - deletedHashes: Set of hidden/deleted log hashes
 * - wrappedHashes: Set of logs with expanded text wrapping
 * - lastSelectedHash: Tracks last selection for Shift+Click range selection
 *
 * Only deletedHashes and wrappedHashes are persisted to localStorage.
 */
export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      // State
      selectedHashes: new Set<string>(),
      deletedHashes: new Set<string>(),
      wrappedHashes: new Set<string>(),
      lastSelectedHash: null,

      // Actions

      /**
       * Toggle selection of a single log entry.
       * Updates lastSelectedHash for range selection support.
       */
      toggleSelection: (hash: string) => {
        const { selectedHashes } = get()
        const newSelected = new Set(selectedHashes)

        if (newSelected.has(hash)) {
          newSelected.delete(hash)
        } else {
          newSelected.add(hash)
        }

        set({ selectedHashes: newSelected, lastSelectedHash: hash })
      },

      /**
       * Select a range of log entries between two hashes (for Shift+Click).
       * Requires the full list of hashes to determine the range.
       */
      selectRange: (hash1: string, hash2: string, allHashes: string[]) => {
        const idx1 = allHashes.indexOf(hash1)
        const idx2 = allHashes.indexOf(hash2)

        if (idx1 === -1 || idx2 === -1) return

        const start = Math.min(idx1, idx2)
        const end = Math.max(idx1, idx2)
        const rangeHashes = allHashes.slice(start, end + 1)

        const { selectedHashes } = get()
        const newSelected = new Set(selectedHashes)

        for (const hash of rangeHashes) {
          newSelected.add(hash)
        }

        set({ selectedHashes: newSelected, lastSelectedHash: hash2 })
      },

      /**
       * Select all log entries from the provided list of hashes.
       */
      selectAll: (allHashes: string[]) => {
        set({
          selectedHashes: new Set(allHashes),
          lastSelectedHash: allHashes.length > 0 ? allHashes[allHashes.length - 1] : null,
        })
      },

      /**
       * Move all selected hashes to deleted set (hide them).
       * Clears the selection after deleting.
       */
      deleteSelected: () => {
        const { selectedHashes, deletedHashes } = get()
        const newDeleted = new Set(deletedHashes)

        for (const hash of selectedHashes) {
          newDeleted.add(hash)
        }

        set({
          deletedHashes: newDeleted,
          selectedHashes: new Set(),
          lastSelectedHash: null,
        })
      },

      /**
       * Clear all selections (does not restore deleted items).
       */
      clearSelection: () => {
        set({ selectedHashes: new Set(), lastSelectedHash: null })
      },

      /**
       * Clear all deleted hashes (restore hidden logs).
       */
      clearDeleted: () => {
        set({ deletedHashes: new Set() })
      },

      /**
       * Toggle text wrapping for a log entry.
       */
      toggleWrap: (hash: string) => {
        const { wrappedHashes } = get()
        const newWrapped = new Set(wrappedHashes)

        if (newWrapped.has(hash)) {
          newWrapped.delete(hash)
        } else {
          newWrapped.add(hash)
        }

        set({ wrappedHashes: newWrapped })
      },

      /**
       * Clean up invalid hashes that no longer exist in the current logs.
       * Call this when loading a new file to prevent stale state.
       */
      cleanupInvalidHashes: (validHashes: string[]) => {
        const validSet = new Set(validHashes)
        const { selectedHashes, deletedHashes, wrappedHashes } = get()

        const newSelected = new Set([...selectedHashes].filter((h) => validSet.has(h)))
        const newDeleted = new Set([...deletedHashes].filter((h) => validSet.has(h)))
        const newWrapped = new Set([...wrappedHashes].filter((h) => validSet.has(h)))

        set({
          selectedHashes: newSelected,
          deletedHashes: newDeleted,
          wrappedHashes: newWrapped,
        })
      },
    }),
    {
      name: 'mocha-selection-state',
      storage: createJSONStorage(() => selectionStorage),
      partialize: (state) => ({
        // Only persist deleted and wrapped - selections should reset on load
        deletedHashes: state.deletedHashes,
        wrappedHashes: state.wrappedHashes,
      }),
    }
  )
)

// ============================================================================
// useFileStore - File and loading state
// ============================================================================

/**
 * Store for managing file state including current file, recent files, and loading state.
 *
 * Features:
 * - currentFile: Currently opened file info
 * - recentFiles: Array of recently opened files
 * - isLoading: Loading indicator
 * - error: Error message from file operations
 *
 * Only recentFiles is persisted to localStorage (as a fallback for browser mode).
 */
export const useFileStore = create<FileState>()(
  persist(
    (set) => ({
      // State
      currentFile: null,
      recentFiles: [],
      isLoading: false,
      error: null,

      // Actions
      setCurrentFile: (file: OpenedFile | null) => set({ currentFile: file, error: null }),

      setRecentFiles: (files: RecentFile[]) => set({ recentFiles: files }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      setError: (error: string | null) => set({ error, isLoading: false }),
    }),
    {
      name: 'mocha-file-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist recentFiles - currentFile and loading state should reset on load
        recentFiles: state.recentFiles,
      }),
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

import type { LogEntry } from './types'

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
 * @param deletedHashes - Set of deleted log hashes (optional)
 * @returns Filtered array of log entries
 */
export function filterLogs(
  logs: LogEntry[],
  filters: ParsedFilter[],
  inactiveNames: Set<string>,
  deletedHashes?: Set<string>
): LogEntry[] {
  return logs.filter((log) => {
    // Check if service is visible
    if (inactiveNames.has(log.name)) {
      return false
    }

    // Check if deleted
    if (deletedHashes && log.hash && deletedHashes.has(log.hash)) {
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
