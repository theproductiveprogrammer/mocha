import { memo, useCallback, useState } from 'react'
import { FolderOpen, FileText, Clock, Trash2, Check, X, Radio, ChevronRight } from 'lucide-react'
import type { SidebarProps, RecentFile, OpenedFileWithLogs } from '../types'

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return days === 1 ? '1d ago' : `${days}d ago`
  if (hours > 0) return hours === 1 ? '1h ago' : `${hours}h ago`
  if (minutes > 0) return minutes === 1 ? '1m ago' : `${minutes}m ago`
  return 'Just now'
}

/**
 * Recent file item component
 */
interface RecentFileItemProps {
  file: RecentFile
  openedFile?: OpenedFileWithLogs
  onClick: () => void
  onRemove: () => void
  index: number
}

const RecentFileItem = memo(function RecentFileItem({
  file,
  openedFile,
  onClick,
  onRemove,
  index,
}: RecentFileItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isOpened = !!openedFile
  const isActive = openedFile?.isActive ?? false

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }, [onRemove])

  return (
    <div
      className="group relative animate-slide-in"
      style={{ animationDelay: `${index * 40}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-3"
        style={{
          background: isActive
            ? 'var(--mocha-selection)'
            : isOpened
              ? 'var(--mocha-surface-raised)'
              : isHovered
                ? 'var(--mocha-surface-hover)'
                : 'transparent',
          border: isActive
            ? '1px solid var(--mocha-selection-border)'
            : '1px solid transparent',
        }}
        data-testid={`recent-file-${file.name}`}
        title={isOpened
          ? (isActive ? 'Click to hide logs from this file' : 'Click to show logs from this file')
          : 'Click to open this file'
        }
      >
        {/* Status indicator */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            background: isActive
              ? 'var(--mocha-info)'
              : isOpened
                ? 'var(--mocha-surface-active)'
                : 'var(--mocha-surface-raised)',
            boxShadow: isActive
              ? '0 0 12px var(--mocha-selection-glow)'
              : 'none',
          }}
        >
          {isActive ? (
            <Check className="w-4 h-4" style={{ color: 'var(--mocha-bg)' }} />
          ) : isOpened ? (
            <Radio className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
          ) : (
            <FileText className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
          )}
        </div>

        {/* File info */}
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-sm truncate transition-colors duration-200"
            style={{
              color: isActive
                ? 'var(--mocha-info)'
                : isOpened
                  ? 'var(--mocha-text)'
                  : 'var(--mocha-text-secondary)',
            }}
          >
            {file.name}
          </div>
          <div
            className="text-xs flex items-center gap-2 mt-0.5"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            {isOpened ? (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums"
                style={{
                  background: isActive ? 'var(--mocha-info-muted)' : 'var(--mocha-surface-hover)',
                  color: isActive ? 'var(--mocha-info)' : 'var(--mocha-text-muted)',
                }}
              >
                {(openedFile?.logs.length ?? 0).toLocaleString()} lines
              </span>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                <span>{formatRelativeTime(file.lastOpened)}</span>
              </>
            )}
          </div>
        </div>

        {/* Chevron indicator */}
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-all duration-200 ${
            isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
          }`}
          style={{ color: 'var(--mocha-text-muted)' }}
        />
      </button>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        className={`
          absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md
          transition-all duration-200
          ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
        `}
        style={{
          background: 'var(--mocha-surface-active)',
          color: 'var(--mocha-text-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--mocha-error-bg)'
          e.currentTarget.style.color = 'var(--mocha-error)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--mocha-surface-active)'
          e.currentTarget.style.color = 'var(--mocha-text-muted)'
        }}
        title="Remove from list"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
})

/**
 * Sidebar component - refined control panel
 */
