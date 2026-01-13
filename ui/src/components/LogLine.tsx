import { memo, useCallback } from 'react'
import { Check, Circle, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import type { LogEntry } from '../types'

// Service colors - vibrant but not overwhelming
const SERVICE_COLORS: Record<string, string> = {
  core: 'var(--badge-core)',
  app: 'var(--badge-app)',
  platform: 'var(--badge-platform)',
  runner: 'var(--badge-runner)',
  iwf: 'var(--badge-iwf)',
  rag: 'var(--badge-rag)',
  transcriber: 'var(--badge-transcriber)',
  tracker: 'var(--badge-tracker)',
  verify: 'var(--badge-verify)',
  pixel: 'var(--badge-pixel)',
  api: 'var(--mocha-info)',
  controller: 'var(--badge-core)',
  service: 'var(--badge-app)',
  helper: 'var(--badge-platform)',
  scheduler: 'var(--badge-tracker)',
  state: 'var(--badge-verify)',
  notification: 'var(--badge-iwf)',
  unipile: 'var(--badge-rag)',
  openai: 'var(--badge-transcriber)',
  mcp: 'var(--badge-pixel)',
}

function getServiceColor(name: string): string {
  const lowerName = name.toLowerCase()
  for (const [key, color] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(key)) return color
  }
  return 'var(--badge-default)'
}

function getRowStyle(log: LogEntry): {
  bg: string
  bgHover: string
  text: string
  accent: string
  border: string
} {
  const errStyle = {
    bg: 'var(--mocha-error-bg)',
    bgHover: 'rgba(58, 32, 32, 0.8)',
    text: 'var(--mocha-error)',
    accent: 'var(--mocha-error)',
    border: 'var(--mocha-error-border)',
  }
  const warnStyle = {
    bg: 'var(--mocha-warning-bg)',
    bgHover: 'rgba(58, 48, 32, 0.8)',
    text: 'var(--mocha-warning)',
    accent: 'var(--mocha-warning)',
    border: 'var(--mocha-warning-border)',
  }
  const normStyle = {
    bg: 'var(--mocha-bg)',
    bgHover: 'var(--mocha-surface)',
    text: 'var(--mocha-text)',
    accent: 'var(--mocha-text-secondary)',
    border: 'var(--mocha-border-subtle)',
  }

  if (log.parsed?.level === 'ERROR') return errStyle
  if (log.parsed?.level === 'WARN') return warnStyle

  // Check for exception patterns
  if (/[.][A-Za-z0-9]*Exception/.test(log.data)) return errStyle

  return normStyle
}

// Parse logger into class name and line number
function parseLogger(logger?: string): { className: string; lineNumber?: string } | undefined {
  if (!logger) return undefined

  // Extract line number from "[Source.java:line]" suffix if present
  const sourceMatch = logger.match(/\[([^\]]+)\.java:(\d+)\]$/)
  if (sourceMatch) {
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
 */
export function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    let logger = log.parsed.logger
    logger = logger.replace(/\s*\[[^\]]+\.java:\d+\]$/, '')
    const withoutLineNum = logger.split(':')[0]
    const parts = withoutLineNum.split('.')
    return parts[parts.length - 1] || withoutLineNum
  }
  return log.name
}

/**
 * Create a smart abbreviation for long service names
 * e.g., "StateCollectNotifications" → "StateColl..." or extract meaningful part
 * e.g., "NotificationSchedulerService" → "NotifSched"
 */
function getServiceAbbrev(name: string): string {
  // If short enough, return as-is
  if (name.length <= 12) return name

  // Try to extract meaningful parts by splitting on camelCase
  const parts = name.split(/(?=[A-Z])/).filter(p => p.length > 0)

  // Common suffixes to remove
  const suffixes = ['Service', 'Controller', 'Helper', 'Logic', 'Scheduler', 'Manager', 'Handler', 'Processor']
  const cleanParts = parts.filter(p => !suffixes.includes(p))

  if (cleanParts.length === 0) {
    // If all parts were suffixes, just truncate
    return name.slice(0, 10) + '…'
  }

  // Take first 2-3 parts and abbreviate
  if (cleanParts.length === 1) {
    return cleanParts[0].slice(0, 12) + (cleanParts[0].length > 12 ? '…' : '')
  }

  // Combine first parts, keeping it short
  let result = ''
  for (const part of cleanParts) {
    if (result.length + part.length <= 12) {
      result += part
    } else {
      break
    }
  }

  return result || name.slice(0, 10) + '…'
}

/**
 * Get HTTP method styling
 */
