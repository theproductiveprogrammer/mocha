import { memo } from 'react'
import { FolderOpen, FileText, Clock, Trash2, Check, Coffee } from 'lucide-react'
import type { SidebarProps, RecentFile, OpenedFileWithLogs } from '../types'

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return days === 1 ? '1d ago' : `${days}d ago`
  }
  if (hours > 0) {
    return hours === 1 ? '1h ago' : `${hours}h ago`
  }
  if (minutes > 0) {
    return minutes === 1 ? '1m ago' : `${minutes}m ago`
  }
  return 'Just now'
}

/**
 * Recent file item component with multi-file toggle support
 */
interface RecentFileItemProps {
  file: RecentFile
  openedFile?: OpenedFileWithLogs
  onClick: () => void
  index: number
}

const RecentFileItem = memo(function RecentFileItem({
  file,
  openedFile,
  onClick,
  index,
}: RecentFileItemProps) {
  const isOpened = !!openedFile
  const isActive = openedFile?.isActive ?? false

  return (
    <button
      onClick={onClick}
      className="group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex items-start gap-3 animate-slide-in"
      style={{
        background: isActive
          ? 'var(--mocha-selection)'
          : isOpened
            ? 'var(--mocha-surface-raised)'
            : 'transparent',
        border: isActive
          ? '1px solid var(--mocha-selection-border)'
          : '1px solid transparent',
        animationDelay: `${index * 30}ms`,
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isOpened) {
          e.currentTarget.style.background = 'var(--mocha-surface-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !isOpened) {
          e.currentTarget.style.background = 'transparent'
        }
      }}
      data-testid={`recent-file-${file.name}`}
      title={isOpened
        ? (isActive ? 'Click to hide logs from this file' : 'Click to show logs from this file')
        : 'Click to open this file'
      }
    >
      {/* Toggle indicator / file icon */}
      <div
        className="w-5 h-5 mt-0.5 flex-shrink-0 rounded flex items-center justify-center transition-all"
        style={{
          background: isActive
            ? 'var(--mocha-accent)'
            : isOpened
              ? 'var(--mocha-surface-hover)'
              : 'transparent',
          border: isActive
            ? 'none'
            : isOpened
              ? '1px solid var(--mocha-border)'
              : 'none',
        }}
      >
        {isActive ? (
          <Check className="w-3 h-3" style={{ color: 'var(--mocha-bg)' }} />
        ) : isOpened ? (
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--mocha-text-muted)' }} />
        ) : (
          <FileText className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="font-medium text-sm truncate transition-colors"
          style={{
            color: isActive
              ? 'var(--mocha-accent)'
              : isOpened
                ? 'var(--mocha-text)'
                : 'var(--mocha-text-secondary)',
          }}
        >
          {file.name}
        </div>
        <div
          className="text-xs flex items-center gap-1.5 mt-0.5"
          style={{ color: 'var(--mocha-text-muted)' }}
        >
          {isOpened ? (
            <>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  background: isActive ? 'var(--mocha-accent-muted)' : 'var(--mocha-surface-hover)',
                  color: isActive ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
                }}
              >
                {(openedFile?.logs.length ?? 0).toLocaleString()} lines
              </span>
            </>
          ) : (
            <>
              <Clock className="w-3 h-3" />
              {formatRelativeTime(file.lastOpened)}
            </>
          )}
        </div>
      </div>
    </button>
  )
})

/**
 * Sidebar component for file navigation
 */
export const Sidebar = memo(function Sidebar({
  recentFiles,
  openedFiles,
  onSelectFile,
  onToggleFile,
  onClearRecent,
}: SidebarProps) {
  const activeCount = Array.from(openedFiles.values()).filter(f => f.isActive).length
  const openedCount = openedFiles.size

  return (
    <aside
      className="w-64 flex flex-col h-full"
      style={{
        background: 'var(--mocha-surface)',
        borderRight: '1px solid var(--mocha-border-subtle)',
      }}
      data-testid="sidebar"
    >
      {/* Header with branding */}
      <div
        className="p-4"
        style={{ borderBottom: '1px solid var(--mocha-border-subtle)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--mocha-accent) 0%, var(--mocha-accent-muted) 100%)',
            }}
          >
            <Coffee className="w-4 h-4" style={{ color: 'var(--mocha-bg)' }} />
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: 'var(--mocha-text)',
            }}
          >
            Mocha
          </span>
        </div>

        {/* Open File button */}
        <button
          onClick={() => onSelectFile()}
          className="w-full px-4 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface-hover) 100%)',
            border: '1px solid var(--mocha-border)',
            color: 'var(--mocha-text)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--mocha-accent)'
            e.currentTarget.style.color = 'var(--mocha-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--mocha-border)'
            e.currentTarget.style.color = 'var(--mocha-text)'
          }}
          data-testid="open-file-button"
        >
          <FolderOpen className="w-4 h-4" />
          Open File...
        </button>
      </div>

      {/* Recent files section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            Recent Files
          </h2>
          {recentFiles.length > 0 && (
            <button
              onClick={onClearRecent}
              className="p-1.5 rounded-md transition-all"
              style={{ color: 'var(--mocha-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--mocha-error-bg)'
                e.currentTarget.style.color = 'var(--mocha-error)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--mocha-text-muted)'
              }}
              title="Clear recent files"
              data-testid="clear-recent-button"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable file list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" data-testid="recent-files-list">
          {recentFiles.length > 0 ? (
            <div className="space-y-1">
              {recentFiles.map((file, index) => {
                const openedFile = openedFiles.get(file.path)
                return (
                  <RecentFileItem
                    key={file.path}
                    file={file}
                    openedFile={openedFile}
                    index={index}
                    onClick={() => {
                      if (openedFile) {
                        onToggleFile(file.path)
                      } else {
                        onSelectFile(file.path)
                      }
                    }}
                  />
                )
              })}
            </div>
          ) : (
            <div
              className="text-center py-12 animate-fade-in"
              data-testid="empty-recent"
            >
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--mocha-surface-raised)',
                  border: '1px solid var(--mocha-border-subtle)',
                }}
              >
                <FileText
                  className="w-7 h-7"
                  style={{ color: 'var(--mocha-text-muted)' }}
                />
              </div>
              <p
                className="text-sm font-medium mb-1"
                style={{ color: 'var(--mocha-text-secondary)' }}
              >
                No recent files
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--mocha-text-muted)' }}
              >
                Open a file to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer with file count */}
      <div
        className="px-4 py-3 text-center"
        style={{ borderTop: '1px solid var(--mocha-border-subtle)' }}
      >
        {openedCount > 0 ? (
          <div className="flex items-center justify-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: 'var(--mocha-selection)',
                color: 'var(--mocha-accent)',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--mocha-accent)' }}
              />
              {activeCount} of {openedCount} active
            </div>
          </div>
        ) : recentFiles.length > 0 ? (
          <span
            className="text-xs"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            {recentFiles.length} recent {recentFiles.length === 1 ? 'file' : 'files'}
          </span>
        ) : null}
      </div>
    </aside>
  )
})

export type { SidebarProps }
