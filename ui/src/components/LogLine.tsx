import { memo, useCallback } from 'react'
import type { LogEntry } from '../types'

// Service colors for consistent badge coloring
const SERVICE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  core: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  app: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  platform: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  runner: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
  iwf: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  rag: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300' },
  transcriber: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
  tracker: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  verify: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' },
  pixel: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-300' },
}

function getServiceColor(name: string) {
  const lowerName = name.toLowerCase()
  for (const [key, colors] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(key)) return colors
  }
  return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' }
}

function getRowStyle(log: LogEntry): { bg: string; text: string } {
  const errStyle = { bg: 'bg-red-50', text: 'text-red-700' }
  const warnStyle = { bg: 'bg-amber-50', text: 'text-amber-800' }
  const normStyle = { bg: 'bg-white', text: 'text-gray-800' }

  if (log.parsed?.level === 'ERROR') return errStyle
  if (log.parsed?.level === 'WARN') return warnStyle

  // Check for exception patterns
  if (/[.][A-Za-z0-9]*Exception/.test(log.data)) return errStyle

  return normStyle
}

// Parse logger into class name and line number
// Handles formats like:
//   "c.s.c.MCPController:466" -> { className: "MCPController", lineNumber: "466" }
//   "c.s.c.MCPController [MCPController.java:466]" -> { className: "MCPController", lineNumber: "466" }
function parseLogger(logger?: string): { className: string; lineNumber?: string } | undefined {
  if (!logger) return undefined

  // Extract line number from "[Source.java:line]" suffix if present
  const sourceMatch = logger.match(/\[([^\]]+)\.java:(\d+)\]$/)
  if (sourceMatch) {
    // Use the source file name as class name and extracted line number
    const cleanLogger = logger.replace(/\s*\[[^\]]+\.java:\d+\]$/, '')
    const className = cleanLogger.split('.').pop() || cleanLogger
    return { className, lineNumber: sourceMatch[2] }
  }

  // Fallback: simple "path.ClassName:lineNumber" format
  const [classPath, lineNumber] = logger.split(':')
  const className = classPath.split('.').pop() || classPath
  return { className, lineNumber }
}

/**
 * Get short service name from log entry.
 * Extracts class name from logger path.
 * Examples:
 *   "c.s.c.MCPController:466" -> "MCPController"
 *   "c.s.c.MCPController [MCPController.java:466]" -> "MCPController"
 *   "i.i.w.u.StateWaitForLeads [StateWaitForLeads.java:133]" -> "StateWaitForLeads"
 */
export function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    let logger = log.parsed.logger

    // Remove "[Source.java:line]" suffix if present
    logger = logger.replace(/\s*\[[^\]]+\.java:\d+\]$/, '')

    // Remove line number suffix if present (e.g., ":466")
    const withoutLineNum = logger.split(':')[0]

    // Get last segment after dots
    const parts = withoutLineNum.split('.')
    return parts[parts.length - 1] || withoutLineNum
  }
  return log.name
}

export interface LogLineProps {
  log: LogEntry
  isSelected: boolean
  isWrapped: boolean
  isContinuation: boolean
  isLastInGroup: boolean
  onSelect: (hash: string, event: React.MouseEvent) => void
  onToggleWrap: (hash: string) => void
}

function LogLineComponent({
  log,
  isSelected,
  isWrapped,
  isContinuation,
  isLastInGroup,
  onSelect,
  onToggleWrap,
}: LogLineProps) {
  const serviceName = getServiceName(log)
  const serviceColor = getServiceColor(serviceName)
  const rowStyle = getRowStyle(log)

  const handleGutterClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (log.hash) {
        onSelect(log.hash, e)
      }
    },
    [log.hash, onSelect]
  )

  const handleLineClick = useCallback(
    () => {
      if (log.hash) {
        onToggleWrap(log.hash)
      }
    },
    [log.hash, onToggleWrap]
  )

  // Format timestamp for display
  const displayTimestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null

  // Parse logger for class name display
  const loggerInfo = parseLogger(log.parsed?.logger)
  const isErrorOrWarn = log.parsed?.level === 'ERROR' || log.parsed?.level === 'WARN'

  return (
    <div
      className={`flex ${isLastInGroup ? 'border-b border-gray-200' : ''} ${rowStyle.bg} ${
        isSelected ? 'ring-2 ring-inset ring-blue-400' : ''
      }`}
      data-testid="log-line"
      data-hash={log.hash}
      data-selected={isSelected}
    >
      {/* Selection gutter */}
      <div
        onClick={handleGutterClick}
        className={`w-6 shrink-0 cursor-pointer self-stretch flex items-center justify-center ${
          isSelected ? 'bg-blue-500' : 'bg-gray-50'
        }`}
        title={isSelected ? 'Deselect line (Shift+click for range)' : 'Select line (Shift+click for range)'}
        data-testid="log-line-gutter"
      >
        {isSelected ? (
          <span className="text-white text-xs">✓</span>
        ) : (
          <span className="text-gray-300 text-xs">○</span>
        )}
      </div>

      {/* Left column: timestamp + service badge (hidden for continuation rows) */}
      <div className={`w-28 shrink-0 px-2 border-r border-gray-200 flex flex-col justify-center items-start gap-0.5 ${isContinuation ? 'py-0.5' : 'py-2 min-h-[40px]'}`}>
        {!isContinuation && (
          <>
            {displayTimestamp && (
              <span className="text-xs text-gray-400 font-mono" data-testid="log-line-timestamp">
                {displayTimestamp}
              </span>
            )}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium max-w-full truncate ${serviceColor.bg} ${serviceColor.text} ${serviceColor.border}`}
              title={log.parsed?.logger || log.name}
              data-testid="log-line-service"
            >
              {serviceName}
            </span>
          </>
        )}
      </div>

      {/* Right column: log content */}
      <div
        onClick={handleLineClick}
        className={`flex-1 px-3 cursor-pointer font-mono text-[13px] leading-tight ${rowStyle.text} ${
          isContinuation ? 'py-0.5' : 'py-2 min-h-[40px]'
        } ${isWrapped ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
        data-testid="log-line-content"
      >
        {/* Logger class name prefix (only show on first line of group) */}
        {loggerInfo && !isContinuation && (
          <span className="font-bold">
            {loggerInfo.className}
            {loggerInfo.lineNumber && (
              <span className={isErrorOrWarn ? '' : 'text-green-600 font-normal'}>
                :{loggerInfo.lineNumber}
              </span>
            )}
            {': '}
          </span>
        )}

        {/* Content */}
        {log.parsed?.content || log.data}

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
    </div>
  )
}

export const LogLine = memo(LogLineComponent)
