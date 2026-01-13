import { memo, useCallback } from 'react'
import { Check, Circle } from 'lucide-react'
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
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-medium max-w-full truncate transition-all"
              style={{
                background: `color-mix(in srgb, ${serviceColor} 15%, transparent)`,
                color: serviceColor,
                border: `1px solid color-mix(in srgb, ${serviceColor} 25%, transparent)`,
              }}
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
        className={`flex-1 px-4 cursor-pointer font-mono text-[13px] leading-relaxed ${
          isContinuation ? 'py-0.5' : 'py-2 min-h-[44px]'
        } ${isWrapped ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
        style={{ color: rowStyle.text }}
        data-testid="log-line-content"
      >
        {/* Logger class name prefix (only show on first line of group) */}
        {loggerInfo && !isContinuation && (
          <span className="font-semibold">
            {loggerInfo.className}
            {loggerInfo.lineNumber && (
              <span
                style={{
                  color: isErrorOrWarn ? rowStyle.accent : 'var(--mocha-info)',
                  fontWeight: 'normal',
                }}
              >
                :{loggerInfo.lineNumber}
              </span>
            )}
            <span style={{ color: 'var(--mocha-text-muted)' }}>{' → '}</span>
          </span>
        )}

        {/* Content */}
        <span style={{ color: rowStyle.text }}>
          {log.parsed?.content || log.data}
        </span>

        {/* API call info */}
        {log.parsed?.apiCall && (
          <div
            className="mt-1.5 text-xs flex items-center gap-2"
            data-testid="log-line-api"
          >
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: 'color-mix(in srgb, var(--mocha-info) 15%, transparent)',
                color: 'var(--mocha-info)',
              }}
            >
              {log.parsed.apiCall.direction === 'outgoing' ? '→ OUT' : '← IN'}
            </span>
            <span style={{ color: 'var(--mocha-info)' }}>
              {log.parsed.apiCall.method && (
                <span className="font-medium">{log.parsed.apiCall.method} </span>
              )}
              {log.parsed.apiCall.endpoint}
              {log.parsed.apiCall.status && (
                <span
                  className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: log.parsed.apiCall.status >= 400
                      ? 'var(--mocha-error-bg)'
                      : 'color-mix(in srgb, var(--mocha-success) 15%, transparent)',
                    color: log.parsed.apiCall.status >= 400
                      ? 'var(--mocha-error)'
                      : 'var(--mocha-success)',
                  }}
                >
                  {log.parsed.apiCall.status}
                </span>
              )}
              {log.parsed.apiCall.timing && (
                <span style={{ color: 'var(--mocha-text-muted)' }}>
                  {' '}({log.parsed.apiCall.timing}ms)
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export const LogLine = memo(LogLineComponent)