function getMethodStyle(method: string): { bg: string; text: string } {
  switch (method.toUpperCase()) {
    case 'GET':
      return { bg: 'color-mix(in srgb, var(--mocha-info) 20%, transparent)', text: 'var(--mocha-info)' }
    case 'POST':
      return { bg: 'color-mix(in srgb, var(--mocha-success) 20%, transparent)', text: 'var(--mocha-success)' }
    case 'PUT':
    case 'PATCH':
      return { bg: 'color-mix(in srgb, var(--mocha-warning) 20%, transparent)', text: 'var(--mocha-warning)' }
    case 'DELETE':
      return { bg: 'color-mix(in srgb, var(--mocha-error) 20%, transparent)', text: 'var(--mocha-error)' }
    default:
      return { bg: 'var(--mocha-surface-raised)', text: 'var(--mocha-text-secondary)' }
  }
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
  const serviceAbbrev = getServiceAbbrev(serviceName)
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

  // Parse logger for line number only (class name shown in badge)
  const loggerInfo = parseLogger(log.parsed?.logger)
  const isErrorOrWarn = log.parsed?.level === 'ERROR' || log.parsed?.level === 'WARN'

  // Check if this is an API-related log (has apiCall data)
  const hasApiCall = !!log.parsed?.apiCall
  const apiCall = log.parsed?.apiCall

  return (
    <div
      className="flex group transition-colors"
      style={{
        background: isSelected ? 'var(--mocha-selection)' : rowStyle.bg,
        borderBottom: isLastInGroup ? `1px solid ${rowStyle.border}` : 'none',
        boxShadow: isSelected ? 'inset 0 0 0 1px var(--mocha-selection-border)' : 'none',
      }}
      data-testid="log-line"
      data-hash={log.hash}
      data-selected={isSelected}
    >
      {/* Selection gutter */}
      <div
        onClick={handleGutterClick}
        className="w-8 shrink-0 cursor-pointer self-stretch flex items-center justify-center transition-all"
        style={{
          background: isSelected
            ? 'var(--mocha-accent)'
            : 'transparent',
          borderRight: `1px solid ${isSelected ? 'var(--mocha-accent)' : 'var(--mocha-border-subtle)'}`,
        }}
        title={isSelected ? 'Deselect line (Shift+click for range)' : 'Select line (Shift+click for range)'}
        data-testid="log-line-gutter"
      >
        {isSelected ? (
          <Check className="w-3.5 h-3.5" style={{ color: 'var(--mocha-bg)' }} />
        ) : (
          <Circle
            className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--mocha-text-muted)' }}
          />
        )}
      </div>

      {/* Left column: timestamp + service badge */}
      <div
        className={`w-32 shrink-0 px-3 flex flex-col justify-center items-start gap-1 ${
          isContinuation ? 'py-0.5' : 'py-2 min-h-[44px]'
        }`}
        style={{
          borderRight: `1px solid var(--mocha-border-subtle)`,
        }}
      >
        {!isContinuation && (
          <>
            {displayTimestamp && (
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: 'var(--mocha-text-muted)' }}
                data-testid="log-line-timestamp"
              >
                {displayTimestamp}
              </span>
            )}
            {/* Service badge with abbreviation */}
            <div className="flex items-center gap-1.5 max-w-full">
              {/* Direction indicator for API calls */}
              {hasApiCall && (
                <span
                  className="flex items-center justify-center w-4 h-4 rounded"
                  style={{
                    background: apiCall?.direction === 'outgoing'
                      ? 'color-mix(in srgb, var(--mocha-info) 25%, transparent)'
                      : 'color-mix(in srgb, var(--mocha-success) 25%, transparent)',
                  }}
                >
                  {apiCall?.direction === 'outgoing' ? (
                    <ArrowUpRight className="w-3 h-3" style={{ color: 'var(--mocha-info)' }} />
                  ) : (
                    <ArrowDownLeft className="w-3 h-3" style={{ color: 'var(--mocha-success)' }} />
                  )}
                </span>
              )}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium truncate"
                style={{
                  background: `color-mix(in srgb, ${serviceColor} 15%, transparent)`,
                  color: serviceColor,
                }}
                title={serviceName}
                data-testid="log-line-service"
              >
                {serviceAbbrev}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right column: log content */}
      <div
        onClick={handleLineClick}
        className={`flex-1 px-4 cursor-pointer font-mono text-[13px] leading-relaxed flex items-start gap-2 ${
          isContinuation ? 'py-0.5' : 'py-2 min-h-[44px]'
        }`}
        style={{ color: rowStyle.text }}
        data-testid="log-line-content"
      >
        <div className={`flex-1 ${isWrapped ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
          {/* Line number prefix (only on first line of group) */}
          {loggerInfo?.lineNumber && !isContinuation && (
            <span
              className="font-medium mr-1"
              style={{
                color: isErrorOrWarn ? rowStyle.accent : 'var(--mocha-info)',
              }}
            >
              :{loggerInfo.lineNumber}
            </span>
          )}

          {/* API call inline visualization (integrated, not separate) */}
          {hasApiCall && apiCall?.method && !isContinuation && (() => {
            const methodStyle = getMethodStyle(apiCall.method)
            return (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold mr-2"
                style={{ background: methodStyle.bg, color: methodStyle.text }}
              >
                {apiCall.method}
              </span>
            )
          })()}

          {/* Status code badge (inline) */}
          {hasApiCall && apiCall?.status && !isContinuation && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mr-2"
              style={{
                background: apiCall.status >= 400
                  ? 'var(--mocha-error-bg)'
                  : apiCall.status >= 300
                    ? 'var(--mocha-warning-bg)'
                    : 'color-mix(in srgb, var(--mocha-success) 20%, transparent)',
                color: apiCall.status >= 400
                  ? 'var(--mocha-error)'
                  : apiCall.status >= 300
                    ? 'var(--mocha-warning)'
                    : 'var(--mocha-success)',
              }}
            >
              {apiCall.status}
            </span>
          )}

          {/* Timing badge (inline) */}
          {hasApiCall && apiCall?.timing && !isContinuation && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] mr-2"
              style={{
                background: 'var(--mocha-surface-raised)',
                color: 'var(--mocha-text-muted)',
              }}
            >
              {apiCall.timing}
            </span>
          )}

          {/* Main content */}
          <span>{log.parsed?.content || log.data}</span>
        </div>
      </div>
    </div>
  )
}

export const LogLine = memo(LogLineComponent)
