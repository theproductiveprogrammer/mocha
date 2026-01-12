import { memo, useCallback } from 'react'
import { Check, WrapText } from 'lucide-react'
import type { LogEntry } from '../types'

// Level-based styling
const LEVEL_STYLES: Record<string, string> = {
  ERROR: 'bg-red-50 border-red-200',
  WARN: 'bg-amber-50 border-amber-200',
  INFO: 'bg-white border-gray-200',
  DEBUG: 'bg-gray-50 border-gray-200',
  TRACE: 'bg-gray-50 border-gray-100',
}

const LEVEL_TEXT_STYLES: Record<string, string> = {
  ERROR: 'text-red-700',
  WARN: 'text-amber-700',
  INFO: 'text-gray-800',
  DEBUG: 'text-gray-600',
  TRACE: 'text-gray-500',
}

const LEVEL_BADGE_STYLES: Record<string, string> = {
  ERROR: 'bg-red-100 text-red-700',
  WARN: 'bg-amber-100 text-amber-700',
  INFO: 'bg-blue-100 text-blue-700',
  DEBUG: 'bg-gray-100 text-gray-600',
  TRACE: 'bg-gray-100 text-gray-500',
}

// Service-based color mapping
const SERVICE_COLORS: Record<string, { bg: string; text: string }> = {
  core: { bg: 'bg-blue-100', text: 'text-blue-700' },
  app: { bg: 'bg-purple-100', text: 'text-purple-700' },
  platform: { bg: 'bg-green-100', text: 'text-green-700' },
  runner: { bg: 'bg-gray-100', text: 'text-gray-600' },
  iwf: { bg: 'bg-orange-100', text: 'text-orange-700' },
  rag: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  transcriber: { bg: 'bg-pink-100', text: 'text-pink-700' },
  tracker: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  verify: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  pixel: { bg: 'bg-teal-100', text: 'text-teal-700' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700' },
}

function getServiceColor(name: string): { bg: string; text: string } {
  // Try exact match first
  if (SERVICE_COLORS[name.toLowerCase()]) {
    return SERVICE_COLORS[name.toLowerCase()]
  }
  // Try partial match
  for (const key of Object.keys(SERVICE_COLORS)) {
    if (name.toLowerCase().includes(key)) {
      return SERVICE_COLORS[key]
    }
  }
  return SERVICE_COLORS.default
}

export interface LogLineProps {
  log: LogEntry
  isSelected: boolean
  isWrapped: boolean
  onSelect: (hash: string, event: React.MouseEvent) => void
  onToggleWrap: (hash: string) => void
}

function LogLineComponent({
  log,
  isSelected,
  isWrapped,
  onSelect,
  onToggleWrap,
}: LogLineProps) {
  const level = log.parsed?.level || 'INFO'
  const levelStyle = LEVEL_STYLES[level] || LEVEL_STYLES.INFO
  const levelTextStyle = LEVEL_TEXT_STYLES[level] || LEVEL_TEXT_STYLES.INFO
  const levelBadgeStyle = LEVEL_BADGE_STYLES[level] || LEVEL_BADGE_STYLES.INFO
  const serviceColor = getServiceColor(log.name)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (log.hash) {
        onSelect(log.hash, e)
      }
    },
    [log.hash, onSelect]
  )

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (log.hash) {
        onToggleWrap(log.hash)
      }
    },
    [log.hash, onToggleWrap]
  )

  const handleWrapButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (log.hash) {
        onToggleWrap(log.hash)
      }
    },
    [log.hash, onToggleWrap]
  )

  // Format timestamp for display (show time only if available)
  const displayTimestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8) // Get HH:MM:SS from datetime
      : log.parsed.timestamp.slice(0, 8) // Already time only
    : null

  return (
    <div
      className={`flex items-stretch border-b cursor-pointer transition-colors font-mono text-xs ${levelStyle} ${
        isSelected ? 'ring-2 ring-blue-400 ring-inset bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={handleClick}
      data-testid="log-line"
      data-hash={log.hash}
      data-selected={isSelected}
    >
      {/* Selection gutter */}
      <div
        className={`w-6 flex-shrink-0 flex items-center justify-center border-r ${
          isSelected ? 'bg-blue-100 border-blue-200' : 'bg-gray-50 border-gray-200'
        }`}
        data-testid="log-line-gutter"
      >
        {isSelected && <Check className="w-3 h-3 text-blue-600" />}
      </div>

      {/* Timestamp column */}
      {displayTimestamp && (
        <div
          className="w-20 flex-shrink-0 px-2 py-1 text-gray-500 border-r border-gray-200 flex items-center"
          data-testid="log-line-timestamp"
        >
          {displayTimestamp}
        </div>
      )}

      {/* Service badge column */}
      <div
        className="w-24 flex-shrink-0 px-1 py-1 flex items-center border-r border-gray-200"
        data-testid="log-line-service"
      >
        <span
          className={`px-1.5 py-0.5 rounded text-xs truncate ${serviceColor.bg} ${serviceColor.text}`}
          title={log.name}
        >
          {log.name}
        </span>
      </div>

      {/* Level badge */}
      {log.parsed?.level && (
        <div
          className="w-14 flex-shrink-0 px-1 py-1 flex items-center"
          data-testid="log-line-level"
        >
          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${levelBadgeStyle}`}>
            {log.parsed.level}
          </span>
        </div>
      )}

      {/* Content area */}
      <div
        className={`flex-1 px-2 py-1 min-w-0 ${levelTextStyle}`}
        onClick={handleContentClick}
        data-testid="log-line-content"
      >
        <div className={isWrapped ? 'whitespace-pre-wrap break-words' : 'line-clamp-3 truncate'}>
          {log.parsed?.content || log.data}
        </div>
        {/* API call info */}
        {log.parsed?.apiCall && (
          <div className="mt-1 text-cyan-600 text-xs" data-testid="log-line-api">
            {log.parsed.apiCall.direction === 'outgoing' ? '→' : '←'}{' '}
            {log.parsed.apiCall.method && `${log.parsed.apiCall.method} `}
            {log.parsed.apiCall.endpoint}
            {log.parsed.apiCall.status && ` [${log.parsed.apiCall.status}]`}
            {log.parsed.apiCall.timing && ` (${log.parsed.apiCall.timing}ms)`}
          </div>
        )}
      </div>

      {/* Wrap toggle button */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center">
        <button
          onClick={handleWrapButtonClick}
          className={`p-1 rounded hover:bg-gray-200 ${
            isWrapped ? 'text-blue-500' : 'text-gray-400'
          }`}
          title={isWrapped ? 'Collapse text' : 'Expand text'}
          data-testid="log-line-wrap-btn"
        >
          <WrapText className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Memoize to prevent unnecessary re-renders
export const LogLine = memo(LogLineComponent)
