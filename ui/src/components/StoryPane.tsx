import { useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  X,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  MoreHorizontal,
  FileText,
  Check,
  Pencil,
} from 'lucide-react'
import type { LogEntry, LogToken, Story } from '../types'
import { tokenizeContent } from '../parser'
import { getServiceName } from './LogLine'

interface StoryPaneProps {
  stories: Story[]
  activeStoryId: string | null
  storyLogs: LogEntry[]
  height: number
  collapsed: boolean
  onRemoveFromStory: (hash: string) => void
  onClearStory: () => void
  onHeightChange: (height: number) => void
  onToggleCollapsed: () => void
  onCreateStory: (name?: string) => void
  onDeleteStory: (id: string) => void
  onRenameStory: (id: string, name: string) => void
  onSetActiveStory: (id: string) => void
}

import { ArrowLeft, ArrowRight } from 'lucide-react'

/**
 * Render a single token with appropriate styling
 */
function TokenSpan({ token }: { token: LogToken }) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
      case 'marker.error':
        return { color: '#e85c5c', fontWeight: 600 }
      case 'marker.warn':
        return { color: '#d4a054', fontWeight: 600 }
      case 'marker.info':
        return { color: '#8b8b8b' }
      case 'url':
        return { color: '#6b9ece' }
      case 'data':
        return { color: '#b8956f', fontWeight: 500 }
      case 'json':
        return { color: '#8b8b8b' }
      case 'symbol':
        return { color: '#8b8b8b' }
      case 'message':
      default:
        return {}
    }
  }

  return <span style={getTokenStyle()}>{token.text}</span>
}

/**
 * Parse API call from log content
 */
interface ApiCallParsed {
  url: string
  direction: 'in' | 'out' | null
  body: string | null
  prefix: string | null // text before the URL
}

function parseApiCall(content: string): ApiCallParsed | null {
  // Match patterns like:
  // "/user-token/get-access-token: <- {...}"
  // "GET /api/users -> {...}"
  // "c.s.platform.auth.TokenProvider - /user-token/get-access-token: <- {...}"

  const urlMatch = content.match(/(\/[a-zA-Z0-9\-_\/]+)/)
  if (!urlMatch) return null

  const url = urlMatch[1]
  const urlIndex = content.indexOf(url)
  const prefix = urlIndex > 0 ? content.slice(0, urlIndex).trim() : null
  const afterUrl = content.slice(urlIndex + url.length)

  // Detect direction
  let direction: 'in' | 'out' | null = null
  let bodyStart = 0

  if (afterUrl.includes('<-') || afterUrl.includes('←')) {
    direction = 'in'
    bodyStart = Math.max(afterUrl.indexOf('<-'), afterUrl.indexOf('←')) + 2
  } else if (afterUrl.includes('->') || afterUrl.includes('→')) {
    direction = 'out'
    bodyStart = Math.max(afterUrl.indexOf('->'), afterUrl.indexOf('→')) + 2
  }

  // Extract body (everything after the direction arrow)
  let body: string | null = null
  if (bodyStart > 0) {
    body = afterUrl.slice(bodyStart).trim()
    // Clean up the body - remove leading colon if present
    if (body.startsWith(':')) body = body.slice(1).trim()
  } else {
    // No direction found, check for body after colon
    const colonIndex = afterUrl.indexOf(':')
    if (colonIndex >= 0) {
      body = afterUrl.slice(colonIndex + 1).trim()
    }
  }

  return { url, direction, body, prefix }
}

/**
 * Format JSON for display
 */
function formatJsonBody(body: string): string {
  try {
    const parsed = JSON.parse(body)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return body
  }
}

/**
 * API Call display component
 */
