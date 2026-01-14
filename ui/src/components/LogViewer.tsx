import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, FilterX, ChevronUp } from 'lucide-react'
import type { LogEntry } from '../types'
import { useLogViewerStore, useStoryStore, filterLogs } from '../store'
import { LogLine, getServiceName } from './LogLine'

export interface LogViewerProps {
  logs: LogEntry[]
  onToggleStory?: (log: LogEntry) => void
  // Search props
  searchQuery?: string
  searchIsRegex?: boolean
  searchCurrentMatchHash?: string | null  // Hash of the current match log
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
export function LogViewer({
  logs,
  onToggleStory,
  searchQuery,
  searchIsRegex,
  searchCurrentMatchHash,
}: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Buffer new logs when user is scrolled down
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>([])
  const [newLogsCount, setNewLogsCount] = useState(0)
  const isScrolledRef = useRef(false)

  // Log viewer store (filters and service visibility)
  const { inactiveNames, filters } = useLogViewerStore()

  // Story store
  const { stories, activeStoryId, toggleStory } = useStoryStore()

  // Get active story hashes and convert to Set for fast lookup
  const storyHashSet = useMemo(() => {
    const activeStory = stories.find(s => s.id === activeStoryId)
    const hashes = activeStory?.entries.map(e => e.hash).filter((h): h is string => !!h) || []
    return new Set(hashes)
  }, [stories, activeStoryId])

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

  // Virtualizer with dynamic measurement - uses displayedLogs (not filteredLogs)
  const virtualizer = useVirtualizer({
    count: displayedLogs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 44,
    overscan: 10,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  // Track if user is scrolled away from top
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      isScrolledRef.current = container.scrollTop > 100

      // If scrolled to top, show any buffered logs
      if (container.scrollTop < 50 && newLogsCount > 0) {
        setDisplayedLogs(filteredLogs)
        setNewLogsCount(0)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [filteredLogs, newLogsCount])

  // Handle log updates - buffer if scrolled, show immediately if at top
  useEffect(() => {
    if (!isScrolledRef.current || displayedLogs.length === 0) {
      // At top or first load - show all logs
      setDisplayedLogs(filteredLogs)
      setNewLogsCount(0)
    } else {
      // Scrolled down - calculate how many new logs
      const newCount = filteredLogs.length - displayedLogs.length
      if (newCount > 0) {
        setNewLogsCount(prev => prev + newCount)
      }
    }
  }, [filteredLogs])

  // Show buffered logs when clicking the indicator
  const showNewLogs = useCallback(() => {
    setDisplayedLogs(filteredLogs)
    setNewLogsCount(0)
    // Scroll to top
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [filteredLogs])

  // Handle story toggle - use prop if provided, otherwise use store
  const handleToggleStory = useCallback(
    (log: LogEntry) => {
      if (onToggleStory) {
        onToggleStory(log)
      } else {
        toggleStory(log)
      }
    },
    [onToggleStory, toggleStory]
  )

  // Scroll to current search match when it changes
  useEffect(() => {
    if (!searchCurrentMatchHash) return

    // Find the index of the matching log in displayedLogs
    const matchIndex = displayedLogs.findIndex(log => log.hash === searchCurrentMatchHash)
    if (matchIndex !== -1) {
      virtualizer.scrollToIndex(matchIndex, { align: 'center', behavior: 'smooth' })
    }
  }, [searchCurrentMatchHash, displayedLogs, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative"
      style={{ background: 'var(--mocha-bg)' }}
      tabIndex={0}
      data-testid="log-viewer"
    >
      {/* New logs indicator */}
      {newLogsCount > 0 && (
        <button
          onClick={showNewLogs}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium shadow-lg transition-all hover:scale-105"
          style={{
            background: 'var(--mocha-accent)',
            color: 'var(--mocha-bg)',
          }}
        >
          <ChevronUp className="w-4 h-4" />
          {newLogsCount} new log{newLogsCount > 1 ? 's' : ''}
        </button>
      )}

      {displayedLogs.length === 0 ? (
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
            const log = displayedLogs[virtualItem.index]
            const prev = virtualItem.index > 0 ? displayedLogs[virtualItem.index - 1] : null
            const next = virtualItem.index < displayedLogs.length - 1 ? displayedLogs[virtualItem.index + 1] : null
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
                  searchQuery={searchQuery}
                  searchIsRegex={searchIsRegex}
                  isCurrentMatch={log.hash === searchCurrentMatchHash}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
