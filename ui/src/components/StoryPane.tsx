import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { X, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import type { LogEntry, LogToken } from '../types'
import { tokenizeContent } from '../parser'
import { getServiceName } from './LogLine'

interface StoryPaneProps {
  storyLogs: LogEntry[]
  height: number
  collapsed: boolean
  onRemoveFromStory: (hash: string) => void
  onClearStory: () => void
  onHeightChange: (height: number) => void
  onToggleCollapsed: () => void
}

/**
 * Render a single token with appropriate styling
 */
function TokenSpan({ token }: { token: LogToken }) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
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
 * Check if content looks like JSON
 */
function isJsonContent(content: string): boolean {
  const trimmed = content.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

/**
 * Check if content looks like a stack trace
 */
function isStackTrace(content: string): boolean {
  return /^\s*at\s+/.test(content) ||
         /Exception|Error/.test(content) && content.includes('\n')
}

/**
 * Format JSON for display
 */
function formatJson(content: string): string {
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return content
  }
}

/**
 * Collapsible content block for JSON or stack traces
 */
function CollapsibleContent({
  content,
  type
}: {
  content: string
  type: 'json' | 'stacktrace'
}) {
  const [expanded, setExpanded] = useState(false)
  const formattedContent = type === 'json' ? formatJson(content) : content
  const lines = formattedContent.split('\n')
  const previewLines = lines.slice(0, 2).join('\n')

  return (
    <div
      className="mt-1 rounded overflow-hidden"
      style={{ background: 'var(--mocha-bg-darker)' }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(!expanded)
        }}
        className="w-full px-2 py-1 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
        style={{ color: 'var(--mocha-text-muted)' }}
      >
        {expanded ? (
          <ChevronUp className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0" />
        )}
        <span className="text-[10px] uppercase tracking-wide">
          {type === 'json' ? 'JSON' : 'Stack Trace'} ({lines.length} lines)
        </span>
      </button>

      <div
        className="px-3 py-2 font-mono text-[11px] leading-relaxed overflow-x-auto"
        style={{
          color: 'var(--mocha-text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {expanded ? formattedContent : previewLines + (lines.length > 2 ? '\n...' : '')}
      </div>
    </div>
  )
}

/**
 * Single story line with expanded view
 */
const StoryLine = memo(function StoryLine({
  log,
  onRemove
}: {
  log: LogEntry
  onRemove: () => void
}) {
  const serviceName = getServiceName(log)
  const content = log.parsed?.content || log.data
  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null

  // Check if content has special formatting needs
  const hasJson = isJsonContent(content)
  const hasStackTrace = !hasJson && isStackTrace(content)

  // Tokenize the main content (non-JSON, non-stacktrace)
  const mainContent = hasJson || hasStackTrace ? '' : content
  const tokens = tokenizeContent(mainContent)

  return (
    <div
      className="group relative px-3 py-2 border-b transition-colors hover:bg-white/5"
      style={{
        borderColor: 'var(--mocha-border-subtle)',
        background: 'var(--mocha-bg)',
      }}
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute right-2 top-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
        style={{ color: 'var(--mocha-text-muted)' }}
        title="Remove from story"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Header: timestamp + service */}
      <div className="flex items-center gap-2 mb-1">
        {timestamp && (
          <span
            className="text-[10px] font-mono tabular-nums"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            {timestamp}
          </span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{
            background: 'var(--mocha-accent-muted)',
            color: 'var(--mocha-accent)',
          }}
        >
          {serviceName}
        </span>
      </div>

      {/* Content */}
      <div
        className="font-mono text-[12px] leading-relaxed pr-6"
        style={{
          color: 'var(--mocha-text)',
          wordBreak: 'break-word',
        }}
      >
        {hasJson ? (
          <CollapsibleContent content={content} type="json" />
        ) : hasStackTrace ? (
          <CollapsibleContent content={content} type="stacktrace" />
        ) : (
          tokens.map((token, i) => <TokenSpan key={i} token={token} />)
        )}
      </div>
    </div>
  )
})

/**
 * Resize handle for the story pane
 */
function ResizeHandle({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const dragging = useRef(false)
  const lastY = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastY.current = e.clientY
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const deltaY = lastY.current - e.clientY
      lastY.current = e.clientY
      onDrag(deltaY)
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onDrag])

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1.5 cursor-row-resize flex items-center justify-center group"
      style={{ background: 'var(--mocha-border)' }}
    >
      <div
        className="w-12 h-0.5 rounded-full transition-colors group-hover:bg-white/30"
        style={{ background: 'var(--mocha-text-muted)' }}
      />
    </div>
  )
}

/**
 * Story Pane - displays curated log lines
 */
export function StoryPane({
  storyLogs,
  height,
  collapsed,
  onRemoveFromStory,
  onClearStory,
  onHeightChange,
  onToggleCollapsed,
}: StoryPaneProps) {
  const handleCopy = useCallback(() => {
    const text = storyLogs
      .map((log) => {
        const timestamp = log.parsed?.timestamp || ''
        const service = getServiceName(log)
        const content = log.parsed?.content || log.data
        return `[${timestamp}] ${service}: ${content}`
      })
      .join('\n\n')

    navigator.clipboard.writeText(text)
  }, [storyLogs])

  const handleDrag = useCallback((deltaY: number) => {
    onHeightChange(Math.max(100, Math.min(600, height + deltaY)))
  }, [height, onHeightChange])

  const isEmpty = storyLogs.length === 0

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        height: collapsed ? 'auto' : height,
        borderTop: '1px solid var(--mocha-border)',
      }}
    >
      {/* Resize handle */}
      {!collapsed && <ResizeHandle onDrag={handleDrag} />}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{
          background: 'var(--mocha-bg-elevated)',
          borderBottom: collapsed ? 'none' : '1px solid var(--mocha-border-subtle)',
        }}
      >
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {collapsed ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
          )}
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--mocha-text)' }}
          >
            Your Story
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--mocha-accent-muted)',
              color: 'var(--mocha-accent)',
            }}
          >
            {storyLogs.length}
          </span>
        </button>

        {!collapsed && !isEmpty && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--mocha-text-muted)' }}
              title="Copy story"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={onClearStory}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--mocha-text-muted)' }}
              title="Clear story"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: 'var(--mocha-bg)' }}
        >
          {isEmpty ? (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: 'var(--mocha-text-muted)' }}
            >
              Click log lines above to build your story
            </div>
          ) : (
            storyLogs.map((log) => (
              <StoryLine
                key={log.hash}
                log={log}
                onRemove={() => log.hash && onRemoveFromStory(log.hash)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
