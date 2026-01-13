import { useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEntry } from '../types'
import { useLogViewerStore, useSelectionStore, filterLogs } from '../store'
import { LogLine } from './LogLine'

export interface LogViewerProps {
  logs: LogEntry[]
}

/**
 * LogViewer component - Virtualized log display with filtering, selection, and keyboard shortcuts.
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
    return [...filtered].reverse()
  }, [logs, filters, inactiveNames, deletedHashes])

  // Get all hashes for selection operations
  const allHashes = useMemo(() => {
    return filteredLogs.map((log) => log.hash).filter((h): h is string => !!h)
  }, [filteredLogs])

  // Use ref for allHashes to keep callback stable
  const allHashesRef = useRef(allHashes)
  useLayoutEffect(() => {
    allHashesRef.current = allHashes
  }, [allHashes])

  // Virtualizer with dynamic measurement (needed for expanded rows)
  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 44, // Default collapsed row height
    overscan: 10,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  // Handle log entry click for selection
  const handleLogClick = useCallback(
    (hash: string, event: React.MouseEvent) => {
      if (event.shiftKey && lastSelectedHash) {
        selectRange(lastSelectedHash, hash, allHashesRef.current)
      } else if (event.ctrlKey || event.metaKey) {
        toggleSelection(hash)
      } else {
        toggleSelection(hash)
      }
    },
    [lastSelectedHash, selectRange, toggleSelection]
  )

  // Copy selected logs to clipboard
  const copySelectedToClipboard = useCallback(async () => {
    if (selectedHashes.size === 0) return

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
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll(allHashes)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          copySelectedToClipboard()
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allHashes, selectedHashes, selectAll, deleteSelected, clearSelection, copySelectedToClipboard])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-[#FAFAFA] font-['Fira_Code',monospace]"
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
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const log = filteredLogs[virtualItem.index]
            const prev = virtualItem.index > 0 ? filteredLogs[virtualItem.index - 1] : null
            const isSelected = log.hash ? selectedHashes.has(log.hash) : false
            const isWrapped = log.hash ? wrappedHashes.has(log.hash) : false

            // Determine if this is a continuation of the previous line
            const content = log.parsed?.content || log.data
            const isStackTraceLine = /^\s*at\s/.test(content) || /Exception|Error:/.test(content)
            const hasNoLogger = !log.parsed?.logger
            const prevHasLogger = !!prev?.parsed?.logger

            // Check if timestamps are within 100ms
            const timestampWithin100ms = prev?.timestamp && log.timestamp &&
              Math.abs(prev.timestamp - log.timestamp) <= 100

            // Same logger check (both must have logger and be the same)
            const sameLogger = log.parsed?.logger && prev?.parsed?.logger &&
              log.parsed.logger === prev.parsed.logger

            // A line is a continuation if:
            // 1. It's a stack trace line (starts with "at " or contains Exception)
            // 2. Within 100ms AND same logger (grouped log output)
            // 3. Line with no logger following a line with logger
            // 4. Both lines have no logger (likely related plain lines)
            const isContinuation = !!(prev && (
              // Stack trace lines are always continuations
              isStackTraceLine ||
              // Within 100ms + same logger = grouped output
              (timestampWithin100ms && sameLogger) ||
              // Line with no logger following a line with logger
              (hasNoLogger && prevHasLogger) ||
              // Both have no logger (likely related plain lines)
              (hasNoLogger && !prev.parsed?.logger)
            ))

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <LogLine
                  log={log}
                  isSelected={isSelected}
                  isWrapped={isWrapped}
                  isContinuation={isContinuation}
                  onSelect={handleLogClick}
                  onToggleWrap={toggleWrap}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
