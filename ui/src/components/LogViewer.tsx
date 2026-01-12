import { useEffect, useCallback, useMemo, useRef } from 'react'
import type { LogEntry } from '../types'
import { useLogViewerStore, useSelectionStore, filterLogs } from '../store'
import { LogLine } from './LogLine'

export interface LogViewerProps {
  logs: LogEntry[]
}

/**
 * LogViewer component - Main log display with filtering, selection, and keyboard shortcuts.
 *
 * Features:
 * - Applies service filter (inactiveNames) from store
 * - Applies text/regex filters from store
 * - Excludes deleted hashes
 * - Reverses logs for newest-first display
 * - Renders LogLine for each visible log
 * - Keyboard shortcuts: Ctrl+A (select all), Ctrl+C (copy), Delete (hide), Escape (clear)
 * - Clipboard copy of selected lines
 */
export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Log viewer store (filters and service visibility)
  const { inactiveNames, filters } = useLogViewerStore()

  // Selection store
  const {
    selectedHashes: rawSelectedHashes,
    deletedHashes: rawDeletedHashes,
    wrappedHashes: rawWrappedHashes,
    lastSelectedHash,
    toggleSelection,
    selectRange,
    selectAll,
    deleteSelected,
    clearSelection,
    toggleWrap,
  } = useSelectionStore()

  // Ensure hashes are Sets (handles hydration race condition)
  const selectedHashes = useMemo(
    () => (rawSelectedHashes instanceof Set ? rawSelectedHashes : new Set(Array.isArray(rawSelectedHashes) ? rawSelectedHashes : [])),
    [rawSelectedHashes]
  )
  const deletedHashes = useMemo(
    () => (rawDeletedHashes instanceof Set ? rawDeletedHashes : new Set(Array.isArray(rawDeletedHashes) ? rawDeletedHashes : [])),
    [rawDeletedHashes]
  )
  const wrappedHashes = useMemo(
    () => (rawWrappedHashes instanceof Set ? rawWrappedHashes : new Set(Array.isArray(rawWrappedHashes) ? rawWrappedHashes : [])),
    [rawWrappedHashes]
  )

  // Filter and reverse logs (newest-first)
  const filteredLogs = useMemo(() => {
    const filtered = filterLogs(logs, filters, inactiveNames, deletedHashes)
    // Reverse for newest-first display
    return [...filtered].reverse()
  }, [logs, filters, inactiveNames, deletedHashes])

  // Get all hashes for selection operations
  const allHashes = useMemo(() => {
    return filteredLogs.map((log) => log.hash).filter((h): h is string => !!h)
  }, [filteredLogs])

  // Handle log entry click for selection
  const handleLogClick = useCallback(
    (hash: string, event: React.MouseEvent) => {
      if (event.shiftKey && lastSelectedHash) {
        // Shift+Click: range selection
        selectRange(lastSelectedHash, hash, allHashes)
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd+Click: add to selection
        toggleSelection(hash)
      } else {
        // Regular click: toggle single selection
        toggleSelection(hash)
      }
    },
    [lastSelectedHash, allHashes, selectRange, toggleSelection]
  )

  // Copy selected logs to clipboard
  const copySelectedToClipboard = useCallback(async () => {
    if (selectedHashes.size === 0) return

    // Get selected logs in display order
    const selectedLogs = filteredLogs
      .filter((log) => log.hash && selectedHashes.has(log.hash))
      .map((log) => log.data)
      .join('\n')

    try {
      await navigator.clipboard.writeText(selectedLogs)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }, [filteredLogs, selectedHashes])

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if focus is on this container or body (not in input fields)
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return
      }

      // Ctrl+A: Select all visible logs
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll(allHashes)
        return
      }

      // Ctrl+C: Copy selected logs to clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          copySelectedToClipboard()
        }
        return
      }

      // Delete or Backspace: Hide selected logs
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allHashes, selectedHashes, selectAll, deleteSelected, clearSelection, copySelectedToClipboard])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-white"
      tabIndex={0}
      data-testid="log-viewer"
    >
      {filteredLogs.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          {logs.length === 0 ? (
            <div className="text-center">
              <p className="text-lg font-medium">No logs loaded</p>
              <p className="text-sm">Upload a log file to get started</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-lg font-medium">No logs match filters</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filteredLogs.map((log) => {
            const isSelected = log.hash ? selectedHashes.has(log.hash) : false
            const isWrapped = log.hash ? wrappedHashes.has(log.hash) : false

            return (
              <LogLine
                key={log.hash || log.data}
                log={log}
                isSelected={isSelected}
                isWrapped={isWrapped}
                onSelect={handleLogClick}
                onToggleWrap={toggleWrap}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
