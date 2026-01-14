import { memo, useCallback } from 'react'
import { Check } from 'lucide-react'
import type { LogEntry, LogToken, LogLevel } from '../types'
import { tokenizeContent } from '../parser'

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

function getRowStyle(effectiveLevel?: LogLevel): {
  bg: string
  text: string
  border: string
} {
  const errStyle = {
    bg: 'var(--mocha-error-bg)',
    text: 'var(--mocha-error)',
    border: 'var(--mocha-error-border)',
  }
  const warnStyle = {
    bg: 'var(--mocha-warning-bg)',
    text: 'var(--mocha-warning)',
    border: 'var(--mocha-warning-border)',
  }
  const normStyle = {
    bg: 'var(--mocha-bg)',
    text: 'var(--mocha-text)',
    border: 'var(--mocha-border-subtle)',
  }

  // Simple level-based styling - no fragile content pattern matching
  if (effectiveLevel === 'ERROR') return errStyle
  if (effectiveLevel === 'WARN') return warnStyle

  return normStyle
}

/**
 * Get short service name from log entry.
 * For structured logs, extracts the last part of the logger name.
 * For unstructured logs, returns the filename as-is to indicate parsing failed.
 */
export function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    let logger = log.parsed.logger
    // Strip [File.java:123] suffix if present
    logger = logger.replace(/\s*\[[^\]]+\.java:\d+\]$/, '')
    const withoutLineNum = logger.split(':')[0]
    const parts = withoutLineNum.split('.')
    return parts[parts.length - 1] || withoutLineNum
  }

  // For unstructured lines, use filename as-is
  // This clearly indicates we couldn't parse the line
  return log.name
}

/**
 * Create a smart abbreviation for long service names
 */
function getServiceAbbrev(name: string): string {
  if (name.length <= 12) return name

  const parts = name.split(/(?=[A-Z])/).filter(p => p.length > 0)
  const suffixes = ['Service', 'Controller', 'Helper', 'Logic', 'Scheduler', 'Manager', 'Handler', 'Processor']
  const cleanParts = parts.filter(p => !suffixes.includes(p))

  if (cleanParts.length === 0) {
    return name.slice(0, 10) + '…'
  }

  if (cleanParts.length === 1) {
    return cleanParts[0].slice(0, 12) + (cleanParts[0].length > 12 ? '…' : '')
  }

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
 * Render tokenized content
 */
function TokenizedContent({ tokens }: { tokens: LogToken[] }) {
  return (
    <>
      {tokens.map((token, i) => (
        <TokenSpan key={i} token={token} />
      ))}
    </>
  )
}

export interface LogLineProps {
  log: LogEntry
  isInStory: boolean
  isContinuation: boolean
  isLastInGroup: boolean
  onToggleStory: (hash: string) => void
}

function LogLineComponent({
  log,
  isInStory,
  isContinuation,
  isLastInGroup,
  onToggleStory,
}: LogLineProps) {
  const serviceName = getServiceName(log)
  const serviceAbbrev = getServiceAbbrev(serviceName)
  const serviceColor = getServiceColor(serviceName)

  // Tokenize content - this also strips [ERROR]/[WARN] prefix and returns detected level
  const content = log.parsed?.content || log.data
  const { tokens, detectedLevel } = tokenizeContent(content)

  // Use parsed level if available, otherwise use level detected from content prefix
  const effectiveLevel = log.parsed?.level || detectedLevel
  const rowStyle = getRowStyle(effectiveLevel)

  const handleClick = useCallback(() => {
    if (log.hash) {
      onToggleStory(log.hash)
    }
  }, [log.hash, onToggleStory])

  // Format timestamp for display
  const displayTimestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null

  return (
    <div
      onClick={handleClick}
      className="flex group transition-colors cursor-pointer"
      style={{
        background: isInStory ? 'var(--mocha-selection)' : rowStyle.bg,
        borderBottom: isLastInGroup ? `1px solid ${rowStyle.border}` : 'none',
      }}
      data-testid="log-line"
      data-hash={log.hash}
      data-in-story={isInStory}
    >
      {/* Story indicator */}
      <div
        className="w-1 shrink-0 transition-all"
        style={{
          background: isInStory ? 'var(--mocha-accent)' : 'transparent',
        }}
      />

      {/* Left column: timestamp + service badge */}
      <div
        className={`w-28 shrink-0 px-2 flex flex-col justify-center items-start gap-0.5 ${
          isContinuation ? 'py-0.5' : 'py-1.5'
        }`}
        style={{
          borderRight: '1px solid var(--mocha-border-subtle)',
        }}
      >
        {!isContinuation && (
          <>
            {displayTimestamp && (
              <span
                className="text-[10px] font-mono tabular-nums"
                style={{ color: 'var(--mocha-text-muted)' }}
              >
                {displayTimestamp}
              </span>
            )}
            <span
              className="text-[9px] px-1 py-0.5 rounded font-medium truncate max-w-full"
              style={{
                background: `color-mix(in srgb, ${serviceColor} 15%, transparent)`,
                color: serviceColor,
              }}
              title={serviceName}
            >
              {serviceAbbrev}
            </span>
          </>
        )}
      </div>

      {/* Right column: tokenized log content */}
      <div
        className={`flex-1 px-3 font-mono text-[12px] leading-relaxed flex items-center ${
          isContinuation ? 'py-0.5' : 'py-1.5'
        }`}
        style={{ color: rowStyle.text }}
      >
        <div className="flex-1 truncate">
          <TokenizedContent tokens={tokens} />
        </div>

        {/* Story indicator icon */}
        {isInStory && (
          <Check
            className="w-3.5 h-3.5 shrink-0 ml-2"
            style={{ color: 'var(--mocha-accent)' }}
          />
        )}
      </div>
    </div>
  )
}

export const LogLine = memo(LogLineComponent)
