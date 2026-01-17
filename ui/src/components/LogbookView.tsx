import { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react'
import {
  X,
  Copy,
  Trash2,
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Command,
  Check,
  Minimize2,
} from 'lucide-react'
import { JsonView } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import type { LogEntry, LogToken, Story } from '../types'
import { tokenizeContent } from '../parser'
import { getServiceName } from './LogLine'

// Infrastructure packages to filter out (framework/library code)
const INFRASTRUCTURE_PACKAGES = [
  'java.', 'javax.', 'sun.', 'jdk.', 'com.sun.',
  'org.springframework.', 'io.micronaut.', 'org.hibernate.',
  'org.apache.', 'com.fasterxml.jackson.',
  'org.slf4j.', 'ch.qos.logback.', 'org.apache.log4j.', 'org.apache.logging.',
  'com.google.common.', 'com.google.guava.', 'com.google.inject.',
  'kotlin.', 'kotlinx.', 'scala.',
  'okhttp3.', 'okio.',
  'com.mysql.', 'org.postgresql.', 'com.zaxxer.hikari.', 'org.jooq.',
  'io.quarkus.', 'io.vertx.', 'com.vaadin.', 'io.netty.', 'org.wicket.',
  'org.joda.', 'android.', 'dalvik.', 'androidx.',
  'clojure.', 'reactor.', 'io.reactivex.', 'rx.', 'lombok.',
]

function isInfrastructureFrame(line: string): boolean {
  return INFRASTRUCTURE_PACKAGES.some((pkg) => line.includes(pkg))
}

function isImportantLine(line: string): boolean {
  const trimmed = line.trim()
  if (/^[\w.$]+Exception|^[\w.$]+Error|^Caused by:/.test(trimmed)) return true
  if (/^\.\.\. \d+ (more|common frames)/.test(trimmed)) return true
  if (trimmed.startsWith('at ')) {
    return !isInfrastructureFrame(trimmed)
  }
  return false
}

function extractImportantLines(content: string): {
  firstLine: string
  importantLines: string[]
  hiddenCount: number
  totalLines: number
} {
  const lines = content.split('\n')
  const firstLine = lines[0] || ''
  const restLines = lines.slice(1)

  const importantLines: string[] = []
  let hiddenCount = 0

  for (const line of restLines) {
    if (isImportantLine(line)) {
      importantLines.push(line)
    } else if (line.trim()) {
      hiddenCount++
    }
  }

  return { firstLine, importantLines, hiddenCount, totalLines: lines.length }
}

// Custom JSON viewer styles for logbook aesthetic
const logbookJsonStyles = {
  container: 'jv-logbook-container',
  basicChildStyle: 'jv-logbook-child',
  label: 'jv-logbook-label',
  nullValue: 'jv-logbook-null',
  undefinedValue: 'jv-logbook-null',
  stringValue: 'jv-logbook-string',
  booleanValue: 'jv-logbook-boolean',
  numberValue: 'jv-logbook-number',
  otherValue: 'jv-logbook-other',
  punctuation: 'jv-logbook-punctuation',
  collapseIcon: 'jv-logbook-collapse-icon',
  expandIcon: 'jv-logbook-expand-icon',
  collapsedContent: 'jv-logbook-collapsed',
}

interface LogbookViewProps {
  story: Story | null
  onClose: () => void
  onMinimizeToPanel: () => void
  onRemoveFromStory: (hash: string) => void
  onClearStory: () => void
  onRenameStory: (id: string, name: string) => void
  onJumpToSource?: (log: LogEntry) => void
  scrollToHash?: string | null  // Hash of entry to scroll to on mount
  initialRawHash?: string | null  // Hash of entry to show in raw mode initially
  onScrollComplete?: () => void  // Called after scrolling is complete
}

/**
 * Render a single token with appropriate styling
 */
function TokenSpan({ token }: { token: LogToken }) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
      case 'marker.error':
        return { color: 'var(--mocha-error)', fontWeight: 600 }
      case 'marker.warn':
        return { color: 'var(--mocha-warning)', fontWeight: 600 }
      case 'marker.info':
        return { color: 'var(--mocha-text-muted)' }
      case 'url':
        return { color: 'var(--mocha-info)' }
      case 'data':
        return { color: 'var(--mocha-accent)', fontWeight: 500 }
      case 'json':
        return { color: 'var(--mocha-text-muted)' }
      case 'symbol':
        return { color: 'var(--mocha-text-muted)' }
      case 'message':
      default:
        return {}
    }
  }

  return <span style={getTokenStyle()}>{token.text}</span>
}

