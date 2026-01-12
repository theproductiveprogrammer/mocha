import { memo } from 'react'
import { FolderOpen, FileText, Clock, Trash2 } from 'lucide-react'
import type { SidebarProps, RecentFile } from '../types'

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
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 min ago' : `${minutes} mins ago`
  }
  return 'Just now'
}

/**
 * Recent file item component
 */
interface RecentFileItemProps {
  file: RecentFile
  isActive: boolean
  onClick: () => void
}

const RecentFileItem = memo(function RecentFileItem({
  file,
  isActive,
  onClick,
}: RecentFileItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded transition-colors flex items-start gap-2 ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'hover:bg-gray-100 text-gray-700'
      }`}
      data-testid={`recent-file-${file.name}`}
    >
      <FileText className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
      <div className="min-w-0 flex-1">
        <div className={`font-medium text-sm truncate ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
          {file.name}
        </div>
        <div className={`text-xs flex items-center gap-1 ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>
          <Clock className="w-3 h-3" />
          {formatRelativeTime(file.lastOpened)}
        </div>
      </div>
    </button>
  )
})

/**
 * Sidebar component for file navigation
 *
 * Features:
 * - "Open File..." button to trigger file input
 * - Recent files list with relative timestamps
 * - Active indicator for current file
 * - Clear button to remove recent files
 */
export const Sidebar = memo(function Sidebar({
  recentFiles,
  currentFile,
  onSelectFile,
  onClearRecent,
}: SidebarProps) {
  return (
    <aside
      className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full"
      data-testid="sidebar"
    >
      {/* Header with Open File button */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => onSelectFile()}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          data-testid="open-file-button"
        >
          <FolderOpen className="w-4 h-4" />
          Open File...
        </button>
      </div>

      {/* Recent files section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Recent Files
          </h2>
          {recentFiles.length > 0 && (
            <button
              onClick={onClearRecent}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Clear recent files"
              data-testid="clear-recent-button"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable file list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" data-testid="recent-files-list">
          {recentFiles.length > 0 ? (
            <div className="space-y-1">
              {recentFiles.map((file) => (
                <RecentFileItem
                  key={file.path}
                  file={file}
                  isActive={currentFile?.path === file.path}
                  onClick={() => onSelectFile(file.path)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm" data-testid="empty-recent">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No recent files</p>
              <p className="text-xs mt-1">
                Open a file to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer with file count */}
      {recentFiles.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400 text-center">
          {recentFiles.length} recent {recentFiles.length === 1 ? 'file' : 'files'}
        </div>
      )}
    </aside>
  )
})

export type { SidebarProps }
