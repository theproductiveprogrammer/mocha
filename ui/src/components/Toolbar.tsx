import { memo, useState, useRef, useEffect } from 'react'
import { X, FileText, Files, AlertTriangle, Search, Hash, MinusCircle, ChevronUp, ChevronDown, Command, CircleAlert, TriangleAlert, PanelRight, PanelRightClose } from 'lucide-react'
import type { ToolbarProps, ParsedFilter } from '../types'

/**
 * Filter chip with refined styling
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
          bg: 'rgba(155, 143, 209, 0.12)',
          border: 'rgba(155, 143, 209, 0.25)',
          text: 'var(--badge-verify)',
          icon: Hash,
        }
      default:
        return {
          bg: 'var(--mocha-accent-muted)',
          border: 'rgba(232, 168, 84, 0.25)',
          text: 'var(--mocha-accent)',
          icon: Search,
        }
    }
  }

  const style = getChipStyle()
  const Icon = style.icon

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 animate-scale-in"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
      }}
      data-testid={`filter-chip-${index}`}
    >
      <Icon className="w-3 h-3 opacity-70" />
      <span className="max-w-32 truncate font-mono" title={filter.text}>
        {filter.text}
      </span>
      <button
        onClick={onRemove}
        className="p-0.5 rounded transition-all duration-150 hover:bg-[rgba(255,255,255,0.1)]"
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
 * Extended Toolbar props
 */
interface ExtendedToolbarProps extends ToolbarProps {
  truncated?: boolean
  searchQuery?: string
  searchIsRegex?: boolean
  searchMatchCount?: number
  searchCurrentIndex?: number
  onSearchChange?: (query: string) => void
  onSearchRegexToggle?: () => void
  onSearchNext?: () => void
  onSearchPrev?: () => void
  // Error/warning navigation
  errorCount?: number
  warningCount?: number
  currentErrorIndex?: number
  currentWarningIndex?: number
  onJumpToNextError?: () => void
  onJumpToPrevError?: () => void
  onJumpToNextWarning?: () => void
  onJumpToPrevWarning?: () => void
  // Logbook panel
  logbookCollapsed?: boolean
  onToggleLogbook?: () => void
}

/**
 * Toolbar component - refined command bar
 */