/**
 * Smart content display with important line extraction
 */
function SmartContent({
  content,
  tokens,
  onShowRaw,
}: {
  content: string
  tokens: LogToken[]
  onShowRaw: () => void
}) {
  const { firstLine, importantLines, hiddenCount, totalLines } = useMemo(
    () => extractImportantLines(content),
    [content]
  )

  const isMultiLine = totalLines > 1
  const hasImportantLines = importantLines.length > 0

  if (!isMultiLine) {
    return (
      <div
        className="text-[13px] leading-relaxed font-mono"
        style={{ color: 'var(--mocha-text)', wordBreak: 'break-word' }}
      >
        {tokens.map((token, i) => {
          if (token.type === 'json') {
            try {
              const parsed = JSON.parse(token.text)
              return (
                <div
                  key={i}
                  className="my-2 p-2.5 rounded-lg text-[11px]"
                  style={{
                    background: 'var(--mocha-surface-hover)',
                    border: '1px solid var(--mocha-border)',
                  }}
                >
                  <JsonView
                    data={parsed}
                    shouldExpandNode={(level) => level < 2}
                    style={logbookJsonStyles}
                  />
                </div>
              )
            } catch {
              // Parse failed
            }
          }
          return <TokenSpan key={i} token={token} />
        })}
      </div>
    )
  }

  const firstLineTokens = tokenizeContent(firstLine).tokens

  return (
    <div className="font-mono" style={{ color: 'var(--mocha-text)' }}>
      <div
        className="text-[13px] leading-relaxed"
        style={{ wordBreak: 'break-word' }}
      >
        {firstLineTokens.map((token, i) => {
          if (token.type === 'json') {
            try {
              const parsed = JSON.parse(token.text)
              return (
                <div
                  key={i}
                  className="my-2 p-2.5 rounded-lg text-[11px]"
                  style={{
                    background: 'var(--mocha-surface-hover)',
                    border: '1px solid var(--mocha-border)',
                  }}
                >
                  <JsonView
                    data={parsed}
                    shouldExpandNode={(level) => level < 2}
                    style={logbookJsonStyles}
                  />
                </div>
              )
            } catch {
              // Parse failed
            }
          }
          return <TokenSpan key={i} token={token} />
        })}
      </div>

      {hasImportantLines && (
        <div
          className="mt-2 pl-3 text-[11px] leading-relaxed space-y-0.5"
          style={{
            borderLeft: '2px solid var(--mocha-border-strong)',
            color: 'var(--mocha-text-secondary)',
          }}
        >
          {importantLines.map((line, i) => {
            const trimmed = line.trim()
            const isException = /^[\w.$]+Exception|^[\w.$]+Error|^Caused by:/.test(trimmed)
            const isMoreLine = /^\.\.\. \d+ (more|common frames)/.test(trimmed)

            return (
              <div
                key={i}
                className="truncate"
                style={{
                  color: isException ? 'var(--mocha-error)' : isMoreLine ? 'var(--mocha-text-muted)' : 'var(--mocha-text-secondary)',
                  fontWeight: isException ? 600 : 400,
                  fontStyle: isMoreLine ? 'italic' : 'normal',
                }}
                title={line}
              >
                {trimmed}
              </div>
            )
          })}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          onClick={onShowRaw}
          className="mt-2 text-[10px] px-2 py-1 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
          style={{
            color: 'var(--mocha-text-muted)',
            background: 'var(--mocha-surface-hover)',
          }}
        >
          ({hiddenCount} hidden)
        </button>
      )}
    </div>
  )
}

