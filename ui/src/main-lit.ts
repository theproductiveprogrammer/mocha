/**
 * Pure lit-html + Zustand app - NO REACT
 */

import { html, render } from 'lit-html'
import { styleMap } from 'lit-html/directives/style-map.js'
import './index.css'
import { isTauri, readFile, getRecentFiles, addRecentFile } from './api'
import { parseLogFile } from './parser'
import { useLogViewerStore, useSelectionStore, useFileStore, filterLogs } from './store'
import type { LogEntry, RecentFile, OpenedFile } from './types'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'

// ============================================================================
// State
// ============================================================================

let logs: LogEntry[] = []
let serviceNames: string[] = []
let totalLines = 0

// ============================================================================
// Styles
// ============================================================================

const styles = {
  app: { display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', fontSize: '14px' },
  sidebar: { width: '200px', background: '#f5f5f5', borderRight: '1px solid #ddd', padding: '12px', overflowY: 'auto' as const },
  main: { flex: '1', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  toolbar: { padding: '8px 12px', background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const },
  logContainer: { flex: '1', overflow: 'auto', background: '#fff' },
  btn: { padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  btnSecondary: { padding: '4px 8px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  recentFile: { padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', marginBottom: '4px', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logRow: { display: 'flex', borderBottom: '1px solid #f0f0f0', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' },
  badge: { padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '500' },
  emptyState: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' },
  filterChip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#e0e7ff', color: '#3730a3', borderRadius: '12px', fontSize: '12px' },
}

// Level colors
const levelColors: Record<string, { bg: string; text: string }> = {
  ERROR: { bg: '#fee2e2', text: '#b91c1c' },
  WARN: { bg: '#fef3c7', text: '#b45309' },
  INFO: { bg: '#dbeafe', text: '#1d4ed8' },
  DEBUG: { bg: '#f3f4f6', text: '#4b5563' },
  TRACE: { bg: '#f3f4f6', text: '#6b7280' },
}

// ============================================================================
// Helpers
// ============================================================================

function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    const parts = log.parsed.logger.split('.')
    return parts[parts.length - 1] || log.parsed.logger
  }
  return log.name
}

// ============================================================================
// Components
// ============================================================================

function renderSidebar(recentFiles: RecentFile[], currentFile: OpenedFile | null, onSelect: (path: string) => void, onOpen: () => void) {
  return html`
    <div style=${styleMap(styles.sidebar)}>
      <button style=${styleMap(styles.btn)} @click=${onOpen}>Open File</button>

      <div style="margin-top: 16px; font-weight: 600; font-size: 12px; color: #666">Recent Files</div>
      <div style="margin-top: 8px">
        ${recentFiles.length === 0
          ? html`<div style="font-size: 12px; color: #999">No recent files</div>`
          : recentFiles.map(f => html`
              <div
                style=${styleMap({
                  ...styles.recentFile,
                  background: currentFile?.path === f.path ? '#dbeafe' : 'transparent',
                })}
                @click=${() => onSelect(f.path)}
                title=${f.path}
              >${f.name}</div>
            `)
        }
      </div>
    </div>
  `
}

function renderToolbar(
  serviceNames: string[],
  inactiveNames: Set<string>,
  filters: any[],
  totalLines: number,
  visibleCount: number,
  onToggleService: (name: string) => void,
  onRemoveFilter: (index: number) => void,
) {
  return html`
    <div style=${styleMap(styles.toolbar)}>
      <span style="font-size: 12px; color: #666">${visibleCount} / ${totalLines} lines</span>

      <div style="display: flex; gap: 4px; flex-wrap: wrap">
        ${serviceNames.map(name => html`
          <button
            style=${styleMap({
              ...styles.btnSecondary,
              opacity: inactiveNames.has(name) ? '0.5' : '1',
            })}
            @click=${() => onToggleService(name)}
          >${name}</button>
        `)}
      </div>

      ${filters.map((f, i) => html`
        <span style=${styleMap(styles.filterChip)}>
          ${f.text}
          <span style="cursor: pointer; margin-left: 4px" @click=${() => onRemoveFilter(i)}>×</span>
        </span>
      `)}
    </div>
  `
}

function renderLogLine(
  log: LogEntry,
  isSelected: boolean,
  isWrapped: boolean,
  onSelect: (hash: string) => void,
  onToggleWrap: (hash: string) => void,
) {
  const level = log.parsed?.level || 'INFO'
  const colors = levelColors[level] || levelColors.INFO
  const serviceName = getServiceName(log)

  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(' ')
      ? log.parsed.timestamp.split(' ')[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : ''

  return html`
    <div
      style=${styleMap({
        ...styles.logRow,
        background: isSelected ? '#eff6ff' : 'transparent',
        boxShadow: isSelected ? 'inset 0 0 0 2px #60a5fa' : 'none',
      })}
      @click=${() => log.hash && onSelect(log.hash)}
    >
      <div style="width: 24px; display: flex; align-items: center; justify-content: center; background: ${isSelected ? '#dbeafe' : '#f9fafb'}">
        ${isSelected ? html`<span style="color: #2563eb">✓</span>` : ''}
      </div>
      ${timestamp ? html`<div style="width: 70px; padding: 4px; color: #666; border-right: 1px solid #eee">${timestamp}</div>` : ''}
      <div style="width: 80px; padding: 4px">
        <span style=${styleMap({ ...styles.badge, background: '#e0e7ff', color: '#4338ca' })}>${serviceName}</span>
      </div>
      ${log.parsed?.level ? html`
        <div style="width: 50px; padding: 4px">
          <span style=${styleMap({ ...styles.badge, background: colors.bg, color: colors.text })}>${level}</span>
        </div>
      ` : ''}
      <div
        style="flex: 1; padding: 4px 8px; overflow: hidden; ${isWrapped ? '' : 'white-space: nowrap; text-overflow: ellipsis;'}"
        @click=${(e: Event) => { e.stopPropagation(); log.hash && onToggleWrap(log.hash) }}
      >
        ${log.parsed?.content || log.data}
      </div>
    </div>
  `
}

function renderLogs(
  logs: LogEntry[],
  selectedHashes: Set<string>,
  wrappedHashes: Set<string>,
  onSelect: (hash: string) => void,
  onToggleWrap: (hash: string) => void,
) {
  if (logs.length === 0) {
    return html`<div style=${styleMap(styles.emptyState)}>No logs to display</div>`
  }

  return html`
    <div style=${styleMap(styles.logContainer)}>
      ${logs.map(log => renderLogLine(
        log,
        log.hash ? selectedHashes.has(log.hash) : false,
        log.hash ? wrappedHashes.has(log.hash) : false,
        onSelect,
        onToggleWrap,
      ))}
    </div>
  `
}

function renderEmptyState(onOpen: () => void) {
  return html`
    <div style=${styleMap(styles.emptyState)}>
      <div style="text-align: center">
        <div style="font-size: 48px; opacity: 0.3; margin-bottom: 16px">📄</div>
        <h2 style="margin: 0 0 8px; font-size: 18px">No log file open</h2>
        <p style="margin: 0 0 16px; font-size: 14px; color: #888">Click "Open File" or drag and drop a file</p>
        <button style=${styleMap(styles.btn)} @click=${onOpen}>Open File</button>
      </div>
    </div>
  `
}

// ============================================================================
// Main render
// ============================================================================

function renderApp() {
  const logViewerStore = useLogViewerStore.getState()
  const selectionStore = useSelectionStore.getState()
  const fileStore = useFileStore.getState()

  const { inactiveNames, filters } = logViewerStore
  const { selectedHashes, wrappedHashes, toggleSelection, toggleWrap } = selectionStore
  const { currentFile, recentFiles } = fileStore

  // Filter logs
  const safeInactive = inactiveNames instanceof Set ? inactiveNames : new Set<string>()
  const safeDeleted = selectionStore.deletedHashes instanceof Set ? selectionStore.deletedHashes : new Set<string>()
  const safeSelected = selectedHashes instanceof Set ? selectedHashes : new Set<string>()
  const safeWrapped = wrappedHashes instanceof Set ? wrappedHashes : new Set<string>()

  const filtered = filterLogs(logs, filters, safeInactive, safeDeleted)
  const reversed = [...filtered].reverse()
  const visibleCount = reversed.length

  const template = html`
    <div style=${styleMap(styles.app)}>
      ${renderSidebar(recentFiles, currentFile, openFile, () => openFile())}

      <div style=${styleMap(styles.main)}>
        ${logs.length > 0 ? renderToolbar(
          serviceNames,
          safeInactive,
          filters,
          totalLines,
          visibleCount,
          (name) => { logViewerStore.toggleName(serviceNames, name); renderApp() },
          (index) => { logViewerStore.removeFilter(index); renderApp() },
        ) : ''}

        ${logs.length > 0
          ? renderLogs(reversed, safeSelected, safeWrapped,
              (hash) => { toggleSelection(hash); renderApp() },
              (hash) => { toggleWrap(hash); renderApp() })
          : renderEmptyState(() => openFile())
        }
      </div>
    </div>
  `

  render(template, document.getElementById('root')!)
}

// ============================================================================
// File handling
// ============================================================================

async function openFile(path?: string) {
  if (!path) {
    if (isTauri()) {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
      })
      if (selected) {
        openFile(selected)
      }
    }
    return
  }

  console.time('openFile')

  const result = await readFile(path, 0)
  if (!result.success || !result.content) {
    console.error('Failed to read file')
    return
  }

  console.time('parse')
  const parsed = parseLogFile(result.content, result.name || path.split('/').pop() || 'file')
  console.timeEnd('parse')

  logs = parsed.logs
  totalLines = parsed.totalLines
  serviceNames = Array.from(new Set(logs.map(getServiceName))).sort()

  console.time('render')
  renderApp()
  console.timeEnd('render')

  console.timeEnd('openFile')

  // Update stores in background
  setTimeout(() => {
    useFileStore.getState().setCurrentFile({
      path: result.path || path,
      name: result.name || path.split('/').pop() || 'file',
      size: result.size || 0,
    })
    addRecentFile(path)
    useFileStore.getState().setRecentFiles([
      { path, name: result.name || path.split('/').pop() || 'file', lastOpened: Date.now() },
      ...useFileStore.getState().recentFiles.filter(f => f.path !== path).slice(0, 19),
    ])
  }, 0)
}

// ============================================================================
// Init
// ============================================================================

async function init() {
  // Load recent files
  if (isTauri()) {
    const recent = await getRecentFiles()
    useFileStore.getState().setRecentFiles(recent)
  }

  // Initial render
  renderApp()

  // Subscribe to store changes for re-render
  useFileStore.subscribe(() => renderApp())
}

init()