export const Sidebar = memo(function Sidebar({
  recentFiles,
  openedFiles,
  onSelectFile,
  onToggleFile,
  onRemoveFile,
  onClearRecent,
}: SidebarProps) {
  const activeCount = Array.from(openedFiles.values()).filter(f => f.isActive).length
  const openedCount = openedFiles.size

  return (
    <aside
      className="w-64 flex flex-col h-full relative"
      style={{
        background: 'var(--mocha-surface)',
        borderRight: '1px solid var(--mocha-border)',
      }}
      data-testid="sidebar"
    >
      {/* Subtle gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.2) 100%)',
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 p-5"
        style={{ borderBottom: '1px solid var(--mocha-border-subtle)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)',
              boxShadow: '0 4px 16px var(--mocha-accent-glow)',
            }}
          >
            {/* Coffee cup icon made with divs for uniqueness */}
            <div className="relative">
              <div
                className="w-4 h-5 rounded-b-lg"
                style={{ background: 'var(--mocha-bg)', opacity: 0.9 }}
              />
              <div
                className="absolute -right-1.5 top-1 w-1.5 h-3 rounded-r-full"
                style={{ background: 'var(--mocha-bg)', opacity: 0.9 }}
              />
            </div>
          </div>
          <div>
            <h1
              className="text-lg font-semibold tracking-tight font-display"
              style={{ color: 'var(--mocha-text)' }}
            >
              Mocha
            </h1>
            <p
              className="text-[10px] uppercase tracking-widest font-medium"
              style={{ color: 'var(--mocha-text-muted)' }}
            >
              Log Viewer
            </p>
          </div>
        </div>

        {/* Open File button */}
        <button
          onClick={() => onSelectFile()}
          className="w-full px-4 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface-hover) 100%)',
            border: '1px solid var(--mocha-border)',
            color: 'var(--mocha-text)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--mocha-accent)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3), 0 0 20px var(--mocha-accent-glow)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--mocha-border)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
          }}
          data-testid="open-file-button"
        >
          <FolderOpen className="w-4 h-4" />
          Open Log File
        </button>
      </div>

      {/* Recent files section */}
      <div className="relative z-10 flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-4 flex items-center justify-between">
          <h2
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            Recent Files
          </h2>
          {recentFiles.length > 0 && (
            <button
              onClick={onClearRecent}
              className="p-1.5 rounded-md transition-all duration-200"
              style={{ color: 'var(--mocha-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--mocha-error-bg)'
                e.currentTarget.style.color = 'var(--mocha-error)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--mocha-text-muted)'
              }}
              title="Clear all recent files"
              data-testid="clear-recent-button"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable file list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4" data-testid="recent-files-list">
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
                    onRemove={() => onRemoveFile(file.path)}
                  />
                )
              })}
            </div>
          ) : (
            <div
              className="text-center py-16 animate-fade-in"
              data-testid="empty-recent"
            >
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--mocha-surface-raised)',
                  border: '1px solid var(--mocha-border)',
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
                Open or drop a log file
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer - status bar */}
      <div
        className="relative z-10 px-5 py-3"
        style={{
          borderTop: '1px solid var(--mocha-border-subtle)',
          background: 'var(--mocha-bg-elevated)',
        }}
      >
        {openedCount > 0 ? (
          <div className="flex items-center justify-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'var(--mocha-selection)',
                border: '1px solid var(--mocha-selection-border)',
                color: 'var(--mocha-info)',
              }}
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: 'var(--mocha-info)' }}
              />
              {activeCount} of {openedCount} active
            </div>
          </div>
        ) : recentFiles.length > 0 ? (
          <p
            className="text-xs text-center"
            style={{ color: 'var(--mocha-text-muted)' }}
          >
            {recentFiles.length} recent {recentFiles.length === 1 ? 'file' : 'files'}
          </p>
        ) : (
          <p
            className="text-xs text-center"
            style={{ color: 'var(--mocha-text-faint)' }}
          >
            Ready to analyze
          </p>
        )}
      </div>
    </aside>
  )
})

export type { SidebarProps }