function ApiCallDisplay({ parsed }: { parsed: ApiCallParsed }) {
  const [expanded, setExpanded] = useState(false)
  const hasBody = parsed.body && parsed.body.length > 0
  const isJson = hasBody && (parsed.body!.startsWith('{') || parsed.body!.startsWith('['))

  return (
    <div className="space-y-2">
      {/* URL row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Direction badge */}
        {parsed.direction && (
          <span
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
              ${parsed.direction === 'in'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700'
              }
            `}
          >
            {parsed.direction === 'in' ? (
              <>
                <ArrowLeft className="w-3 h-3" />
                Response
              </>
            ) : (
              <>
                <ArrowRight className="w-3 h-3" />
                Request
              </>
            )}
          </span>
        )}

        {/* URL */}
        <code
          className="px-2 py-1 rounded text-[12px] font-semibold"
          style={{
            background: 'rgba(107, 158, 206, 0.15)',
            color: '#4a7ba8',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {parsed.url}
        </code>
      </div>

      {/* Body */}
      {hasBody && (
        <div
          className="rounded overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {isJson ? (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-3 py-1.5 text-left text-[10px] uppercase tracking-wide flex items-center gap-2 hover:bg-black/5 transition-colors"
                style={{ color: '#8b8378' }}
              >
                {expanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                JSON Body
              </button>
              <pre
                className="px-3 py-2 text-[11px] leading-relaxed overflow-x-auto"
                style={{
                  color: '#5a544d',
                  fontFamily: '"JetBrains Mono", monospace',
                  maxHeight: expanded ? '300px' : '60px',
                  overflow: expanded ? 'auto' : 'hidden',
                }}
              >
                {expanded ? formatJsonBody(parsed.body!) : parsed.body!.slice(0, 100) + (parsed.body!.length > 100 ? '...' : '')}
              </pre>
            </>
          ) : (
            <div
              className="px-3 py-2 text-[11px] leading-relaxed"
              style={{
                color: '#5a544d',
                fontFamily: '"JetBrains Mono", monospace',
                wordBreak: 'break-all',
              }}
            >
              {parsed.body}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Evidence card for a single log entry
 * Click to toggle between formatted and raw view
 */
const EvidenceCard = memo(function EvidenceCard({
  log,
  index,
  onRemove,
}: {
  log: LogEntry
  index: number
  onRemove: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)
  const serviceName = getServiceName(log)
  const content = log.parsed?.content || log.data
  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null

  // Check if this is an API call
  const apiCall = parseApiCall(content)
  const { tokens } = tokenizeContent(content)

  // Raw log data (original line from file)
  const rawLog = log.data

  return (
    <div className="group relative">
      {/* Card */}
      <div
        onClick={() => setShowRaw(!showRaw)}
        className="relative mx-4 mb-3 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md"
        style={{
          background: showRaw
            ? 'linear-gradient(135deg, #2a2826 0%, #1e1c1a 100%)'
            : 'linear-gradient(135deg, #faf8f5 0%, #f5f2ed 100%)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
          border: showRaw ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Evidence number */}
        <div
          className="absolute -left-0 top-0 bottom-0 w-10 flex items-center justify-center"
          style={{
            background: showRaw
              ? 'linear-gradient(135deg, #3a3836 0%, #2a2826 100%)'
              : 'linear-gradient(135deg, #e8e4de 0%, #ddd8d0 100%)',
            borderRight: showRaw ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <span
            className="text-xs font-bold tabular-nums"
            style={{
              color: showRaw ? '#8a8680' : '#6b635a',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {/* Content area */}
        <div className="pl-12 pr-10 py-3">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            {timestamp && (
              <span
                className="text-[10px] tracking-wide tabular-nums"
                style={{
                  color: showRaw ? '#6a6460' : '#8b8378',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {timestamp}
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
              style={{
                background: showRaw ? 'rgba(255,255,255,0.1)' : '#e8e4de',
                color: showRaw ? '#a8a098' : '#6b635a',
              }}
            >
              {serviceName}
            </span>
            {showRaw && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                style={{
                  background: 'rgba(90, 181, 168, 0.2)',
                  color: '#5ab5a8',
                }}
              >
                RAW
              </span>
            )}
          </div>

          {/* Log content - raw or formatted */}
          {showRaw ? (
            <div
              className="text-[11px] leading-relaxed whitespace-pre-wrap break-all select-text"
              style={{
                color: '#c8c0b8',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {rawLog}
            </div>
          ) : apiCall ? (
            <ApiCallDisplay parsed={apiCall} />
          ) : (
            <div
              className="text-[13px] leading-relaxed"
              style={{
                color: '#3d3833',
                fontFamily: '"JetBrains Mono", monospace',
                wordBreak: 'break-word',
              }}
            >
              {tokens.map((token, i) => (
                <TokenSpan key={i} token={token} />
              ))}
            </div>
          )}
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute right-2 top-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          style={{
            background: showRaw ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
            color: showRaw ? '#a8a098' : '#8b8378',
          }}
          title="Remove from story"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
})

/**
 * Story tab component
 */
function StoryTab({
  story,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  story: Story
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(story.name)
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSubmit = () => {
    if (editValue.trim()) {
      onRename(editValue.trim())
    }
    setIsEditing(false)
  }

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onDoubleClick={() => setIsEditing(true)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium
          transition-all duration-200 border border-b-0
          ${isActive
            ? 'bg-gradient-to-b from-[#faf8f5] to-[#f5f2ed] border-[rgba(0,0,0,0.08)] text-[#3d3833]'
            : 'bg-transparent border-transparent text-[#8b8378] hover:text-[#6b635a] hover:bg-[rgba(0,0,0,0.03)]'
          }
        `}
        style={{
          fontFamily: '"Source Serif 4", Georgia, serif',
        }}
      >
        <FileText className="w-3.5 h-3.5" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
              if (e.key === 'Escape') {
                setEditValue(story.name)
                setIsEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent outline-none w-24 text-sm"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          />
        ) : (
          <span className="max-w-[120px] truncate">{story.name}</span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
          style={{
            background: isActive ? '#e8e4de' : 'rgba(0,0,0,0.06)',
            color: '#6b635a',
          }}
        >
          {story.entries.length}
        </span>

        {isActive && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="absolute top-full left-0 z-20 mt-1 py-1 rounded-lg shadow-lg min-w-[140px]"
            style={{
              background: '#faf8f5',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          >
            <button
              onClick={() => {
                setIsEditing(true)
                setShowMenu(false)
              }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: '#3d3833' }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
            <button
              onClick={() => {
                onDelete()
                setShowMenu(false)
              }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: '#c45c5c' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

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
      className="h-2 cursor-row-resize flex items-center justify-center group"
      style={{
        background: 'linear-gradient(to bottom, #ddd8d0, #d5d0c8)',
      }}
    >
      <div
        className="w-16 h-1 rounded-full transition-colors group-hover:bg-[#a09890]"
        style={{ background: '#b8b0a5' }}
      />
    </div>
  )
}

/**
 * Story Pane - The Investigator's Notebook
 * A beautiful, readable pane for curating and reviewing log evidence
 */
export function StoryPane({
  stories,
  activeStoryId,
  storyLogs,
  height,
  collapsed,
  onRemoveFromStory,
  onClearStory,
  onHeightChange,
  onToggleCollapsed,
  onCreateStory,
  onDeleteStory,
  onRenameStory,
  onSetActiveStory,
}: StoryPaneProps) {
  const [copyFeedback, setCopyFeedback] = useState(false)

  const handleCopy = useCallback(() => {
    const text = storyLogs
      .map((log, i) => {
        const timestamp = log.parsed?.timestamp || ''
        const service = getServiceName(log)
        const content = log.parsed?.content || log.data
        return `[${String(i + 1).padStart(2, '0')}] ${timestamp} | ${service}\n    ${content}`
      })
      .join('\n\n')

    navigator.clipboard.writeText(text)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [storyLogs])

  const handleDrag = useCallback(
    (deltaY: number) => {
      onHeightChange(Math.max(150, Math.min(600, height + deltaY)))
    },
    [height, onHeightChange]
  )

  const activeStory = stories.find((s) => s.id === activeStoryId)
  const isEmpty = storyLogs.length === 0

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        height: collapsed ? 'auto' : height,
        background: 'linear-gradient(to bottom, #e8e4de, #ddd8d0)',
      }}
    >
      {/* Resize handle */}
      {!collapsed && <ResizeHandle onDrag={handleDrag} />}

      {/* Header with tabs */}
      <div
        className="flex items-center justify-between px-3 pt-2 pb-0 shrink-0"
        style={{ background: 'linear-gradient(to bottom, #d5d0c8, #cec9c0)' }}
      >
        {/* Left: Collapse toggle + tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapsed}
            className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] transition-colors mr-1"
            style={{ color: '#6b635a' }}
          >
            {collapsed ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Story tabs */}
          {!collapsed && (
            <div className="flex items-end gap-0.5">
              {stories.map((story) => (
                <StoryTab
                  key={story.id}
                  story={story}
                  isActive={story.id === activeStoryId}
                  onSelect={() => onSetActiveStory(story.id)}
                  onRename={(name) => onRenameStory(story.id, name)}
                  onDelete={() => onDeleteStory(story.id)}
                />
              ))}

              {/* New story button */}
              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-t-lg text-sm transition-all duration-200 hover:bg-[rgba(0,0,0,0.04)]"
                style={{ color: '#8b8378' }}
                title="New investigation"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Collapsed title */}
          {collapsed && (
            <span
              className="text-sm font-semibold"
              style={{
                color: '#3d3833',
                fontFamily: '"Source Serif 4", Georgia, serif',
              }}
            >
              Investigations
              <span
                className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: '#e8e4de', color: '#6b635a' }}
              >
                {stories.length}
              </span>
            </span>
          )}
        </div>

        {/* Right: Actions */}
        {!collapsed && activeStory && !isEmpty && (
          <div className="flex items-center gap-1 pb-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] transition-all duration-200 flex items-center gap-1"
              style={{ color: '#6b635a' }}
              title="Copy all"
            >
              {copyFeedback ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onClearStory}
              className="p-1.5 rounded-lg hover:bg-[rgba(0,0,0,0.06)] transition-colors"
              style={{ color: '#6b635a' }}
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      {!collapsed && (
        <div
          className="flex-1 overflow-y-auto py-4"
          style={{
            background: 'linear-gradient(135deg, #f0ece6 0%, #e8e4de 100%)',
          }}
        >
          {stories.length === 0 ? (
            // No stories yet
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: 'linear-gradient(135deg, #faf8f5 0%, #f0ece6 100%)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >
                <FileText className="w-6 h-6" style={{ color: '#8b8378' }} />
              </div>
              <p
                className="text-lg font-semibold mb-2"
                style={{
                  color: '#3d3833',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                }}
              >
                Start an Investigation
              </p>
              <p className="text-sm mb-4" style={{ color: '#8b8378' }}>
                Click log lines above to collect evidence
              </p>
              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #faf8f5 0%, #f0ece6 100%)',
                  color: '#3d3833',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                <Plus className="w-4 h-4" />
                New Investigation
              </button>
            </div>
          ) : isEmpty ? (
            // Story exists but empty
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-sm" style={{ color: '#8b8378' }}>
                Click log lines to add evidence to{' '}
                <span style={{ fontWeight: 600 }}>{activeStory?.name}</span>
              </p>
            </div>
          ) : (
            // Evidence cards
            <div className="space-y-0">
              {storyLogs.map((log, index) => (
                <EvidenceCard
                  key={log.hash}
                  log={log}
                  index={index}
                  onRemove={() => log.hash && onRemoveFromStory(log.hash)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
