import { memo, useState, useCallback } from 'react'
import { X, Eye, EyeOff, FileText, Files, AlertTriangle, Search, Hash, MinusCircle } from 'lucide-react'
import type { ToolbarProps, ParsedFilter } from '../types'

/**
 * Filter chip component with refined styling
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
  // Style based on filter type
  const getChipStyle = () => {
    switch (filter.type) {
      case 'exclude':
        return {
          bg: 'var(--mocha-error-bg)',
          border: 'var(--mocha-error-border)',
          text: 'var(--mocha-error)',
          icon: MinusCircle,
        }
      case 'regex':
        return {
          bg: 'rgba(139, 143, 209, 0.15)',
          border: 'rgba(139, 143, 209, 0.3)',
          text: 'var(--badge-verify)',
          icon: Hash,
        }
      default:
        return {
          bg: 'var(--mocha-selection)',
          border: 'var(--mocha-selection-border)',
          text: 'var(--mocha-accent)',
          icon: Search,
        }
    }
  }

  const style = getChipStyle()
  const Icon = style.icon

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all animate-fade-in"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
      }}
      data-testid={`filter-chip-${index}`}
    >
      <Icon className="w-3 h-3 opacity-70" />
      <span className="max-w-32 truncate" title={filter.text}>
        {filter.text}
      </span>
      <button
        onClick={onRemove}
        className="p-0.5 rounded transition-all hover:opacity-70"
        style={{ color: style.text }}
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
 * Extended Toolbar props
 */
interface ExtendedToolbarProps extends ToolbarProps {
  truncated?: boolean
  visibleCount?: number
  isWatching?: boolean
}

/**
 * Toolbar component for log filtering and file controls
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
  const [isFocused, setIsFocused] = useState(false)

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
      className="h-14 flex items-center gap-4 px-4"
      style={{
        background: 'var(--mocha-surface)',
        borderBottom: '1px solid var(--mocha-border-subtle)',
      }}
      data-testid="toolbar"
    >
      {/* File info section */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: 'var(--mocha-surface-raised)',
            border: '1px solid var(--mocha-border)',
          }}
        >
          {activeFileCount > 1 ? (
            <Files className="w-4 h-4" style={{ color: 'var(--mocha-text-secondary)' }} />
          ) : (
            <FileText className="w-4 h-4" style={{ color: 'var(--mocha-text-secondary)' }} />
          )}
        </div>

        {activeFileCount > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--mocha-text)' }}
              data-testid="file-info"
            >
              {activeFileCount} {activeFileCount === 1 ? 'file' : 'files'}
            </span>
            {totalLines > 0 && (
              <span
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  background: 'var(--mocha-surface-raised)',
                  color: 'var(--mocha-text-secondary)',
                }}
                data-testid="line-count"
              >
                {visibleCount !== undefined && visibleCount !== totalLines
                  ? `${visibleCount.toLocaleString()} / ${totalLines.toLocaleString()}`
                  : totalLines.toLocaleString()
                }
              </span>
            )}
            {truncated && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  background: 'var(--mocha-warning-bg)',
                  border: '1px solid var(--mocha-warning-border)',
                  color: 'var(--mocha-warning)',
                }}
                title="File truncated to last 2000 lines"
                data-testid="truncated-badge"
              >
                <AlertTriangle className="w-3 h-3" />
                truncated
              </span>
            )}
          </div>
        ) : (
          <span
            className="text-sm"
            style={{ color: 'var(--mocha-text-muted)' }}
            data-testid="no-file"
          >
            No file open
          </span>
        )}
      </div>

      {/* Divider */}
      {filters.length > 0 && (
        <div
          className="h-6 w-px"
          style={{ background: 'var(--mocha-border)' }}
        />
      )}

      {/* Active filters section */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto" data-testid="active-filters">
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
        <div
          className="relative flex items-center transition-all"
          style={{
            width: isFocused ? '240px' : '180px',
          }}
        >
          <Search
            className="absolute left-3 w-4 h-4 pointer-events-none transition-colors"
            style={{
              color: isFocused ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
            }}
          />
          <input
            type="text"
            value={localInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Filter logs..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none"
            style={{
              background: 'var(--mocha-surface-raised)',
              border: `1px solid ${isFocused ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
              color: 'var(--mocha-text)',
              boxShadow: isFocused ? '0 0 0 3px rgba(196, 167, 125, 0.1)' : 'none',
            }}
            title="Press Enter to add filter. Use /regex/ or -exclude"
            data-testid="filter-input"
          />
        </div>
      </div>

      {/* Watch toggle */}
      <button
        onClick={onToggleWatch}
        className="p-2.5 rounded-lg transition-all"
        style={{
          background: isWatching ? 'var(--mocha-selection)' : 'transparent',
          border: `1px solid ${isWatching ? 'var(--mocha-selection-border)' : 'transparent'}`,
          color: isWatching ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
        }}
        onMouseEnter={(e) => {
          if (!isWatching) {
            e.currentTarget.style.background = 'var(--mocha-surface-hover)'
            e.currentTarget.style.color = 'var(--mocha-text-secondary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isWatching) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--mocha-text-muted)'
          }
        }}
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