/**
 * Evidence card for LogbookView - slightly larger for full-page viewing
 */
const LogbookEvidenceCard = memo(function LogbookEvidenceCard({
  log,
  index,
  onRemove,
  onJumpToSource,
  searchQuery,
  isRegex,
  isCurrentMatch,
  isRemoving,
  cardRef,
  initialShowRaw,
}: {
  log: LogEntry
  index: number
  onRemove: () => void
  onJumpToSource?: () => void
  searchQuery?: string
  isRegex?: boolean
  isCurrentMatch?: boolean
  isRemoving?: boolean
  cardRef?: (el: HTMLDivElement | null) => void
  initialShowRaw?: boolean
}) {
  const [showRaw, setShowRaw] = useState(initialShowRaw ?? false)
  const [copied, setCopied] = useState(false)
  const serviceName = getServiceName(log)
  const content = log.parsed?.content || log.data
  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null
  const level = log.parsed?.level?.toUpperCase()

  const getLevelIndicator = () => {
    if (level === 'ERROR') return { color: 'var(--mocha-error)', label: 'ERR' }
    if (level === 'WARN' || level === 'WARNING') return { color: 'var(--mocha-warning)', label: 'WARN' }
    return null
  }
  const levelIndicator = getLevelIndicator()

  const { tokens } = tokenizeContent(content)
  const rawLog = log.data

  const highlightMatches = (text: string) => {
    if (!searchQuery?.trim()) return text

    try {
      const regex = isRegex
        ? new RegExp(`(${searchQuery})`, 'gi')
        : new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')

      const parts = text.split(regex)
      return parts.map((part, i) => {
        if (regex.test(part)) {
          regex.lastIndex = 0
          return (
            <mark
              key={i}
              style={{
                background: isCurrentMatch ? 'var(--mocha-accent)' : 'var(--mocha-accent-muted)',
                color: isCurrentMatch ? 'var(--mocha-bg)' : 'var(--mocha-accent)',
                padding: '0 2px',
                borderRadius: '2px',
              }}
            >
              {part}
            </mark>
          )
        }
        regex.lastIndex = 0
        return part
      })
    } catch {
      return text
    }
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(log.data)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-300 ${isCurrentMatch ? 'ring-2 ring-[var(--mocha-accent)] ring-offset-2 ring-offset-[var(--mocha-surface)]' : ''} ${isRemoving ? 'opacity-50 scale-95' : ''}`}
      data-story-hash={log.hash}
    >
      <div className={`relative mx-auto max-w-4xl mb-3 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg logbook-card ${isRemoving ? 'ring-2 ring-[var(--mocha-error)] ring-opacity-50' : ''}`}>
        {/* Evidence number strip */}
        <div
          className="absolute -left-0 top-0 bottom-0 w-12 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--mocha-surface-active) 0%, var(--mocha-surface-hover) 100%)',
            borderRight: '1px solid var(--mocha-border)',
            borderLeft: levelIndicator ? `3px solid ${levelIndicator.color}` : undefined,
          }}
        >
          <span
            className="text-xs font-bold tabular-nums font-mono"
            style={{ color: 'var(--mocha-accent)' }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {/* Content area */}
        <div
          className="pl-14 pr-12 py-4"
          style={{
            background: showRaw
              ? 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)'
              : 'transparent',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            {timestamp && (
              <span
                className="text-[10px] tracking-wide tabular-nums font-mono"
                style={{ color: 'var(--mocha-text-muted)' }}
              >
                {timestamp}
              </span>
            )}
            {levelIndicator && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                style={{
                  background: `color-mix(in srgb, ${levelIndicator.color} 15%, transparent)`,
                  color: levelIndicator.color,
                }}
              >
                {levelIndicator.label}
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider font-mono"
              style={{
                background: 'var(--mocha-surface-hover)',
                color: 'var(--mocha-text-secondary)',
              }}
            >
              {serviceName}
            </span>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[9px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
              style={{
                background: showRaw ? 'var(--mocha-info-muted)' : 'var(--mocha-surface-active)',
                color: showRaw ? 'var(--mocha-info)' : 'var(--mocha-text-muted)',
              }}
            >
              {showRaw ? 'RAW' : 'RAW'}
            </button>
          </div>

          {/* Log content */}
          {showRaw ? (
            <div
              className="text-[11px] leading-relaxed whitespace-pre-wrap break-all select-text font-mono"
              style={{ color: 'var(--mocha-text)' }}
            >
              {highlightMatches(rawLog)}
            </div>
          ) : (
            <SmartContent content={content} tokens={tokens} onShowRaw={() => setShowRaw(true)} />
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute right-4 top-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg transition-all hover:scale-110"
            style={{
              background: 'var(--mocha-surface-hover)',
              color: copied ? 'var(--mocha-success)' : 'var(--mocha-text-secondary)',
            }}
            title="Copy log line"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          {onJumpToSource && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onJumpToSource()
              }}
              className="p-2 rounded-lg transition-all hover:scale-110"
              style={{
                background: 'var(--mocha-surface-hover)',
                color: 'var(--mocha-text-secondary)',
              }}
              title="Jump to source in log viewer"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-2 rounded-lg transition-all hover:scale-110"
            style={{
              background: 'var(--mocha-surface-hover)',
              color: 'var(--mocha-text-secondary)',
            }}
            title="Remove from logbook"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
})

/**
 * LogbookView - Full-page logbook reading experience
 */
export function LogbookView({
  story,
  onClose,
  onMinimizeToPanel,
  onRemoveFromStory,
  onClearStory,
  onRenameStory,
  onJumpToSource,
  scrollToHash,
  initialRawHash,
  onScrollComplete,
}: LogbookViewProps) {
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(story?.name || '')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrolledToInitialHash = useRef(false)

  // Sort logs by timestamp ascending (chronological order, oldest first), then by sortIndex for stable ordering
  const storyLogs = useMemo(() => {
    const entries = story?.entries || []
    return [...entries].sort((a, b) => {
      const timestampDiff = (a.timestamp ?? 0) - (b.timestamp ?? 0)
      if (timestampDiff !== 0) return timestampDiff
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    })
  }, [story?.entries])

  // Removing animation state
  const [removingHash, setRemovingHash] = useState<string | null>(null)

  // Handle remove with scroll-then-remove animation
  const handleRemove = useCallback((hash: string) => {
    // First scroll to the card
    const card = cardRefs.current.get(hash)
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    // Set removing state for visual feedback
    setRemovingHash(hash)

    // After delay, actually remove
    setTimeout(() => {
      onRemoveFromStory(hash)
      setRemovingHash(null)
    }, 500)
  }, [onRemoveFromStory])

  // Update edit name when story changes
  useEffect(() => {
    setEditName(story?.name || '')
  }, [story?.name])

  // Keyboard shortcut: Cmd/Ctrl+G to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Escape to close
      if (e.key === 'Escape' && !searchFocused && !isEditing) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchFocused, isEditing, onClose])

  // Scroll to initial entry on mount
  useEffect(() => {
    if (scrollToHash && !scrolledToInitialHash.current) {
      // Wait for cards to render
      setTimeout(() => {
        const card = cardRefs.current.get(scrollToHash)
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
          scrolledToInitialHash.current = true
          onScrollComplete?.()
        }
      }, 100)
    }
  }, [scrollToHash, onScrollComplete])

  // Find matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []

    const matches: { logHash: string; logIndex: number }[] = []

    try {
      const regex = isRegex
        ? new RegExp(searchQuery, 'gi')
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

      storyLogs.forEach((log, index) => {
        if (log.hash && regex.test(log.data)) {
          matches.push({ logHash: log.hash, logIndex: index })
        }
        regex.lastIndex = 0
      })
    } catch {
      // Invalid regex
    }

    return matches
  }, [searchQuery, isRegex, storyLogs])

  const currentMatchHash = searchMatches[currentMatchIndex]?.logHash || null

  // Scroll to match
  useEffect(() => {
    if (currentMatchHash) {
      const card = cardRefs.current.get(currentMatchHash)
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [currentMatchHash, currentMatchIndex])

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length)
    }
  }, [searchMatches.length])

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length)
    }
  }, [searchMatches.length])

  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [searchQuery, isRegex])

  const handleCopy = useCallback(() => {
    const lines: string[] = []
    let currentFile: string | null = null

    for (const log of storyLogs) {
      const filePath = log.name
      if (filePath !== currentFile) {
        const headerBase = `LOGFILE: ${filePath} `
        const padding = '='.repeat(Math.max(0, 72 - headerBase.length))
        lines.push(`${headerBase}${padding}|`)
        currentFile = filePath
      }
      lines.push(log.data)
    }

    const text = lines.join('\n')
    navigator.clipboard.writeText(text)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [storyLogs])

  const handleRename = useCallback(() => {
    if (story && editName.trim() && editName !== story.name) {
      onRenameStory(story.id, editName.trim())
    }
    setIsEditing(false)
  }, [story, editName, onRenameStory])

  const isEmpty = storyLogs.length === 0

  if (!story) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--mocha-surface)' }}
      >
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--mocha-text-muted)' }} />
          <p className="text-lg font-medium" style={{ color: 'var(--mocha-text)' }}>
            No logbook selected
          </p>
          <button
            onClick={onClose}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg mx-auto transition-colors"
            style={{
              background: 'var(--mocha-surface-hover)',
              color: 'var(--mocha-text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full" style={{ background: 'var(--mocha-surface)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3 flex items-center justify-between"
        style={{
          background: 'var(--mocha-surface)',
          borderBottom: '1px solid var(--mocha-border)',
        }}
      >
        {/* Left side - title */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--mocha-accent) 0%, #c4854a 100%)',
              boxShadow: '0 2px 8px var(--mocha-accent-glow)',
            }}
          >
            <BookOpen className="w-4 h-4" style={{ color: 'var(--mocha-bg)' }} />
          </div>

          <div>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') {
                    setEditName(story.name)
                    setIsEditing(false)
                  }
                }}
                className="text-sm font-semibold font-display px-2 py-1 rounded-lg border outline-none"
                style={{
                  background: 'var(--mocha-surface-raised)',
                  color: 'var(--mocha-text)',
                  borderColor: 'var(--mocha-accent)',
                }}
                autoFocus
              />
            ) : (
              <h1
                className="text-sm font-semibold font-display cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'var(--mocha-text)' }}
                onClick={() => setIsEditing(true)}
                title="Click to rename"
              >
                {story.name}
              </h1>
            )}
            <p className="text-[10px]" style={{ color: 'var(--mocha-text-muted)' }}>
              {storyLogs.length} {storyLogs.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>

        {/* Center - Search */}
        <div className="flex items-center gap-2">
          <div
            className="relative flex items-center transition-all duration-300"
            style={{
              width: searchFocused || searchQuery ? '280px' : '200px',
            }}
          >
            <Search
              className="absolute left-3 w-4 h-4 pointer-events-none transition-colors duration-200"
              style={{
                color: searchFocused ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.shiftKey ? goToPrevMatch() : goToNextMatch()
                }
                if (e.key === 'Escape') {
                  setSearchQuery('')
                  searchInputRef.current?.blur()
                }
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search logbook..."
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl font-mono"
              style={{
                background: searchFocused ? 'var(--mocha-surface-raised)' : 'var(--mocha-surface-hover)',
                border: `1px solid ${searchFocused ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
                color: 'var(--mocha-text)',
                boxShadow: searchFocused ? '0 0 0 3px var(--mocha-accent-muted), 0 4px 16px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              title="Search logbook (⌘G). Enter for next, Shift+Enter for previous"
            />

            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-md transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{ color: 'var(--mocha-text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              !searchFocused && (
                <div
                  className="absolute right-3 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: 'var(--mocha-surface-active)',
                    color: 'var(--mocha-text-muted)',
                  }}
                >
                  <Command className="w-2.5 h-2.5" />
                  <span>G</span>
                </div>
              )
            )}
          </div>

          {/* Regex toggle */}
          <button
            onClick={() => setIsRegex(!isRegex)}
            className="px-3 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all duration-200"
            style={{
              background: isRegex
                ? 'linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)'
                : 'var(--mocha-surface-hover)',
              border: `1px solid ${isRegex ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
              color: isRegex ? 'var(--mocha-bg)' : 'var(--mocha-text-muted)',
              boxShadow: isRegex ? '0 2px 12px var(--mocha-accent-glow)' : 'none',
            }}
            title="Toggle regex search"
          >
            .*
          </button>

          {/* Match navigation */}
          {searchQuery && (
            <div
              className="flex items-center gap-1 animate-scale-in"
              style={{
                background: 'var(--mocha-surface-raised)',
                border: '1px solid var(--mocha-border)',
                borderRadius: '12px',
                padding: '4px',
              }}
            >
              <button
                onClick={goToPrevMatch}
                className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{
                  color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)',
                }}
                title="Previous match (Shift+Enter)"
                disabled={searchMatches.length === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span
                className="text-xs tabular-nums min-w-[3.5rem] text-center font-mono font-medium px-1"
                style={{
                  color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-error)',
                }}
              >
                {searchMatches.length > 0
                  ? `${currentMatchIndex + 1}/${searchMatches.length}`
                  : '0/0'}
              </span>

              <button
                onClick={goToNextMatch}
                className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{
                  color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)',
                }}
                title="Next match (Enter)"
                disabled={searchMatches.length === 0}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right side - actions */}
        <div className="flex items-center gap-1">
          {!isEmpty && (
            <>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'var(--mocha-surface-hover)',
                  color: 'var(--mocha-text-secondary)',
                }}
                title="Copy all entries"
              >
                {copyFeedback ? (
                  <Check className="w-4 h-4" style={{ color: 'var(--mocha-success)' }} />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClearStory}
                className="p-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'var(--mocha-surface-hover)',
                  color: 'var(--mocha-text-secondary)',
                }}
                title="Clear all entries"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--mocha-border)' }} />
          <button
            onClick={onMinimizeToPanel}
            className="p-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              background: 'var(--mocha-surface-hover)',
              color: 'var(--mocha-text-secondary)',
            }}
            title="Minimize to panel"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              background: 'var(--mocha-surface-hover)',
              color: 'var(--mocha-text-secondary)',
            }}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-8 px-6 logbook-glass">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div
              className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--mocha-surface-raised)',
                border: '1px solid var(--mocha-border)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}
            >
              <BookOpen className="w-12 h-12" style={{ color: 'var(--mocha-text-muted)' }} />
            </div>
            <p className="text-xl font-semibold mb-2 font-display" style={{ color: 'var(--mocha-text)' }}>
              Empty Logbook
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--mocha-text-muted)' }}>
              Click on log lines in the log viewer to add entries
            </p>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
              style={{
                background: 'var(--mocha-surface-raised)',
                color: 'var(--mocha-text)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                border: '1px solid var(--mocha-border)',
              }}
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {storyLogs.map((log, index) => (
              <LogbookEvidenceCard
                key={log.hash}
                log={log}
                index={index}
                onRemove={() => log.hash && handleRemove(log.hash)}
                onJumpToSource={
                  onJumpToSource && log.hash
                    ? () => onJumpToSource(log)
                    : undefined
                }
                searchQuery={searchQuery}
                isRegex={isRegex}
                isCurrentMatch={log.hash === currentMatchHash}
                isRemoving={log.hash === removingHash}
                cardRef={(el) => {
                  if (el && log.hash) {
                    cardRefs.current.set(log.hash, el)
                  }
                }}
                initialShowRaw={log.hash === initialRawHash}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
