import { useCallback, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, FilterX } from 'lucide-react'
import type { LogEntry } from '../types'
import { useLogViewerStore, useStoryStore, filterLogs } from '../store'
import { LogLine, getServiceName } from './LogLine'

export interface LogViewerProps {
  logs: LogEntry[]
}

/**
 * Extract thread/source identifier from log line for grouping
 */
function getThreadId(log: LogEntry): string | null {
  // Try to extract [thread-id] pattern
  const match = log.data.match(/\[([^\]]+)\]/)
  return match?.[1] || null
}

/**
 * LogViewer component - Virtualized log display with filtering and story integration.
 */
export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Log viewer store (filters and service visibility)
  const { inactiveNames, filters } = useLogViewerStore()

  // Story store
  const { storyHashes, toggleStory } = useStoryStore()

  // Convert to Set for fast lookup
  const storyHashSet = useMemo(() => new Set(storyHashes), [storyHashes])

  // Check if two logs belong to same group (within 300ms + same service + same thread)
  const isSameGroup = useCallback((a: LogEntry | null, b: LogEntry): boolean => {
    if (!a) return false
    if (!a.timestamp || !b.timestamp) return false

    const within300ms = Math.abs(a.timestamp - b.timestamp) <= 300
    const sameService = getServiceName(a) === getServiceName(b)

    // Also check thread/source if available
    const aThread = getThreadId(a)
    const bThread = getThreadId(b)
    const sameThread = !aThread || !bThread || aThread === bThread

    return within300ms && sameService && sameThread
  }, [])

  // Filter and sort logs by timestamp (newest-first), then group related entries
  const filteredLogs = useMemo(() => {
    const filtered = filterLogs(logs, filters, inactiveNames)

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
        // Flush current group (reverse for chronological order within group)
        result.push(...currentGroup.reverse())
        currentGroup = [log]
      }
    }
    // Flush last group
    if (currentGroup.length > 0) {
      result.push(...currentGroup.reverse())
    }

    return result
  }, [logs, filters, inactiveNames, isSameGroup])

  // Virtualizer with dynamic measurement
  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 44,
    overscan: 10,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  // Handle story toggle
  const handleToggleStory = useCallback(
    (hash: string) => {
      toggleStory(hash)
    },
    [toggleStory]
  )

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      style={{ background: 'var(--mocha-bg)' }}
      tabIndex={0}
      data-testid="log-viewer"
    >
      {filteredLogs.length === 0 ? (
        <div
          className="flex items-center justify-center h-full animate-fade-in"
          style={{ color: 'var(--mocha-text-secondary)' }}
        >
          {logs.length === 0 ? (
            <div className="text-center">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--mocha-surface)',
                  border: '1px solid var(--mocha-border-subtle)',
                }}
              >
                <Search className="w-7 h-7" style={{ color: 'var(--mocha-text-muted)' }} />
              </div>
              <p
                className="text-lg font-medium mb-1"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: 'var(--mocha-text)',
                }}
              >
                No logs loaded
              </p>
              <p className="text-sm" style={{ color: 'var(--mocha-text-muted)' }}>
                Upload a log file to get started
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--mocha-surface)',
                  border: '1px solid var(--mocha-border-subtle)',
                }}
              >
                <FilterX className="w-7 h-7" style={{ color: 'var(--mocha-text-muted)' }} />
              </div>
              <p
                className="text-lg font-medium mb-1"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: 'var(--mocha-text)',
                }}
              >
                No logs match filters
              </p>
              <p className="text-sm" style={{ color: 'var(--mocha-text-muted)' }}>
                Try adjusting your filters
              </p>
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
            const isInStory = log.hash ? storyHashSet.has(log.hash) : false

            // Is this line a continuation of the previous?
            const isContinuation = isSameGroup(prev, log)
            // Is the next line a continuation of this one?
            const nextIsContinuation = next ? isSameGroup(log, next) : false
            // Show border at bottom of group
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
                  isInStory={isInStory}
                  isContinuation={isContinuation}
                  isLastInGroup={isLastInGroup}
                  onToggleStory={handleToggleStory}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