export const Toolbar = memo(function Toolbar({
  filters,
  activeFileCount,
  onRemoveFilter,
  truncated = false,
  searchQuery = '',
  searchIsRegex = false,
  searchMatchCount = 0,
  searchCurrentIndex = 0,
  onSearchChange,
  onSearchRegexToggle,
  onSearchNext,
  onSearchPrev,
  errorCount = 0,
  warningCount = 0,
  currentErrorIndex = -1,
  currentWarningIndex = -1,
  onJumpToNextError,
  onJumpToPrevError,
  onJumpToNextWarning,
  onJumpToPrevWarning,
  logbookCollapsed = true,
  onToggleLogbook,
}: ExtendedToolbarProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd/Ctrl+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className="h-14 flex items-center gap-4 px-5"
      style={{
        background: 'var(--mocha-surface)',
        borderBottom: '1px solid var(--mocha-border)',
      }}
      data-testid="toolbar"
    >
      {/* File info section */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
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
          <div className="flex items-center gap-2.5">
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--mocha-text)' }}
              data-testid="file-info"
            >
              {activeFileCount} {activeFileCount === 1 ? 'file' : 'files'}
            </span>
            {truncated && (
              <span
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
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

      {/* Active filters */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" data-testid="active-filters">
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

      {/* Search section */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div
          className="relative flex items-center transition-all duration-300"
          style={{
            width: isFocused || searchQuery ? '280px' : '200px',
          }}
        >
          <Search
            className="absolute left-3 w-4 h-4 pointer-events-none transition-colors duration-200"
            style={{
              color: isFocused ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? onSearchPrev?.() : onSearchNext?.()
              }
              if (e.key === 'Escape') {
                onSearchChange?.('')
                inputRef.current?.blur()
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search logs..."
            className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl font-mono"
            style={{
              background: isFocused ? 'var(--mocha-surface-raised)' : 'var(--mocha-surface-hover)',
              border: `1px solid ${isFocused ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
              color: 'var(--mocha-text)',
              boxShadow: isFocused
                ? '0 0 0 3px var(--mocha-accent-muted), 0 4px 16px rgba(0,0,0,0.2)'
                : 'none',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            title="Search logs (⌘F). Enter for next, Shift+Enter for previous"
            data-testid="search-input"
          />

          {/* Keyboard hint or clear button */}
          {searchQuery ? (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-3 p-1 rounded-md transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
              style={{ color: 'var(--mocha-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : !isFocused && (
            <div
              className="absolute right-3 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: 'var(--mocha-surface-active)',
                color: 'var(--mocha-text-muted)',
              }}
            >
              <Command className="w-2.5 h-2.5" />
              <span>F</span>
            </div>
          )}
        </div>

        {/* Regex toggle */}
        <button
          onClick={onSearchRegexToggle}
          className="px-3 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all duration-200"
          style={{
            background: searchIsRegex
              ? 'linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)'
              : 'var(--mocha-surface-hover)',
            border: `1px solid ${searchIsRegex ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
            color: searchIsRegex ? 'var(--mocha-bg)' : 'var(--mocha-text-muted)',
            boxShadow: searchIsRegex ? '0 2px 12px var(--mocha-accent-glow)' : 'none',
          }}
          title="Toggle regex search"
        >
          .*
        </button>

        {/* Match navigation */}
        {searchQuery && (
          <div
            className="flex items-center gap-1 animate-scale-in"
            style={{
              background: 'var(--mocha-surface-raised)',
              border: '1px solid var(--mocha-border)',
              borderRadius: '12px',
              padding: '4px',
            }}
          >
            <button
              onClick={onSearchPrev}
              className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-hover)]"
              style={{ color: searchMatchCount > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)' }}
              title="Previous match (Shift+Enter)"
              disabled={searchMatchCount === 0}
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            <span
              className="text-xs tabular-nums min-w-[3.5rem] text-center font-mono font-medium px-1"
              style={{
                color: searchMatchCount > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-error)',
              }}
            >
              {searchMatchCount > 0 ? `${searchCurrentIndex + 1}/${searchMatchCount}` : '0/0'}
            </span>

            <button
              onClick={onSearchNext}
              className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-hover)]"
              style={{ color: searchMatchCount > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)' }}
              title="Next match (Enter)"
              disabled={searchMatchCount === 0}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error/Warning Navigation */}
      {(errorCount > 0 || warningCount > 0) && (
        <>
          <div
            className="h-6 w-px ml-2"
            style={{ background: 'var(--mocha-border)' }}
          />

          <div className="flex items-center gap-2">
            {/* Error navigation */}
            {errorCount > 0 && (
              <div
                className="flex items-center gap-1"
                style={{
                  border: '1px solid var(--mocha-error-border)',
                  borderRadius: '12px',
                  padding: '4px 8px',
                }}
              >
                <CircleAlert className="w-4 h-4" style={{ color: 'var(--mocha-error)' }} />
                <span
                  className="text-xs tabular-nums font-mono font-medium px-1"
                  style={{ color: 'var(--mocha-error)' }}
                >
                  {currentErrorIndex >= 0 ? `${currentErrorIndex + 1}/` : ''}{errorCount}
                </span>
                <button
                  onClick={onJumpToPrevError}
                  className="p-1 rounded-md transition-all duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{ color: 'var(--mocha-error)' }}
                  title="Previous error"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onJumpToNextError}
                  className="p-1 rounded-md transition-all duration-150 hover:bg-[rgba(255,255,255,0.1)]"
                  style={{ color: 'var(--mocha-error)' }}
                  title="Next error"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Warning navigation */}
            {warningCount > 0 && (
              <div
                className="flex items-center gap-1"
                style={{
                  border: '1px solid var(--mocha-warning-border)',
                  borderRadius: '12px',
                  padding: '4px 8px',
                }}
              >
                <TriangleAlert className="w-4 h-4" style={{ color: 'var(--mocha-warning)' }} />
                <span
                  className="text-xs tabular-nums font-mono font-medium px-1"
                  style={{ color: 'var(--mocha-warning)' }}
                >
                  {currentWarningIndex >= 0 ? `${currentWarningIndex + 1}/` : ''}{warningCount}
                </span>
                <button
                  onClick={onJumpToPrevWarning}
                  className="p-1 rounded-md transition-all duration-150 hover:bg-[rgba(0,0,0,0.1)]"
                  style={{ color: 'var(--mocha-warning)' }}
                  title="Previous warning"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onJumpToNextWarning}
                  className="p-1 rounded-md transition-all duration-150 hover:bg-[rgba(0,0,0,0.1)]"
                  style={{ color: 'var(--mocha-warning)' }}
                  title="Next warning"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Logbook panel toggle */}
      {activeFileCount > 0 && (
        <button
          onClick={onToggleLogbook}
          className="ml-2 p-1.5 rounded-lg transition-colors hover:bg-[var(--mocha-surface-hover)]"
          style={{ color: 'var(--mocha-text-muted)' }}
          title={logbookCollapsed ? 'Show logbook panel' : 'Hide logbook panel'}
        >
          {logbookCollapsed ? (
            <PanelRight className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  )
})

export type { ToolbarProps }
