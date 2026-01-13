import { memo, useState, useCallback } from 'react'
import { X, Eye, EyeOff, FileText, Files, AlertTriangle } from 'lucide-react'
import type { ToolbarProps, ParsedFilter } from '../types'

/**
 * Filter chip component
 */
interface FilterChipProps {
  filter: ParsedFilter
  index: number
  onRemove: () => void
}

const FilterChip = memo(function FilterChip({
  filter,
  index,
  onRemove,
}: FilterChipProps) {
  const bgColor = filter.type === 'exclude'
    ? 'bg-red-100 text-red-700 border-red-200'
    : filter.type === 'regex'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${bgColor}`}
      data-testid={`filter-chip-${index}`}
    >
      <span className="max-w-32 truncate" title={filter.text}>
        {filter.text}
      </span>
      <button
        onClick={onRemove}
        className="hover:bg-black/10 rounded p-0.5 transition-colors"
        title="Remove filter"
        data-testid={`remove-filter-${index}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
})

/**
 * Parse a filter input string into a ParsedFilter object.
 * Duplicated from store.ts to avoid circular dependencies.
 */
function parseFilterInput(input: string): ParsedFilter | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Check for regex pattern: /pattern/
  if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
    const pattern = trimmed.slice(1, -1)
    try {
      new RegExp(pattern)
      return {
        type: 'regex',
        value: pattern,
        text: trimmed,
      }
    } catch {
      return {
        type: 'text',
        value: trimmed,
        text: trimmed,
      }
    }
  }

  // Check for exclude pattern: -text
  if (trimmed.startsWith('-') && trimmed.length > 1) {
    return {
      type: 'exclude',
      value: trimmed.slice(1),
      text: trimmed,
    }
  }

  // Plain text filter
  return {
    type: 'text',
    value: trimmed,
    text: trimmed,
  }
}

/**
 * Extended Toolbar props with additional display info
 */
interface ExtendedToolbarProps extends ToolbarProps {
  truncated?: boolean
  visibleCount?: number
  isWatching?: boolean
}

/**
 * Toolbar component for log filtering and file controls
 *
 * Features:
 * - File info display (file count, line count, truncation)
 * - Active filter chips (removable)
 * - Filter input (supports /regex/, -exclude, text)
 * - Watch/polling toggle
 */
export const Toolbar = memo(function Toolbar({
  filters,
  filterInput,
  activeFileCount,
  totalLines,
  onAddFilter,
  onRemoveFilter,
  onFilterInputChange,
  onToggleWatch,
  truncated = false,
  visibleCount,
  isWatching = false,
}: ExtendedToolbarProps) {
  const [localInput, setLocalInput] = useState(filterInput)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalInput(value)
    onFilterInputChange(value)
  }, [onFilterInputChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localInput.trim()) {
      const filter = parseFilterInput(localInput)
      if (filter) {
        onAddFilter(filter)
        setLocalInput('')
        onFilterInputChange('')
      }
    }
  }, [localInput, onAddFilter, onFilterInputChange])

  return (
    <div
      className="h-12 bg-white border-b border-gray-200 flex items-center gap-4 px-4"
      data-testid="toolbar"
    >
      {/* File info section */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {activeFileCount > 1 ? (
          <Files className="w-4 h-4 text-gray-400" />
        ) : (
          <FileText className="w-4 h-4 text-gray-400" />
        )}
        {activeFileCount > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="font-medium text-sm text-gray-800"
              data-testid="file-info"
            >
              {activeFileCount} {activeFileCount === 1 ? 'file' : 'files'}
            </span>
            {totalLines > 0 && (
              <span
                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                data-testid="line-count"
              >
                {visibleCount !== undefined && visibleCount !== totalLines
                  ? `${visibleCount.toLocaleString()}/${totalLines.toLocaleString()}`
                  : totalLines.toLocaleString()
                } lines
              </span>
            )}
            {truncated && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
                title="File truncated to last 2000 lines"
                data-testid="truncated-badge"
              >
                <AlertTriangle className="w-3 h-3" />
                truncated
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400" data-testid="no-file">
            No file open
          </span>
        )}
      </div>

      {/* Divider */}
      {filters.length > 0 && (
        <div className="h-6 w-px bg-gray-200" />
      )}

      {/* Active filters section */}
      {filters.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="active-filters">
          {filters.map((filter, index) => (
            <FilterChip
              key={`${filter.type}-${filter.text}-${index}`}
              filter={filter}
              index={index}
              onRemove={() => onRemoveFilter(index)}
            />
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Filter input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={localInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Filter..."
          className="w-48 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          title="Press Enter to add filter. Use /regex/ or -exclude"
          data-testid="filter-input"
        />
      </div>

      {/* Watch toggle */}
      <button
        onClick={onToggleWatch}
        className={`p-2 rounded transition-colors ${
          isWatching
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title={isWatching ? 'Disable auto-refresh' : 'Enable auto-refresh'}
        data-testid="watch-toggle"
      >
        {isWatching ? (
          <Eye className="w-5 h-5" />
        ) : (
          <EyeOff className="w-5 h-5" />
        )}
      </button>
    </div>
  )
})

export type { ToolbarProps }
