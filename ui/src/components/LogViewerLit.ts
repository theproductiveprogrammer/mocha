/**
 * Lit-html based Log Viewer - Fast, direct DOM rendering
 * No virtual DOM, no reconciliation overhead
 */

import { html, render, nothing } from 'lit-html'
import { styleMap } from 'lit-html/directives/style-map.js'
import type { LogEntry } from '../types'

// Types for callbacks
type SelectCallback = (hash: string, event: MouseEvent) => void
type WrapCallback = (hash: string) => void

// State interface
interface LogViewerState {
  logs: LogEntry[]
  selectedHashes: Set<string>
  wrappedHashes: Set<string>
  onSelect: SelectCallback
  onToggleWrap: WrapCallback
}

// Level-based styling
const LEVEL_STYLES: Record<string, Record<string, string>> = {
  ERROR: { backgroundColor: 'rgb(254 242 242)', borderColor: 'rgb(254 202 202)' },
  WARN: { backgroundColor: 'rgb(255 251 235)', borderColor: 'rgb(253 230 138)' },
  INFO: { backgroundColor: 'white', borderColor: 'rgb(229 231 235)' },
  DEBUG: { backgroundColor: 'rgb(249 250 251)', borderColor: 'rgb(229 231 235)' },
  TRACE: { backgroundColor: 'rgb(249 250 251)', borderColor: 'rgb(243 244 246)' },
}

const LEVEL_TEXT_COLORS: Record<string, string> = {
  ERROR: 'rgb(185 28 28)',
  WARN: 'rgb(180 83 9)',
  INFO: 'rgb(31 41 55)',
  DEBUG: 'rgb(75 85 99)',
  TRACE: 'rgb(107 114 128)',
}

const LEVEL_BADGE_STYLES: Record<string, Record<string, string>> = {
  ERROR: { backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' },
  WARN: { backgroundColor: 'rgb(254 243 199)', color: 'rgb(180 83 9)' },
  INFO: { backgroundColor: 'rgb(219 234 254)', color: 'rgb(29 78 216)' },
  DEBUG: { backgroundColor: 'rgb(243 244 246)', color: 'rgb(75 85 99)' },
  TRACE: { backgroundColor: 'rgb(243 244 246)', color: 'rgb(107 114 128)' },
}

// Service colors
const SERVICE_COLORS: Record<string, { bg: string; text: string }> = {
  core: { bg: 'rgb(219 234 254)', text: 'rgb(29 78 216)' },
  app: { bg: 'rgb(243 232 255)', text: 'rgb(126 34 206)' },
  platform: { bg: 'rgb(220 252 231)', text: 'rgb(21 128 61)' },
  runner: { bg: 'rgb(243 244 246)', text: 'rgb(75 85 99)' },
  iwf: { bg: 'rgb(255 237 213)', text: 'rgb(194 65 12)' },
  rag: { bg: 'rgb(207 250 254)', text: 'rgb(14 116 144)' },
  transcriber: { bg: 'rgb(252 231 243)', text: 'rgb(190 24 93)' },
  tracker: { bg: 'rgb(254 249 195)', text: 'rgb(161 98 7)' },
  verify: { bg: 'rgb(224 231 255)', text: 'rgb(67 56 202)' },
  pixel: { bg: 'rgb(204 251 241)', text: 'rgb(15 118 110)' },
  default: { bg: 'rgb(243 244 246)', text: 'rgb(55 65 81)' },
}

function getServiceColor(name: string): { bg: string; text: string } {
  const lower = name.toLowerCase()
  if (SERVICE_COLORS[lower]) return SERVICE_COLORS[lower]
  for (const key of Object.keys(SERVICE_COLORS)) {
    if (lower.includes(key)) return SERVICE_COLORS[key]
  }
  return SERVICE_COLORS.default
}

function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    const parts = log.parsed.logger.split('.')
    return parts[parts.length - 1] || log.parsed.logger
  }
  return log.name
}

// Base styles
const baseRowStyle = {
  display: 'flex',
  alignItems: 'stretch',
  borderBottom: '1px solid rgb(243 244 246)',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.75rem',
  lineHeight: '1rem',
}

const gutterStyle = {
  width: '1.5rem',
  flexShrink: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRight: '1px solid rgb(229 231 235)',
}

const timestampStyle = {
  width: '5rem',
  flexShrink: '0',
  padding: '0.25rem 0.5rem',
  color: 'rgb(107 114 128)',
  borderRight: '1px solid rgb(229 231 235)',
  display: 'flex',
  alignItems: 'center',
}

const serviceColStyle = {
  width: '6rem',
  flexShrink: '0',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  borderRight: '1px solid rgb(229 231 235)',
}

const levelColStyle = {
  width: '3.5rem',
  flexShrink: '0',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
}

