import { memo, useCallback } from 'react'
import { Check } from 'lucide-react'
import type { LogEntry, LogToken } from '../types'
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

function getRowStyle(log: LogEntry): {
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

  if (log.parsed?.level === 'ERROR') return errStyle
  if (log.parsed?.level === 'WARN') return warnStyle
  if (/[.][A-Za-z0-9]*Exception/.test(log.data)) return errStyle

  return normStyle
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
function TokenizedContent({ content }: { content: string }) {
  const tokens = tokenizeContent(content)

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
  const rowStyle = getRowStyle(log)

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

  const content = log.parsed?.content || log.data

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
          <TokenizedContent content={content} />
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
