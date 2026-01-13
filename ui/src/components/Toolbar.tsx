import { memo, useState, useCallback } from 'react'
import { X, Eye, EyeOff, FileText, Files, AlertTriangle } from 'lucide-react'
import type { ToolbarProps, ParsedFilter } from '../types'

/**
 * Get service badge colors based on service name
 */
const SERVICE_COLORS: Record<string, { bg: string; text: string; activeBg: string }> = {
  core: { bg: 'bg-blue-100', text: 'text-blue-700', activeBg: 'bg-blue-500' },
  app: { bg: 'bg-purple-100', text: 'text-purple-700', activeBg: 'bg-purple-500' },
  platform: { bg: 'bg-green-100', text: 'text-green-700', activeBg: 'bg-green-500' },
  runner: { bg: 'bg-gray-100', text: 'text-gray-600', activeBg: 'bg-gray-500' },
  iwf: { bg: 'bg-orange-100', text: 'text-orange-700', activeBg: 'bg-orange-500' },
  rag: { bg: 'bg-cyan-100', text: 'text-cyan-700', activeBg: 'bg-cyan-500' },
  transcriber: { bg: 'bg-pink-100', text: 'text-pink-700', activeBg: 'bg-pink-500' },
  tracker: { bg: 'bg-yellow-100', text: 'text-yellow-700', activeBg: 'bg-yellow-500' },
  verify: { bg: 'bg-indigo-100', text: 'text-indigo-700', activeBg: 'bg-indigo-500' },
  pixel: { bg: 'bg-teal-100', text: 'text-teal-700', activeBg: 'bg-teal-500' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700', activeBg: 'bg-gray-500' },
}

function getServiceColors(serviceName: string): { bg: string; text: string; activeBg: string } {
  const lowerName = serviceName.toLowerCase()
  for (const key of Object.keys(SERVICE_COLORS)) {
    if (lowerName.includes(key)) {
      return SERVICE_COLORS[key]
    }
  }
  return SERVICE_COLORS.default
}

/**
 * Service badge component
 */
interface ServiceBadgeProps {
  name: string
  isActive: boolean
  onClick: () => void
}

const ServiceBadge = memo(function ServiceBadge({
  name,
  isActive,
  onClick,
}: ServiceBadgeProps) {
  const colors = getServiceColors(name)

  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
        isActive
          ? `${colors.bg} ${colors.text}`
          : 'bg-gray-200 text-gray-400 opacity-50'
      }`}
      title={isActive ? `Click to hide ${name}` : `Click to show ${name}`}
      data-testid={`service-badge-${name}`}
    >
      {name}
    </button>
  )
})

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
 * - Service badges (clickable to filter)
 * - Active filter chips (removable)
 * - Filter input (supports /regex/, -exclude, text)
 * - Watch/polling toggle
 */
export const Toolbar = memo(function Toolbar({
  serviceNames,
  inactiveNames,
  filters,
  filterInput,
  activeFileCount,
  totalLines,
  onToggleService,
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
      {serviceNames.length > 0 && (
        <div className="h-6 w-px bg-gray-200" />
      )}

      {/* Service badges section */}
      {serviceNames.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="service-badges">
          {serviceNames.map((name) => (
            <ServiceBadge
              key={name}
              name={name}
              isActive={!inactiveNames.has(name)}
              onClick={() => onToggleService(name)}
            />
          ))}
        </div>
      )}

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