const contentStyle = {
  flex: '1',
  padding: '0.25rem 0.5rem',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const wrapBtnStyle = {
  width: '2rem',
  flexShrink: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// SVG icons as template literals
const checkIcon = html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(37 99 235)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`
const wrapIcon = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><path d="M3 12h15a3 3 0 1 1 0 6h-4"></path><polyline points="10 15 7 18 10 21"></polyline><line x1="3" y1="18" x2="7" y2="18"></line></svg>`

// Render a single log line
function renderLogLine(
  log: LogEntry,
  isSelected: boolean,
  isWrapped: boolean,
  onSelect: SelectCallback,
  onToggleWrap: WrapCallback
) {
  const level = log.parsed?.level || 'INFO'
  const levelStyle = LEVEL_STYLES[level] || LEVEL_STYLES.INFO
  const levelTextColor = LEVEL_TEXT_COLORS[level] || LEVEL_TEXT_COLORS.INFO
  const levelBadgeStyle = LEVEL_BADGE_STYLES[level] || LEVEL_BADGE_STYLES.INFO
  const serviceName = getServiceName(log)
  const serviceColor = getServiceColor(serviceName)

  // Format timestamp
  const displayTimestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null

  const rowStyle = {
    ...baseRowStyle,
    ...levelStyle,
    ...(isSelected
      ? { boxShadow: 'inset 0 0 0 2px rgb(96 165 250)', backgroundColor: 'rgb(239 246 255)' }
      : {}),
  }

  const handleClick = (e: MouseEvent) => {
    if (log.hash) onSelect(log.hash, e)
  }

  const handleWrapClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (log.hash) onToggleWrap(log.hash)
  }

  const handleContentClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (log.hash) onToggleWrap(log.hash)
  }

  return html`
    <div style=${styleMap(rowStyle)} @click=${handleClick} data-hash=${log.hash || ''}>
      <div style=${styleMap({
        ...gutterStyle,
        backgroundColor: isSelected ? 'rgb(219 234 254)' : 'rgb(249 250 251)',
        borderColor: isSelected ? 'rgb(191 219 254)' : 'rgb(229 231 235)',
      })}>
        ${isSelected ? checkIcon : nothing}
      </div>

      ${displayTimestamp ? html`
        <div style=${styleMap(timestampStyle)}>${displayTimestamp}</div>
      ` : nothing}

      <div style=${styleMap(serviceColStyle)}>
        <span style=${styleMap({
          padding: '0.125rem 0.375rem',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          backgroundColor: serviceColor.bg,
          color: serviceColor.text,
        })} title=${log.parsed?.logger || log.name}>${serviceName}</span>
      </div>

      ${log.parsed?.level ? html`
        <div style=${styleMap(levelColStyle)}>
          <span style=${styleMap({
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '600',
            ...levelBadgeStyle,
          })}>${log.parsed.level}</span>
        </div>
      ` : nothing}

      <div
        style=${styleMap({
          ...contentStyle,
          color: levelTextColor,
          whiteSpace: isWrapped ? 'pre-wrap' : 'nowrap',
          wordBreak: isWrapped ? 'break-word' : 'normal',
        })}
        @click=${handleContentClick}
      >
        ${log.parsed?.content || log.data}
      </div>

      <div style=${styleMap(wrapBtnStyle)}>
        <button
          @click=${handleWrapClick}
          style=${styleMap({
            padding: '0.25rem',
            borderRadius: '0.25rem',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: isWrapped ? 'rgb(59 130 246)' : 'rgb(156 163 175)',
          })}
        >
          ${wrapIcon}
        </button>
      </div>
    </div>
  `
}

// Empty state template
const emptyState = (hasLogs: boolean) => html`
  <div style=${styleMap({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'rgb(107 114 128)',
  })}>
    <div style="text-align: center">
      <p style="font-size: 1.125rem; font-weight: 500; margin-bottom: 0.5rem">
        ${hasLogs ? 'No logs match filters' : 'No logs loaded'}
      </p>
      <p style="font-size: 0.875rem">
        ${hasLogs ? 'Try adjusting your filters' : 'Upload a log file to get started'}
      </p>
    </div>
  </div>
`

// Main render function
export function renderLogViewer(container: HTMLElement, state: LogViewerState) {
  const { logs, selectedHashes, wrappedHashes, onSelect, onToggleWrap } = state

  const template = logs.length === 0
    ? emptyState(false)
    : html`
        <div style="height: 100%; overflow: auto; background: white">
          ${logs.map(log => renderLogLine(
            log,
            log.hash ? selectedHashes.has(log.hash) : false,
            log.hash ? wrappedHashes.has(log.hash) : false,
            onSelect,
            onToggleWrap
          ))}
        </div>
      `

  render(template, container)
}

// Export types for React integration
export type { LogViewerState }
