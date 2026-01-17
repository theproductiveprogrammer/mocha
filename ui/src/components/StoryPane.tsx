import { useState, useCallback, useRef, useEffect, memo } from "react";
import {
  X,
  Copy,
  Trash2,
  Check,
  BookOpen,
  Maximize2,
  Crosshair,
} from "lucide-react";
import type { LogEntry, Story } from "../types";
import { getServiceName } from "./LogLine";

interface StoryPaneProps {
  stories: Story[];
  activeStoryId: string | null;
  storyLogs: LogEntry[];
  width: number;
  collapsed: boolean;
  removingHash: string | null;
  onRemove: (hash: string) => void;  // Triggers animated removal flow
  onClearStory: () => void;
  onWidthChange: (width: number) => void;
  onToggleCollapsed: () => void;
  onOpenFullView: () => void;
  onOpenAtEntry: (hash: string) => void;  // Open logbook view scrolled to this entry in raw mode
  onJumpToSource: (log: LogEntry) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Compact evidence card for preview panel
 */
const EvidenceCard = memo(function EvidenceCard({
  log,
  index,
  onRemove,
  onJumpToSource,
  onOpenAtEntry,
  isRemoving,
}: {
  log: LogEntry;
  index: number;
  onRemove: () => void;
  onJumpToSource: () => void;
  onOpenAtEntry: () => void;
  isRemoving?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const serviceName = getServiceName(log);
  const content = log.parsed?.content || log.data;
  const timestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(" ")
      ? log.parsed.timestamp.split(" ")[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null;
  const level = log.parsed?.level?.toUpperCase();

  const getLevelIndicator = () => {
    if (level === "ERROR") return { color: "var(--mocha-error)", label: "E" };
    if (level === "WARN" || level === "WARNING")
      return { color: "var(--mocha-warning)", label: "W" };
    return null;
  };
  const levelIndicator = getLevelIndicator();

  // Get first line only for compact display
  const firstLine = content.split("\n")[0] || content;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(log.data);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`group relative transition-all duration-500 ease-out ${isRemoving ? "opacity-0 scale-90 -translate-x-4" : "opacity-100 scale-100 translate-x-0"}`}
      data-story-hash={log.hash}
    >
      <div
        className={`relative mx-2 mb-2 rounded-lg overflow-hidden transition-all duration-200 logbook-card cursor-pointer ${isRemoving ? "ring-2 ring-[var(--mocha-error)]" : ""}`}
        style={{
          borderLeft: levelIndicator ? `3px solid ${levelIndicator.color}` : "3px solid transparent",
        }}
        onClick={onOpenAtEntry}
      >
        <div className="px-3 py-2.5">
          {/* Compact header */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="text-[9px] font-bold tabular-nums font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--mocha-accent-muted)", color: "var(--mocha-accent)" }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {timestamp && (
              <span className="text-[9px] tabular-nums font-mono" style={{ color: "var(--mocha-text-muted)" }}>
                {timestamp}
              </span>
            )}
            {levelIndicator && (
              <span
                className="text-[8px] px-1 py-0.5 rounded font-bold"
                style={{
                  background: `color-mix(in srgb, ${levelIndicator.color} 15%, transparent)`,
                  color: levelIndicator.color,
                }}
              >
                {levelIndicator.label}
              </span>
            )}
            <span
              className="text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase font-mono truncate max-w-[80px]"
              style={{ background: "var(--mocha-surface-hover)", color: "var(--mocha-text-secondary)" }}
            >
              {serviceName}
            </span>
          </div>

          {/* Truncated content */}
          <p
            className="text-[11px] leading-snug font-mono truncate"
            style={{ color: "var(--mocha-text)" }}
            title={firstLine}
          >
            {firstLine}
          </p>
        </div>

        {/* Action buttons on hover */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:scale-110 transition-all duration-150"
            style={{ background: "var(--mocha-surface-hover)", color: copied ? "var(--mocha-success)" : "var(--mocha-text-secondary)" }}
            title="Copy log line"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToSource();
            }}
            className="p-1 rounded hover:scale-110 transition-all duration-150"
            style={{ background: "var(--mocha-surface-hover)", color: "var(--mocha-text-secondary)" }}
            title="Jump to source"
          >
            <Crosshair className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 rounded hover:scale-110 transition-all duration-150"
            style={{ background: "var(--mocha-surface-hover)", color: "var(--mocha-text-secondary)" }}
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * Vertical resize handle for side panel
 */
function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const deltaX = lastX.current - e.clientX;
      lastX.current = e.clientX;
      onDrag(deltaX);
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
      className="w-3 cursor-col-resize flex items-center justify-center group shrink-0"
      style={{ background: "var(--mocha-surface)" }}
    >
      <div
        className="h-20 w-1 rounded-full transition-all duration-200 group-hover:bg-[var(--mocha-accent)] group-hover:shadow-[0_0_8px_var(--mocha-accent-glow)]"
        style={{ background: "var(--mocha-border-strong)" }}
      />
    </div>
  );
}

/**
 * Story Pane - Preview of the active logbook (simplified)
 */
export function StoryPane({
  stories,
  activeStoryId,
  storyLogs,
  width,
  collapsed,
  removingHash,
  onRemove,
  onClearStory,
  onWidthChange,
  onToggleCollapsed,
  onOpenFullView,
  onOpenAtEntry,
  onJumpToSource,
  scrollRef,
}: StoryPaneProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = useCallback(() => {
    const lines: string[] = [];
    let currentFile: string | null = null;

    for (const log of storyLogs) {
      const filePath = log.name;
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
    (deltaX: number) => {
      onWidthChange(Math.max(280, Math.min(800, width + deltaX)));
    },
    [width, onWidthChange],
  );

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const isEmpty = storyLogs.length === 0;
  const paneWidth = collapsed ? 0 : width;

  return (
    <div
      className="flex shrink-0 h-full"
      style={{
        width: paneWidth,
        background: "var(--mocha-surface)",
      }}
    >
      {/* Resize handle */}
      {!collapsed && <ResizeHandle onDrag={handleDrag} />}

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{
            background: "var(--mocha-surface)",
            borderBottom: "1px solid var(--mocha-border)",
          }}
        >
          {/* Left side - title */}
          <div className="flex items-center gap-2">
            {/* Title */}
            {activeStory ? (
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" style={{ color: "var(--mocha-accent)" }} />
                <span
                  className="text-sm font-semibold font-display truncate max-w-[120px]"
                  style={{ color: "var(--mocha-text)" }}
                >
                  {activeStory.name}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{
                    background: "var(--mocha-accent-muted)",
                    color: "var(--mocha-accent)",
                  }}
                >
                  {storyLogs.length}
                </span>
              </div>
            ) : (
              <span
                className="text-sm font-semibold font-display flex items-center gap-2"
                style={{ color: "var(--mocha-text)" }}
              >
                <BookOpen className="w-4 h-4" style={{ color: "var(--mocha-accent)" }} />
                Logbook Preview
              </span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {activeStory && !isEmpty && (
              <>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-all duration-200"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Copy all"
                >
                  {copyFeedback ? (
                    <Check
                      className="w-4 h-4"
                      style={{ color: "var(--mocha-success)" }}
                    />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={onClearStory}
                  className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
                  style={{ color: "var(--mocha-text-secondary)" }}
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onOpenFullView}
              className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
              style={{ color: "var(--mocha-text-secondary)" }}
              title="Open full view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleCollapsed}
              className="p-1.5 rounded-lg hover:bg-[var(--mocha-surface-hover)] transition-colors"
              style={{ color: "var(--mocha-text-secondary)" }}
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!collapsed && (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto py-5 logbook-glass"
          >
            {!activeStory ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
                <div
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "var(--mocha-surface-raised)",
                    border: "1px solid var(--mocha-border)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  <BookOpen className="w-7 h-7" style={{ color: "var(--mocha-text-muted)" }} />
                </div>
                <p
                  className="text-sm font-semibold mb-2 font-display"
                  style={{ color: "var(--mocha-text)" }}
                >
                  No Logbook Selected
                </p>
                <p className="text-xs" style={{ color: "var(--mocha-text-muted)" }}>
                  Select a logbook from the sidebar
                </p>
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
                <BookOpen
                  className="w-10 h-10 mb-4"
                  style={{ color: "var(--mocha-text-muted)" }}
                />
                <p className="text-sm" style={{ color: "var(--mocha-text-secondary)" }}>
                  Click log lines to add to{" "}
                  <span className="font-semibold" style={{ color: "var(--mocha-accent)" }}>{activeStory?.name}</span>
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {storyLogs.map((log, index) => (
                  <EvidenceCard
                    key={log.hash}
                    log={log}
                    index={index}
                    onRemove={() => log.hash && onRemove(log.hash)}
                    onJumpToSource={() => onJumpToSource(log)}
                    onOpenAtEntry={() => log.hash && onOpenAtEntry(log.hash)}
                    isRemoving={log.hash === removingHash}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
