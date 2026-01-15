import { useState, useCallback, useRef, useEffect, memo, useMemo } from "react";
import {
  X,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  MoreHorizontal,
  FileText,
  Check,
  Pencil,
  BookOpen,
  Maximize2,
  Minimize2,
  Search,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Command,
} from "lucide-react";
import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { LogEntry, LogToken, Story } from "../types";
import { tokenizeContent } from "../parser";
import { getServiceName } from "./LogLine";

// Custom styles matching logbook paper aesthetic
const logbookJsonStyles = {
  container: 'jv-logbook-container',
  basicChildStyle: 'jv-logbook-child',
  label: 'jv-logbook-label',
  nullValue: 'jv-logbook-null',
  undefinedValue: 'jv-logbook-null',
  stringValue: 'jv-logbook-string',
  booleanValue: 'jv-logbook-boolean',
  numberValue: 'jv-logbook-number',
  otherValue: 'jv-logbook-other',
  punctuation: 'jv-logbook-punctuation',
  collapseIcon: 'jv-logbook-collapse-icon',
  expandIcon: 'jv-logbook-expand-icon',
  collapsedContent: 'jv-logbook-collapsed',
};

interface StoryPaneProps {
  stories: Story[];
  activeStoryId: string | null;
  storyLogs: LogEntry[];
  height: number;
  collapsed: boolean;
  maximized: boolean;
  onRemoveFromStory: (hash: string) => void;
  onClearStory: () => void;
  onHeightChange: (height: number) => void;
  onToggleCollapsed: () => void;
  onToggleMaximized: () => void;
  onCreateStory: (name?: string) => void;
  onDeleteStory: (id: string) => void;
  onRenameStory: (id: string, name: string) => void;
  onSetActiveStory: (id: string) => void;
  onJumpToSource?: (log: LogEntry) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Render a single token with appropriate styling
 */
function TokenSpan({ token }: { token: LogToken }) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
      case "marker.error":
        return { color: "#e85c5c", fontWeight: 600 };
      case "marker.warn":
        return { color: "#ffd93d", fontWeight: 600 };
      case "marker.info":
        return { color: "#8b8b8b" };
      case "url":
        return { color: "#4ecdc4" };
      case "data":
        return { color: "#e8a854", fontWeight: 500 };
      case "json":
        return { color: "#8b8b8b" };
      case "symbol":
        return { color: "#8b8b8b" };
      case "message":
      default:
        return {};
    }
  };

  return <span style={getTokenStyle()}>{token.text}</span>;
}

/**
 * Evidence card for a single log entry
 */
