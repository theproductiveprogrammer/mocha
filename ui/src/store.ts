/**
 * Mocha Log Viewer - Zustand Stores
 *
 * State management for log viewing, filtering, selection, and file handling.
 * Persisted to localStorage where appropriate.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LogViewerState, StoryState, FileState, ParsedFilter, RecentFile, LogEntry, OpenedFileWithLogs, Story } from './types'

/**
 * Get short service name from log entry.
 * For structured logs, extracts the last part of the logger name.
 * For unstructured logs, returns the filename as-is to indicate parsing failed.
 * Duplicated from LogLine.tsx to avoid circular imports.
 */
function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    let logger = log.parsed.logger
    // Strip [File.java:123] suffix if present
    logger = logger.replace(/\s*\[[^\]]+\.java:\d+\]$/, '')
    const withoutLineNum = logger.split(':')[0]
    const parts = withoutLineNum.split('.')
    return parts[parts.length - 1] || withoutLineNum
  }

  // For unstructured lines, use filename as-is
  // This clearly indicates we couldn't parse the line
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
// useStoryStore - Multi-story management
// ============================================================================

/**
 * Generate a unique ID for stories
 */
function generateStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Store for managing multiple stories (notebooks) of curated log lines.
 *
 * Features:
 * - Multiple named stories
 * - Active story selection
 * - Log management within active story
 * - Drag-to-reorder support
 *
 * All state is persisted to localStorage.
 */
export const useStoryStore = create<StoryState>()(
  persist(
    (set, get) => ({
      // State
      stories: [],
      activeStoryId: null,
      storyPaneHeight: 250,
      storyPaneCollapsed: false,
      storyPaneMaximized: false,

      // Story management

      createStory: (name?: string) => {
        const id = generateStoryId()
        const { stories } = get()
        // Find the next available number by checking existing "Logbook N" names
        const usedNumbers = new Set(
          stories
            .map(s => s.name.match(/^Logbook (\d+)$/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map(m => parseInt(m[1], 10))
        )
        let storyNumber = 1
        while (usedNumbers.has(storyNumber)) {
          storyNumber++
        }
        const newStory: Story = {
          id,
          name: name || `Logbook ${storyNumber}`,
          entries: [],  // Store full log entries
          createdAt: Date.now(),
        }
        set({
          stories: [...stories, newStory],
          activeStoryId: id,
        })
        return id
      },

      deleteStory: (id: string) => {
        const { stories, activeStoryId } = get()
        const newStories = stories.filter(s => s.id !== id)
        set({
          stories: newStories,
          activeStoryId: activeStoryId === id
            ? (newStories[0]?.id || null)
            : activeStoryId,
        })
      },

      renameStory: (id: string, name: string) => {
        const { stories } = get()
        set({
          stories: stories.map(s =>
            s.id === id ? { ...s, name } : s
          ),
        })
      },

      setActiveStory: (id: string | null) => {
        set({ activeStoryId: id })
      },

      // Log management (operates on active story) - stores full LogEntry

      addToStory: (log: LogEntry) => {
        const { stories, activeStoryId, createStory } = get()
        if (!log.hash) return  // Need hash for deduplication

        // Auto-create a story if none exists
        let targetId = activeStoryId
        if (!targetId || !stories.find(s => s.id === targetId)) {
          targetId = createStory()
        }

        // Re-fetch stories after potential create
        const currentStories = get().stories

        set({
          stories: currentStories.map(s => {
            if (s.id !== targetId) return s
            // Check if already in story by hash
            if (s.entries.some(e => e.hash === log.hash)) return s
            return { ...s, entries: [...s.entries, log] }
          }),
        })
      },

      removeFromStory: (hash: string) => {
        const { stories, activeStoryId } = get()
        if (!activeStoryId) return

        set({
          stories: stories.map(s =>
            s.id === activeStoryId
              ? { ...s, entries: s.entries.filter(e => e.hash !== hash) }
              : s
          ),
        })
      },

      toggleStory: (log: LogEntry) => {
        const { stories, activeStoryId, createStory, addToStory, removeFromStory } = get()
        if (!log.hash) return

        // Auto-create a story if none exists
        if (!activeStoryId || !stories.find(s => s.id === activeStoryId)) {
          createStory()
          addToStory(log)
          return
        }

        const activeStory = stories.find(s => s.id === activeStoryId)
        if (!activeStory) return

        if (activeStory.entries.some(e => e.hash === log.hash)) {
          removeFromStory(log.hash)
        } else {
          addToStory(log)
        }
      },

      clearStory: () => {
        const { stories, activeStoryId } = get()
        if (!activeStoryId) return

        set({
          stories: stories.map(s =>
            s.id === activeStoryId
              ? { ...s, entries: [] }
              : s
          ),
        })
      },

      reorderStory: (fromIndex: number, toIndex: number) => {
        const { stories, activeStoryId } = get()
        if (!activeStoryId) return

        set({
          stories: stories.map(s => {
            if (s.id !== activeStoryId) return s
            const newEntries = [...s.entries]
            const [removed] = newEntries.splice(fromIndex, 1)
            newEntries.splice(toIndex, 0, removed)
            return { ...s, entries: newEntries }
          }),
        })
      },

      // UI state

      setStoryPaneHeight: (height: number) => {
        set({ storyPaneHeight: height })
      },

      setStoryPaneCollapsed: (collapsed: boolean) => {
        set({ storyPaneCollapsed: collapsed })
      },

      setStoryPaneMaximized: (maximized: boolean) => {
        set({ storyPaneMaximized: maximized })
      },

      // Helper to get hashes from active story (for highlighting in log viewer)
      getActiveStoryHashes: () => {
        const { stories, activeStoryId } = get()
        const activeStory = stories.find(s => s.id === activeStoryId)
        return activeStory?.entries.map(e => e.hash).filter((h): h is string => !!h) || []
      },
    }),
    {
      name: 'mocha-stories',
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
       * @param newSize - The actual new file size in bytes (for next poll offset)
       */
      appendFileLogs: (path: string, newLogs: LogEntry[], newSize?: number) => {
        const { openedFiles } = get()
        const file = openedFiles.get(path)
        if (!file) return

        const newMap = new Map(openedFiles)
        newMap.set(path, {
          ...file,
          logs: [...file.logs, ...newLogs],
          lastModified: newSize ?? file.lastModified, // Use actual file size for next poll
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
