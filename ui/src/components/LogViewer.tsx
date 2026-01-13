import { useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEntry } from '../types'
import { useLogViewerStore, useSelectionStore, filterLogs } from '../store'
import { LogLine, getServiceName } from './LogLine'

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

  // Check if two logs belong to same group (within 300ms + same service/class)
  // Used for grouping during sort AND for continuation display during render
  const isSameGroup = useCallback((a: LogEntry | null, b: LogEntry): boolean => {
    if (!a) return false
    if (!a.timestamp || !b.timestamp) return false
    const within300ms = Math.abs(a.timestamp - b.timestamp) <= 300
    // Compare by service name (class name) not full logger (which includes line numbers)
    const sameService = getServiceName(a) === getServiceName(b)
    return within300ms && sameService
  }, [])

  // Filter and sort logs by timestamp (newest-first), then group related entries
  const filteredLogs = useMemo(() => {
    const filtered = filterLogs(logs, filters, inactiveNames, deletedHashes)

    // Sort by timestamp descending (newest first)
    const sorted = [...filtered].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

    // Group consecutive logs, keeping chronological order within groups
    const result: LogEntry[] = []
    let currentGroup: LogEntry[] = []

    for (const log of sorted) {
      if (currentGroup.length === 0) {
        currentGroup.push(log)
      } else if (isSameGroup(currentGroup[currentGroup.length - 1], log)) {
        currentGroup.push(log)
      } else {
        // Flush current group (reverse for chronological order within group since sorted is newest-first)
        result.push(...currentGroup.reverse())
        currentGroup = [log]
      }
    }
    // Flush last group
    if (currentGroup.length > 0) {
      result.push(...currentGroup.reverse())
    }

    return result
  }, [logs, filters, inactiveNames, deletedHashes, isSameGroup])

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
            const next = virtualItem.index < filteredLogs.length - 1 ? filteredLogs[virtualItem.index + 1] : null
            const isSelected = log.hash ? selectedHashes.has(log.hash) : false
            const isWrapped = log.hash ? wrappedHashes.has(log.hash) : false

            // Is this line a continuation of the previous? (uses isSameGroup from above)
            const isContinuation = isSameGroup(prev, log)
            // Is the next line a continuation of this one? (determines if we show bottom border)
            const nextIsContinuation = next ? isSameGroup(log, next) : false
            // Show border at bottom of group (when next is NOT a continuation)
            const isLastInGroup = !nextIsContinuation

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
                  isLastInGroup={isLastInGroup}
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