const EvidenceCard = memo(function EvidenceCard({
  log,
  index,
  onRemove,
  onJumpToSource,
  searchQuery,
  isRegex,
  isCurrentMatch,
  cardRef,
}: {
  log: LogEntry;
  index: number;
  onRemove: () => void;
  onJumpToSource?: () => void;
  searchQuery?: string;
  isRegex?: boolean;
  isCurrentMatch?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const serviceName = getServiceName(log);
  const content = log.parsed?.content || log.data;
  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(" ")
      ? log.parsed.timestamp.split(" ")[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null;
  const level = log.parsed?.level?.toUpperCase();

  // Level-based styling
  const getLevelIndicator = () => {
    if (level === 'ERROR') return { color: 'var(--mocha-error)', label: 'ERR' };
    if (level === 'WARN' || level === 'WARNING') return { color: 'var(--mocha-warning)', label: 'WARN' };
    return null;
  };
  const levelIndicator = getLevelIndicator();

  const { tokens } = tokenizeContent(content);
  const rawLog = log.data;

  // Highlight search matches
  const highlightMatches = (text: string) => {
    if (!searchQuery?.trim()) return text;

    try {
      const regex = isRegex
        ? new RegExp(`(${searchQuery})`, 'gi')
        : new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

      const parts = text.split(regex);
      return parts.map((part, i) => {
        if (regex.test(part)) {
          regex.lastIndex = 0;
          return (
            <mark
              key={i}
              style={{
                background: isCurrentMatch ? 'var(--mocha-accent)' : 'var(--mocha-accent-muted)',
                color: isCurrentMatch ? 'var(--mocha-bg)' : 'var(--mocha-accent)',
                padding: '0 2px',
                borderRadius: '2px',
              }}
            >
              {part}
            </mark>
          );
        }
        regex.lastIndex = 0;
        return part;
      });
    } catch {
      return text;
    }
  };

  return (
    <div
      ref={cardRef}
      className={`group relative ${isCurrentMatch ? 'ring-2 ring-[var(--mocha-accent)] ring-offset-2 ring-offset-[#f5f2ed]' : ''}`}
      data-story-hash={log.hash}
    >
      <div
        className="relative mx-4 mb-3 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg logbook-card"
      >
        {/* Evidence number strip */}
        <div
          className="absolute -left-0 top-0 bottom-0 w-12 flex items-center justify-center"
          style={{
            background: showRaw
              ? 'linear-gradient(135deg, #252b38 0%, #1e232e 100%)'
              : 'linear-gradient(135deg, #e8e4de 0%, #ddd8d0 100%)',
            borderRight: showRaw
              ? '1px solid var(--mocha-border)'
              : '1px solid rgba(0,0,0,0.06)',
            borderLeft: levelIndicator ? `3px solid ${levelIndicator.color}` : undefined,
          }}
        >
          <span
            className="text-xs font-bold tabular-nums font-mono"
            style={{
              color: showRaw ? 'var(--mocha-text-muted)' : '#6b635a',
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        {/* Content area */}
        <div
          className="pl-14 pr-12 py-4"
          style={{
            background: showRaw
              ? 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)'
              : 'linear-gradient(145deg, #fdfcfa 0%, #f8f6f2 100%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            {timestamp && (
              <span
                className="text-[10px] tracking-wide tabular-nums font-mono"
                style={{
                  color: showRaw ? 'var(--mocha-text-muted)' : '#8b8378',
                }}
              >
                {timestamp}
              </span>
            )}
            {levelIndicator && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                style={{
                  background: showRaw ? `color-mix(in srgb, ${levelIndicator.color} 15%, transparent)` : `color-mix(in srgb, ${levelIndicator.color} 12%, transparent)`,
                  color: levelIndicator.color,
                }}
              >
                {levelIndicator.label}
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider font-mono"
              style={{
                background: showRaw ? 'var(--mocha-surface-hover)' : '#e8e4de',
                color: showRaw ? 'var(--mocha-text-secondary)' : '#6b635a',
              }}
            >
              {serviceName}
            </span>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[9px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
              style={{
                background: showRaw ? 'var(--mocha-info-muted)' : 'rgba(0,0,0,0.04)',
                color: showRaw ? 'var(--mocha-info)' : '#a8a098',
              }}
            >
              {showRaw ? 'RAW' : 'RAW'}
            </button>
          </div>

          {/* Log content */}
          {showRaw ? (
            <div
              className="text-[11px] leading-relaxed whitespace-pre-wrap break-all select-text font-mono"
              style={{ color: 'var(--mocha-text)' }}
            >
              {highlightMatches(rawLog)}
            </div>
          ) : (
            <div
              className="text-[13px] leading-relaxed font-mono"
              style={{
                color: '#3d3833',
                wordBreak: 'break-word',
              }}
            >
              {tokens.map((token, i) => {
                if (token.type === "json") {
                  try {
                    const parsed = JSON.parse(token.text);
                    return (
                      <div
                        key={i}
                        className="my-2 p-2.5 rounded-lg text-[11px]"
                        style={{
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}
                      >
                        <JsonView
                          data={parsed}
                          shouldExpandNode={(level) => level < 1}
                          style={logbookJsonStyles}
                        />
                      </div>
                    );
                  } catch {
                    // Parse failed
                  }
                }
                return <TokenSpan key={i} token={token} />;
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {onJumpToSource && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSource();
              }}
              className="p-1.5 rounded-lg transition-all hover:scale-110"
              style={{
                background: showRaw ? 'var(--mocha-surface-hover)' : 'rgba(0,0,0,0.06)',
                color: showRaw ? 'var(--mocha-text-secondary)' : '#8b8378',
              }}
              title="Jump to source in log viewer"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 rounded-lg transition-all hover:scale-110"
            style={{
              background: showRaw ? 'var(--mocha-surface-hover)' : 'rgba(0,0,0,0.06)',
              color: showRaw ? 'var(--mocha-text-secondary)' : '#8b8378',
            }}
            title="Remove from logbook"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * Story tab component
 */
function StoryTab({
  story,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  story: Story;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(story.name);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    if (editValue.trim()) {
      onRename(editValue.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onDoubleClick={() => setIsEditing(true)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-t-xl text-sm font-medium
          transition-all duration-200 border border-b-0
          ${
            isActive
              ? 'bg-gradient-to-b from-[#fdfcfa] to-[#f8f6f2] border-[rgba(0,0,0,0.06)] text-[#3d3833]'
              : 'bg-transparent border-transparent text-[var(--mocha-text-muted)] hover:text-[var(--mocha-text-secondary)] hover:bg-[var(--mocha-surface-hover)]'
          }
        `}
      >
        <FileText className="w-3.5 h-3.5" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') {
                setEditValue(story.name);
                setIsEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent outline-none w-24 text-sm font-medium"
          />
        ) : (
          <span className="max-w-[120px] truncate">{story.name}</span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-mono"
          style={{
            background: isActive ? '#e8e4de' : 'var(--mocha-surface-hover)',
            color: isActive ? '#6b635a' : 'var(--mocha-text-muted)',
          }}
        >
          {story.entries.length}
        </span>

        {isActive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="absolute top-full left-0 z-20 mt-1 py-1 rounded-xl shadow-lg min-w-[140px] animate-scale-in"
            style={{
              background: '#fdfcfa',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <button
              onClick={() => {
                setIsEditing(true);
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: '#3d3833' }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
            <button
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: 'var(--mocha-error)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Resize handle
 */
function ResizeHandle({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastY.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const deltaY = lastY.current - e.clientY;
      lastY.current = e.clientY;
      onDrag(deltaY);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-3 cursor-row-resize flex items-center justify-center group"
      style={{ background: 'var(--mocha-surface)' }}
    >
      <div
        className="w-20 h-1 rounded-full transition-all duration-200 group-hover:bg-[var(--mocha-accent)] group-hover:shadow-[0_0_8px_var(--mocha-accent-glow)]"
        style={{ background: 'var(--mocha-border-strong)' }}
      />
    </div>
  );
}

/**
 * Story Pane - The Investigator's Logbook
 */
export function StoryPane({
  stories,
  activeStoryId,
  storyLogs,
  height,
  collapsed,
  maximized,
  onRemoveFromStory,
  onClearStory,
  onHeightChange,
  onToggleCollapsed,
  onToggleMaximized,
  onCreateStory,
  onDeleteStory,
  onRenameStory,
  onSetActiveStory,
  onJumpToSource,
  scrollRef,
}: StoryPaneProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd/Ctrl+G to focus search when maximized
  useEffect(() => {
    if (!maximized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maximized]);

  // Find matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const matches: { logHash: string; logIndex: number }[] = [];

    try {
      const regex = isRegex
        ? new RegExp(searchQuery, 'gi')
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      storyLogs.forEach((log, index) => {
        if (log.hash && regex.test(log.data)) {
          matches.push({ logHash: log.hash, logIndex: index });
        }
        regex.lastIndex = 0;
      });
    } catch {
      // Invalid regex
    }

    return matches;
  }, [searchQuery, isRegex, storyLogs]);

  const currentMatchHash = searchMatches[currentMatchIndex]?.logHash || null;

  // Scroll to match
  useEffect(() => {
    if (currentMatchHash) {
      const card = cardRefs.current.get(currentMatchHash);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchHash, currentMatchIndex]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
    }
  }, [searchMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
    }
  }, [searchMatches.length]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, isRegex]);

  const handleCopy = useCallback(() => {
    const lines: string[] = [];
    let currentFile: string | null = null;

    for (const log of storyLogs) {
      const filePath = log.name;
      if (filePath !== currentFile) {
        const headerBase = `LOGFILE: ${filePath} `;
        const padding = '='.repeat(Math.max(0, 72 - headerBase.length));
        lines.push(`${headerBase}${padding}|`);
        currentFile = filePath;
      }
      lines.push(log.data);
    }

    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [storyLogs]);

  const handleDrag = useCallback(
    (deltaY: number) => {
      onHeightChange(Math.max(150, Math.min(600, height + deltaY)));
    },
    [height, onHeightChange]
  );

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const isEmpty = storyLogs.length === 0;
  const paneHeight = collapsed ? 'auto' : maximized ? '100vh' : height;

  return (
    <div
      className={`flex flex-col shrink-0 ${maximized ? 'fixed inset-0 z-50' : ''}`}
      style={{
        height: paneHeight,
        background: maximized ? '#f5f2ed' : 'var(--mocha-surface)',
      }}
    >
      {/* Resize handle */}
      {!collapsed && !maximized && <ResizeHandle onDrag={handleDrag} />}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pt-2.5 pb-0 shrink-0"
        style={{
          background: 'linear-gradient(to bottom, var(--mocha-surface-raised), var(--mocha-surface))',
          borderTop: '1px solid var(--mocha-border)',
        }}
      >
        {/* Left side */}
        <div className="flex items-center gap-2">
          <button
            onClick={maximized ? onToggleMaximized : onToggleCollapsed}
            className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
            style={{ color: 'var(--mocha-text-secondary)' }}
            title={maximized ? 'Exit maximized' : collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Tabs */}
          {!collapsed && (
            <div className="flex items-end gap-1">
              {stories.map((story) => (
                <StoryTab
                  key={story.id}
                  story={story}
                  isActive={story.id === activeStoryId}
                  onSelect={() => onSetActiveStory(story.id)}
                  onRename={(name) => onRenameStory(story.id, name)}
                  onDelete={() => onDeleteStory(story.id)}
                />
              ))}

              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-sm transition-all duration-200 hover:bg-[var(--mocha-surface-hover)]"
                style={{ color: 'var(--mocha-text-muted)' }}
                title="New logbook"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Collapsed title */}
          {collapsed && (
            <span
              className="text-sm font-semibold font-display flex items-center gap-2"
              style={{ color: 'var(--mocha-text)' }}
            >
              <BookOpen className="w-4 h-4" style={{ color: 'var(--mocha-accent)' }} />
              Logbooks
              <span
                className="text-xs px-1.5 py-0.5 rounded-full tabular-nums"
                style={{
                  background: 'var(--mocha-surface-hover)',
                  color: 'var(--mocha-text-secondary)',
                }}
              >
                {stories.length}
              </span>
            </span>
          )}
        </div>

        {/* Search (maximized only) - matching Toolbar style */}
        {!collapsed && maximized && (
          <div className="flex items-center gap-2 pb-1">
            {/* Search input with animated width and glow */}
            <div
              className="relative flex items-center transition-all duration-300"
              style={{
                width: searchFocused || searchQuery ? '260px' : '180px',
              }}
            >
              <Search
                className="absolute left-3 w-4 h-4 pointer-events-none transition-colors duration-200"
                style={{
                  color: searchFocused ? 'var(--mocha-accent)' : 'var(--mocha-text-muted)',
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.shiftKey ? goToPrevMatch() : goToNextMatch();
                  }
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search logbook..."
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl font-mono"
                style={{
                  background: searchFocused ? 'var(--mocha-surface-raised)' : 'var(--mocha-surface-hover)',
                  border: `1px solid ${searchFocused ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
                  color: 'var(--mocha-text)',
                  boxShadow: searchFocused
                    ? '0 0 0 3px var(--mocha-accent-muted), 0 4px 16px rgba(0,0,0,0.2)'
                    : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                title="Search logbook (⌘G). Enter for next, Shift+Enter for previous"
              />

              {/* Keyboard hint or clear button */}
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 rounded-md transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                  style={{ color: 'var(--mocha-text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : !searchFocused && (
                <div
                  className="absolute right-3 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: 'var(--mocha-surface-active)',
                    color: 'var(--mocha-text-muted)',
                  }}
                >
                  <Command className="w-2.5 h-2.5" />
                  <span>G</span>
                </div>
              )}
            </div>

            {/* Regex toggle with gradient when active */}
            <button
              onClick={() => setIsRegex(!isRegex)}
              className="px-3 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all duration-200"
              style={{
                background: isRegex
                  ? 'linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)'
                  : 'var(--mocha-surface-hover)',
                border: `1px solid ${isRegex ? 'var(--mocha-accent)' : 'var(--mocha-border)'}`,
                color: isRegex ? 'var(--mocha-bg)' : 'var(--mocha-text-muted)',
                boxShadow: isRegex ? '0 2px 12px var(--mocha-accent-glow)' : 'none',
              }}
              title="Toggle regex search"
            >
              .*
            </button>

            {/* Match navigation pill */}
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
                  onClick={goToPrevMatch}
                  className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-hover)]"
                  style={{ color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)' }}
                  title="Previous match (Shift+Enter)"
                  disabled={searchMatches.length === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span
                  className="text-xs tabular-nums min-w-[3.5rem] text-center font-mono font-medium px-1"
                  style={{
                    color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-error)',
                  }}
                >
                  {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                </span>

                <button
                  onClick={goToNextMatch}
                  className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-hover)]"
                  style={{ color: searchMatches.length > 0 ? 'var(--mocha-text-secondary)' : 'var(--mocha-text-muted)' }}
                  title="Next match (Enter)"
                  disabled={searchMatches.length === 0}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Right actions */}
        {!collapsed && (
          <div className="flex items-center gap-1 pb-1">
            {activeStory && !isEmpty && (
              <>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-all duration-200"
                  style={{ color: 'var(--mocha-text-secondary)' }}
                  title="Copy all"
                >
                  {copyFeedback ? (
                    <Check className="w-4 h-4" style={{ color: 'var(--mocha-success)' }} />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={onClearStory}
                  className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
                  style={{ color: 'var(--mocha-text-secondary)' }}
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onToggleMaximized}
              className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
              style={{ color: 'var(--mocha-text-secondary)' }}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-5 logbook-paper"
        >
          {stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in-up">
              <div
                className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #fdfcfa 0%, #f5f2ed 100%)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                }}
              >
                <BookOpen className="w-9 h-9" style={{ color: '#8b8378' }} />
              </div>
              <p
                className="text-xl font-semibold mb-2 font-display"
                style={{ color: '#3d3833' }}
              >
                Start a Logbook
              </p>
              <p className="text-sm mb-6" style={{ color: '#8b8378' }}>
                Click on log lines above to collect evidence
              </p>
              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #fdfcfa 0%, #f0ece6 100%)',
                  color: '#3d3833',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                <Plus className="w-4 h-4" />
                New Logbook
              </button>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
              <BookOpen className="w-10 h-10 mb-4" style={{ color: '#a8a098' }} />
              <p className="text-sm" style={{ color: '#8b8378' }}>
                Click log lines to add to <span className="font-semibold">{activeStory?.name}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {storyLogs.map((log, index) => (
                <EvidenceCard
                  key={log.hash}
                  log={log}
                  index={index}
                  onRemove={() => log.hash && onRemoveFromStory(log.hash)}
                  onJumpToSource={
                    onJumpToSource && log.hash
                      ? () => onJumpToSource(log)
                      : undefined
                  }
                  searchQuery={searchQuery}
                  isRegex={isRegex}
                  isCurrentMatch={log.hash === currentMatchHash}
                  cardRef={(el) => {
                    if (el && log.hash) {
                      cardRefs.current.set(log.hash, el);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
