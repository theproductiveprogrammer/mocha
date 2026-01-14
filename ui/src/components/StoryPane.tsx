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
  Coffee,
  Maximize2,
  Minimize2,
  Search,
  ChevronLeft,
  ChevronRight,
  Crosshair,
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
        return { color: "#b8860b", fontWeight: 600 };
      case "marker.info":
        return { color: "#8b8b8b" };
      case "url":
        return { color: "#6b9ece" };
      case "data":
        return { color: "#b8956f", fontWeight: 500 };
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
 * Click to toggle between formatted and raw view
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
    if (level === 'ERROR') return { color: '#e85c5c', label: 'ERR' };
    if (level === 'WARN' || level === 'WARNING') return { color: '#eab308', label: 'WARN' };
    return null;
  };
  const levelIndicator = getLevelIndicator();

  const { tokens } = tokenizeContent(content);

  // Raw log data (original line from file)
  const rawLog = log.data;

  // Helper to highlight search matches in text
  const highlightMatches = (text: string) => {
    if (!searchQuery?.trim()) return text;

    try {
      const regex = isRegex
        ? new RegExp(`(${searchQuery})`, 'gi')
        : new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

      const parts = text.split(regex);
      return parts.map((part, i) => {
        if (regex.test(part)) {
          regex.lastIndex = 0; // Reset for next test
          return (
            <mark
              key={i}
              style={{
                background: isCurrentMatch ? '#eab308' : '#eab30866',
                color: '#000',
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
      className={`group relative ${isCurrentMatch ? 'ring-2 ring-[#eab308] ring-offset-2 ring-offset-[#f0ece6]' : ''}`}
      data-story-hash={log.hash}
    >
      {/* Card */}
      <div
        className="relative mx-4 mb-3 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md"
        style={{
          background: showRaw
            ? "linear-gradient(135deg, #2a2826 0%, #1e1c1a 100%)"
            : "linear-gradient(135deg, #faf8f5 0%, #f5f2ed 100%)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
          border: showRaw
            ? "1px solid rgba(255,255,255,0.1)"
            : "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {/* Evidence number with level indicator */}
        <div
          className="absolute -left-0 top-0 bottom-0 w-10 flex items-center justify-center"
          style={{
            background: showRaw
              ? "linear-gradient(135deg, #3a3836 0%, #2a2826 100%)"
              : "linear-gradient(135deg, #e8e4de 0%, #ddd8d0 100%)",
            borderRight: showRaw
              ? "1px solid rgba(255,255,255,0.1)"
              : "1px solid rgba(0,0,0,0.08)",
            borderLeft: levelIndicator ? `3px solid ${levelIndicator.color}` : undefined,
          }}
        >
          <span
            className="text-xs font-bold tabular-nums"
            style={{
              color: showRaw ? "#8a8680" : "#6b635a",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        {/* Content area */}
        <div className="pl-12 pr-10 py-3">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            {timestamp && (
              <span
                className="text-[10px] tracking-wide tabular-nums"
                style={{
                  color: showRaw ? "#6a6460" : "#8b8378",
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {timestamp}
              </span>
            )}
            {levelIndicator && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                style={{
                  background: showRaw ? `${levelIndicator.color}33` : `${levelIndicator.color}22`,
                  color: levelIndicator.color,
                }}
              >
                {levelIndicator.label}
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
              style={{
                background: showRaw ? "rgba(255,255,255,0.1)" : "#e8e4de",
                color: showRaw ? "#a8a098" : "#6b635a",
              }}
            >
              {serviceName}
            </span>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
              style={{
                background: showRaw ? "rgba(90, 181, 168, 0.2)" : "rgba(0,0,0,0.04)",
                color: showRaw ? "#5ab5a8" : "#a8a098",
              }}
            >
              {showRaw ? "RAW" : "RAW"}
            </button>
          </div>

          {/* Log content - raw or formatted */}
          {showRaw ? (
            <div
              className="text-[11px] leading-relaxed whitespace-pre-wrap break-all select-text"
              style={{
                color: "#c8c0b8",
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {highlightMatches(rawLog)}
            </div>
          ) : (
            <div
              className="text-[13px] leading-relaxed"
              style={{
                color: "#3d3833",
                fontFamily: '"JetBrains Mono", monospace',
                wordBreak: "break-word",
              }}
            >
              {tokens.map((token, i) => {
                // Render JSON tokens with JsonView
                if (token.type === "json") {
                  try {
                    const parsed = JSON.parse(token.text);
                    return (
                      <div
                        key={i}
                        className="my-2 p-2 rounded text-[12px]"
                        style={{
                          background: "rgba(0,0,0,0.03)",
                          border: "1px solid rgba(0,0,0,0.06)",
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
                    // If parse fails, fall through to regular token
                  }
                }
                return <TokenSpan key={i} token={token} />;
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {/* Jump to source button */}
          {onJumpToSource && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSource();
              }}
              className="p-1.5 rounded-full hover:scale-110 transition-all"
              style={{
                background: showRaw ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                color: showRaw ? "#a8a098" : "#8b8378",
              }}
              title="Jump to source in log viewer"
            >
              <Crosshair className="w-3 h-3" />
            </button>
          )}
          {/* Remove button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 rounded-full hover:scale-110 transition-all"
            style={{
              background: showRaw ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
              color: showRaw ? "#a8a098" : "#8b8378",
            }}
            title="Remove from story"
          >
            <X className="w-3 h-3" />
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
          flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium
          transition-all duration-200 border border-b-0
          ${
            isActive
              ? "bg-gradient-to-b from-[#faf8f5] to-[#f5f2ed] border-[rgba(0,0,0,0.08)] text-[#3d3833]"
              : "bg-transparent border-transparent text-[var(--mocha-text-muted)] hover:text-[var(--mocha-text-secondary)] hover:bg-[rgba(255,255,255,0.05)]"
          }
        `}
        style={{
          fontFamily: '"Source Serif 4", Georgia, serif',
        }}
      >
        <FileText className="w-3.5 h-3.5" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") {
                setEditValue(story.name);
                setIsEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent outline-none w-24 text-sm"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          />
        ) : (
          <span className="max-w-[120px] truncate">{story.name}</span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
          style={{
            background: isActive ? "#e8e4de" : "rgba(255,255,255,0.1)",
            color: isActive ? "#6b635a" : "var(--mocha-text-muted)",
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
            className="absolute top-full left-0 z-20 mt-1 py-1 rounded-lg shadow-lg min-w-[140px]"
            style={{
              background: "#faf8f5",
              border: "1px solid rgba(0,0,0,0.1)",
            }}
          >
            <button
              onClick={() => {
                setIsEditing(true);
                setShowMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: "#3d3833" }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
            <button
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
              style={{ color: "#c45c5c" }}
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
 * Resize handle for the story pane
 */
function ResizeHandle({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastY.current = e.clientY;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
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
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-2 cursor-row-resize flex items-center justify-center group"
      style={{
        background: "var(--mocha-surface)",
      }}
    >
      <div
        className="w-16 h-1 rounded-full transition-colors group-hover:bg-[var(--mocha-text-muted)]"
        style={{ background: "var(--mocha-border)" }}
      />
    </div>
  );
}

/**
 * Story Pane - The Investigator's Notebook
 * A beautiful, readable pane for curating and reviewing log evidence
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Find all matches in logs
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
        // Reset regex lastIndex for next test
        regex.lastIndex = 0;
      });
    } catch {
      // Invalid regex, ignore
    }

    return matches;
  }, [searchQuery, isRegex, storyLogs]);

  // Get current match hash for highlighting
  const currentMatchHash = searchMatches[currentMatchIndex]?.logHash || null;

  // Scroll to current match when it changes
  useEffect(() => {
    if (currentMatchHash) {
      const card = cardRefs.current.get(currentMatchHash);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchHash, currentMatchIndex]);

  // Navigation handlers
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

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, isRegex]);

  const handleCopy = useCallback(() => {
    // Build output with file headers whenever the source file changes
    const lines: string[] = [];
    let currentFile: string | null = null;

    for (const log of storyLogs) {
      const filePath = log.name;

      // Add header when file changes
      if (filePath !== currentFile) {
        const headerBase = `LOGFILE: ${filePath} `;
        const padding = "=".repeat(Math.max(0, 72 - headerBase.length));
        lines.push(`${headerBase}${padding}|`);
        currentFile = filePath;
      }

      lines.push(log.data);
    }

    const text = lines.join("\n");
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [storyLogs]);

  const handleDrag = useCallback(
    (deltaY: number) => {
      onHeightChange(Math.max(150, Math.min(600, height + deltaY)));
    },
    [height, onHeightChange],
  );

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const isEmpty = storyLogs.length === 0;

  // Calculate height based on state
  const paneHeight = collapsed ? "auto" : maximized ? "100vh" : height;

  return (
    <div
      className={`flex flex-col shrink-0 ${maximized ? "fixed inset-0 z-50" : ""}`}
      style={{
        height: paneHeight,
        background: "var(--mocha-surface)",
      }}
    >
      {/* Resize handle - hidden when maximized */}
      {!collapsed && !maximized && <ResizeHandle onDrag={handleDrag} />}

      {/* Header with tabs - darker to transition from log viewer */}
      <div
        className="flex items-center justify-between px-3 pt-2 pb-0 shrink-0"
        style={{ background: "linear-gradient(to bottom, #2a2724, #3a3632)" }}
      >
        {/* Left: Collapse toggle + tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapsed}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] transition-colors mr-1"
            style={{ color: "var(--mocha-text-secondary)" }}
          >
            {collapsed ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Story tabs */}
          {!collapsed && (
            <div className="flex items-end gap-0.5">
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

              {/* New story button */}
              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-t-lg text-sm transition-all duration-200 hover:bg-[rgba(255,255,255,0.1)]"
                style={{ color: "var(--mocha-text-muted)" }}
                title="New logbook"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Collapsed title */}
          {collapsed && (
            <span
              className="text-sm font-semibold"
              style={{
                color: "var(--mocha-text)",
                fontFamily: '"Source Serif 4", Georgia, serif',
              }}
            >
              Logbooks
              <span
                className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "var(--mocha-text-secondary)",
                }}
              >
                {stories.length}
              </span>
            </span>
          )}
        </div>

        {/* Center: Search (when maximized) */}
        {!collapsed && maximized && (
          <div className="flex items-center gap-2 pb-1">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Search className="w-4 h-4" style={{ color: "var(--mocha-text-muted)" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="bg-transparent outline-none text-sm w-48"
                style={{
                  color: "var(--mocha-text)",
                  fontFamily: '"JetBrains Mono", monospace',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.shiftKey ? goToPrevMatch() : goToNextMatch();
                  }
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.1)]"
                  style={{ color: "var(--mocha-text-muted)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Regex toggle */}
            <button
              onClick={() => setIsRegex(!isRegex)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                isRegex ? "bg-[var(--mocha-accent)]" : "bg-[rgba(255,255,255,0.1)]"
              }`}
              style={{
                color: isRegex ? "var(--mocha-bg)" : "var(--mocha-text-muted)",
              }}
              title="Toggle regex search"
            >
              .*
            </button>

            {/* Match navigation */}
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrevMatch}
                  className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span
                  className="text-xs tabular-nums px-1"
                  style={{ color: "var(--mocha-text-secondary)" }}
                >
                  {currentMatchIndex + 1}/{searchMatches.length}
                </span>
                <button
                  onClick={goToNextMatch}
                  className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Next match (Enter)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* No matches indicator */}
            {searchQuery && searchMatches.length === 0 && (
              <span className="text-xs" style={{ color: "var(--mocha-error)" }}>
                No matches
              </span>
            )}
          </div>
        )}

        {/* Right: Actions */}
        {!collapsed && (
          <div className="flex items-center gap-1 pb-1">
            {activeStory && !isEmpty && (
              <>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] transition-all duration-200 flex items-center gap-1"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Copy all"
                >
                  {copyFeedback ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={onClearStory}
                  className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onToggleMaximized}
              className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              style={{ color: "var(--mocha-text-secondary)" }}
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-4"
          style={{
            background: "linear-gradient(135deg, #f0ece6 0%, #e8e4de 100%)",
          }}
        >
          {stories.length === 0 ? (
            // No stories yet
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #faf8f5 0%, #f0ece6 100%)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <Coffee className="w-7 h-7" style={{ color: "#8b8378" }} />
              </div>
              <p
                className="text-lg font-semibold mb-1"
                style={{
                  color: "#3d3833",
                  fontFamily: '"Source Serif 4", Georgia, serif',
                }}
              >
                Start a Logbook
              </p>
              <p className="text-sm mb-4" style={{ color: "#8b8378" }}>
                Click log lines above to collect logs
              </p>
              <button
                onClick={() => onCreateStory()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
                style={{
                  background:
                    "linear-gradient(135deg, #faf8f5 0%, #f0ece6 100%)",
                  color: "#3d3833",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <Plus className="w-4 h-4" />
                New Logbook
              </button>
            </div>
          ) : isEmpty ? (
            // Story exists but empty
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Coffee className="w-8 h-8 mb-3" style={{ color: "#a8a098" }} />
              <p className="text-sm" style={{ color: "#8b8378" }}>
                Click log lines to add to{" "}
                <span style={{ fontWeight: 600 }}>{activeStory?.name}</span>
              </p>
            </div>
          ) : (
            // Evidence cards
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
