import { useState, useCallback, useRef, useEffect, memo, useMemo } from "react";
import {
  X,
  Copy,
  Trash2,
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Command,
  Check,
  Download,
  Clock,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { exportFile } from "../api";
import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { LogEntry, LogToken, Story } from "../types";
import { tokenizeContent } from "../parser";
import { getServiceName } from "./LogLine";
import { deepParseJsonStrings } from "../utils/jsonParser";
import { PatternManager } from "./PatternManager";
import { useStoryStore } from "../store";

/**
 * Format a timestamp for display in time period dividers
 * Shows relative time for recent logs, absolute for older ones
 */
function formatTimePeriod(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    // Show date for older logs
    const date = new Date(timestamp);
    const today = new Date();
    const isThisYear = date.getFullYear() === today.getFullYear();

    if (isThisYear) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (days >= 1) {
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }

  if (hours >= 1) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  if (minutes >= 1) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }

  return "Just now";
}

/**
 * Get detailed time string for divider subtitle
 */
function formatTimeDetail(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Time period divider component
 * Elegant separator showing when a group of logs occurred
 */
const TimePeriodDivider = memo(function TimePeriodDivider({
  timestamp,
  isFirst,
}: {
  timestamp: number;
  isFirst?: boolean;
}) {
  const period = formatTimePeriod(timestamp);
  const detail = formatTimeDetail(timestamp);

  return (
    <div
      className={`relative flex items-center justify-center ${isFirst ? "pt-0 pb-6" : "py-8"}`}
      style={{ maxWidth: "56rem", margin: "0 auto" }}
    >
      {/* Decorative line - left */}
      <div
        className="flex-1 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--mocha-border-strong))",
        }}
      />

      {/* Time indicator pill */}
      <div
        className="relative mx-4 px-4 py-2 rounded-full flex items-center gap-2.5 transition-all duration-300 hover:scale-105"
        style={{
          background: "var(--mocha-surface-raised)",
          border: "1px solid var(--mocha-border)",
          boxShadow:
            "0 2px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
        }}
      >
        <Clock
          className="w-3.5 h-3.5"
          style={{ color: "var(--mocha-accent)", opacity: 0.8 }}
        />
        <div className="flex items-baseline gap-2">
          <span
            className="text-xs font-semibold tracking-wide"
            style={{ color: "var(--mocha-text)" }}
          >
            {period}
          </span>
          <span
            className="text-[10px] font-mono tabular-nums"
            style={{ color: "var(--mocha-text-muted)" }}
          >
            {detail}
          </span>
        </div>
      </div>

      {/* Decorative line - right */}
      <div
        className="flex-1 h-px"
        style={{
          background:
            "linear-gradient(to left, transparent, var(--mocha-border-strong))",
        }}
      />
    </div>
  );
});

/**
 * Determines if a time divider should be shown between two timestamps
 * Returns true if there's a significant time gap (> 5 minutes)
 */
function shouldShowDivider(
  prevTimestamp: number | undefined,
  currentTimestamp: number | undefined,
): boolean {
  if (!prevTimestamp || !currentTimestamp) return false;

  const gap = Math.abs(currentTimestamp - prevTimestamp);
  const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

  return gap > fiveMinutes;
}

// Infrastructure packages to filter out (framework/library code)
const INFRASTRUCTURE_PACKAGES = [
  "java.",
  "javax.",
  "sun.",
  "jdk.",
  "com.sun.",
  "org.springframework.",
  "io.micronaut.",
  "org.hibernate.",
  "org.apache.",
  "com.fasterxml.jackson.",
  "org.slf4j.",
  "ch.qos.logback.",
  "org.apache.log4j.",
  "org.apache.logging.",
  "com.google.common.",
  "com.google.guava.",
  "com.google.inject.",
  "kotlin.",
  "kotlinx.",
  "scala.",
  "okhttp3.",
  "okio.",
  "com.mysql.",
  "org.postgresql.",
  "com.zaxxer.hikari.",
  "org.jooq.",
  "io.quarkus.",
  "io.vertx.",
  "com.vaadin.",
  "io.netty.",
  "org.wicket.",
  "org.joda.",
  "android.",
  "dalvik.",
  "androidx.",
  "clojure.",
  "reactor.",
  "io.reactivex.",
  "rx.",
  "lombok.",
];

function isInfrastructureFrame(line: string): boolean {
  return INFRASTRUCTURE_PACKAGES.some((pkg) => line.includes(pkg));
}

function isImportantLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^[\w.$]+Exception|^[\w.$]+Error|^Caused by:/.test(trimmed)) return true;
  if (/^\.\.\. \d+ (more|common frames)/.test(trimmed)) return true;
  if (trimmed.startsWith("at ")) {
    return !isInfrastructureFrame(trimmed);
  }
  return false;
}

function extractImportantLines(content: string): {
  firstLine: string;
  importantLines: string[];
  hiddenCount: number;
  totalLines: number;
} {
  const lines = content.split("\n");
  const firstLine = lines[0] || "";
  const restLines = lines.slice(1);

  const importantLines: string[] = [];
  let hiddenCount = 0;

  for (const line of restLines) {
    if (isImportantLine(line)) {
      importantLines.push(line);
    } else if (line.trim()) {
      hiddenCount++;
    }
  }

  return { firstLine, importantLines, hiddenCount, totalLines: lines.length };
}

// Custom JSON viewer styles for logbook aesthetic
const logbookJsonStyles = {
  container: "jv-logbook-container",
  basicChildStyle: "jv-logbook-child",
  label: "jv-logbook-label",
  nullValue: "jv-logbook-null",
  undefinedValue: "jv-logbook-null",
  stringValue: "jv-logbook-string",
  booleanValue: "jv-logbook-boolean",
  numberValue: "jv-logbook-number",
  otherValue: "jv-logbook-other",
  punctuation: "jv-logbook-punctuation",
  collapseIcon: "jv-logbook-collapse-icon",
  expandIcon: "jv-logbook-expand-icon",
  collapsedContent: "jv-logbook-collapsed",
};

interface LogbookViewProps {
  story: Story | null;
  allStories: Story[]; // All stories for "Move to" feature
  onClose: () => void;
  onRemoveFromStory?: (hash: string) => void;
  onMoveToStory: (hash: string, toStoryId: string) => void;
  onDeleteStory: () => void;
  onRenameStory: (id: string, name: string) => void;
  onJumpToSource?: (log: LogEntry) => void;
  scrollToHash?: string | null; // Hash of entry to scroll to on mount
  initialRawHash?: string | null; // Hash of entry to show in raw mode initially
  onScrollComplete?: () => void; // Called after scrolling is complete
}

/**
 * Render a single token with appropriate styling
 */
function TokenSpan({ token }: { token: LogToken }) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
      case "marker.error":
        return { color: "var(--mocha-error)", fontWeight: 600 };
      case "marker.warn":
        return { color: "var(--mocha-warning)", fontWeight: 600 };
      case "marker.info":
        return { color: "var(--mocha-text-muted)" };
      case "url":
        return { color: "var(--mocha-info)" };
      case "data":
        return { color: "var(--mocha-accent)", fontWeight: 500 };
      case "json":
        return { color: "var(--mocha-text-muted)" };
      case "symbol":
        return { color: "var(--mocha-text-muted)" };
      case "message":
      default:
        return {};
    }
  };

  return <span style={getTokenStyle()}>{token.text}</span>;
}

/**
 * Smart content display with important line extraction
 */
function SmartContent({
  content,
  tokens,
  onShowRaw,
}: {
  content: string;
  tokens: LogToken[];
  onShowRaw: () => void;
}) {
  const { firstLine, importantLines, hiddenCount, totalLines } = useMemo(
    () => extractImportantLines(content),
    [content],
  );

  const isMultiLine = totalLines > 1;
  const hasImportantLines = importantLines.length > 0;

  if (!isMultiLine) {
    return (
      <div
        className="text-[13px] leading-relaxed font-mono"
        style={{ color: "var(--mocha-text)", wordBreak: "break-word" }}
      >
        {tokens.map((token, i) => {
          if (token.type === "json") {
            try {
              const parsed = JSON.parse(token.text);
              const deepParsed = deepParseJsonStrings(parsed);
              return (
                <div
                  key={i}
                  className="my-2 p-2.5 rounded-lg text-[11px]"
                  style={{
                    background: "var(--mocha-surface-hover)",
                    border: "1px solid var(--mocha-border)",
                  }}
                >
                  <JsonView
                    data={deepParsed as object | unknown[]}
                    shouldExpandNode={(level) => level < 2}
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
    );
  }

  const firstLineTokens = tokenizeContent(firstLine).tokens;

  return (
    <div className="font-mono" style={{ color: "var(--mocha-text)" }}>
      <div
        className="text-[13px] leading-relaxed"
        style={{ wordBreak: "break-word" }}
      >
        {firstLineTokens.map((token, i) => {
          if (token.type === "json") {
            try {
              const parsed = JSON.parse(token.text);
              const deepParsed = deepParseJsonStrings(parsed);
              return (
                <div
                  key={i}
                  className="my-2 p-2.5 rounded-lg text-[11px]"
                  style={{
                    background: "var(--mocha-surface-hover)",
                    border: "1px solid var(--mocha-border)",
                  }}
                >
                  <JsonView
                    data={deepParsed as object | unknown[]}
                    shouldExpandNode={(level) => level < 2}
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

      {hasImportantLines && (
        <div
          className="mt-2 pl-3 text-[11px] leading-relaxed space-y-0.5"
          style={{
            borderLeft: "2px solid var(--mocha-border-strong)",
            color: "var(--mocha-text-secondary)",
          }}
        >
          {importantLines.map((line, i) => {
            const trimmed = line.trim();
            const isException =
              /^[\w.$]+Exception|^[\w.$]+Error|^Caused by:/.test(trimmed);
            const isMoreLine = /^\.\.\. \d+ (more|common frames)/.test(trimmed);

            return (
              <div
                key={i}
                className="truncate"
                style={{
                  color: isException
                    ? "var(--mocha-error)"
                    : isMoreLine
                      ? "var(--mocha-text-muted)"
                      : "var(--mocha-text-secondary)",
                  fontWeight: isException ? 600 : 400,
                  fontStyle: isMoreLine ? "italic" : "normal",
                }}
                title={line}
              >
                {trimmed}
              </div>
            );
          })}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          onClick={onShowRaw}
          className="mt-2 text-[10px] px-2 py-1 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
          style={{
            color: "var(--mocha-text-muted)",
            background: "var(--mocha-surface-hover)",
          }}
        >
          ({hiddenCount} hidden)
        </button>
      )}
    </div>
  );
}

/**
 * Evidence card for LogbookView - slightly larger for full-page viewing
 */
const LogbookEvidenceCard = memo(function LogbookEvidenceCard({
  log,
  index,
  onRemove,
  onJumpToSource,
  onMoveToStory,
  otherStories,
  searchQuery,
  isRegex,
  isCurrentMatch,
  isRemoving,
  cardRef,
  initialShowRaw,
}: {
  log: LogEntry;
  index: number;
  onRemove: () => void;
  onJumpToSource?: () => void;
  onMoveToStory?: (toStoryId: string) => void;
  otherStories?: Story[];
  searchQuery?: string;
  isRegex?: boolean;
  isCurrentMatch?: boolean;
  isRemoving?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  initialShowRaw?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(initialShowRaw ?? false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMoveMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moveMenuRef.current &&
        !moveMenuRef.current.contains(e.target as Node)
      ) {
        setShowMoveMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoveMenu]);

  // If initialShowRaw is set, briefly show raw mode then fade back to parsed
  useEffect(() => {
    if (initialShowRaw) {
      const timer = setTimeout(() => {
        setShowRaw(false);
      }, 1500); // Show raw for 1.5 seconds, then switch back to parsed
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount
  const [copied, setCopied] = useState(false);
  const serviceName = getServiceName(log);
  const content = log.parsed?.content || log.data;

  // Format timestamp - show full time, optionally with date
  const formatTimestamp = () => {
    if (!log.parsed?.timestamp) return null;
    const ts = log.parsed.timestamp;
    // If timestamp contains space (date + time), extract time portion
    if (ts.includes(" ")) {
      const timePart = ts.split(" ")[1];
      return timePart?.slice(0, 8) || ts.slice(0, 8);
    }
    // If it's a full ISO timestamp, format it nicely
    if (ts.includes("T")) {
      const timePart = ts.split("T")[1];
      return timePart?.slice(0, 8) || ts;
    }
    return ts.slice(0, 8);
  };

  // Get full date for display
  const getFullDate = () => {
    if (!log.parsed?.timestamp) return null;
    const ts = log.parsed.timestamp;
    if (ts.includes(" ")) {
      return ts.split(" ")[0];
    }
    if (ts.includes("T")) {
      return ts.split("T")[0];
    }
    return null;
  };

  const timestamp = formatTimestamp();
  const dateStr = getFullDate();
  const level = log.parsed?.level?.toUpperCase();

  const getLevelIndicator = () => {
    if (level === "ERROR") return { color: "var(--mocha-error)", label: "ERR" };
    if (level === "WARN" || level === "WARNING")
      return { color: "var(--mocha-warning)", label: "WARN" };
    return null;
  };
  const levelIndicator = getLevelIndicator();

  const { tokens } = tokenizeContent(content);
  const rawLog = log.data;

  const highlightMatches = (text: string) => {
    if (!searchQuery?.trim()) return text;

    try {
      const regex = isRegex
        ? new RegExp(`(${searchQuery})`, "gi")
        : new RegExp(
            `(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi",
          );

      const parts = text.split(regex);
      return parts.map((part, i) => {
        if (regex.test(part)) {
          regex.lastIndex = 0;
          return (
            <mark
              key={i}
              style={{
                background: isCurrentMatch
                  ? "var(--mocha-accent)"
                  : "var(--mocha-accent-muted)",
                color: isCurrentMatch
                  ? "var(--mocha-bg)"
                  : "var(--mocha-accent)",
                padding: "0 2px",
                borderRadius: "2px",
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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(log.data);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-300 ${isCurrentMatch ? "ring-2 ring-[var(--mocha-accent)] ring-offset-2 ring-offset-[var(--mocha-surface)]" : ""} ${isRemoving ? "opacity-50 scale-95" : ""}`}
      style={{ zIndex: showMoveMenu ? 100 : "auto" }}
      data-story-hash={log.hash}
    >
      <div
        className={`relative mx-auto max-w-4xl mb-4 rounded-2xl transition-all duration-200 hover:shadow-xl logbook-card ${isRemoving ? "ring-2 ring-[var(--mocha-error)] ring-opacity-50" : ""}`}
      >
        {/* Card Header - Clean metadata row */}
        <div
          className="relative flex items-center justify-between px-5 py-3 rounded-t-2xl"
          style={{
            background: "var(--mocha-surface-hover)",
            borderBottom: "1px solid var(--mocha-border)",
          }}
        >
          {/* Floating action bar - appears at header/content boundary on hover */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
            <div
              className="flex items-center gap-0.5 px-1 py-1 rounded-full"
              style={{
                background: "var(--mocha-surface-raised)",
                border: "1px solid var(--mocha-border)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              }}
            >
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-full transition-all hover:scale-110"
                style={{
                  background: copied
                    ? "var(--mocha-success-muted)"
                    : "transparent",
                  color: copied
                    ? "var(--mocha-success)"
                    : "var(--mocha-text-muted)",
                }}
                title="Copy log line"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {onJumpToSource && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToSource();
                  }}
                  className="p-1.5 rounded-full transition-all hover:scale-110 hover:bg-[var(--mocha-surface-hover)]"
                  style={{ color: "var(--mocha-text-muted)" }}
                  title="Jump to source"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Move to dropdown */}
              {onMoveToStory && otherStories && otherStories.length > 0 && (
                <div className="relative" ref={moveMenuRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoveMenu(!showMoveMenu);
                    }}
                    className="p-1.5 rounded-full transition-all hover:scale-110"
                    style={{
                      background: showMoveMenu
                        ? "var(--mocha-surface-hover)"
                        : "transparent",
                      color: "var(--mocha-text-muted)",
                    }}
                    title="Move to another logbook"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown menu */}
                  {showMoveMenu && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 py-1.5 rounded-xl shadow-xl z-50 min-w-[180px] animate-scale-in"
                      style={{
                        background: "var(--mocha-surface-raised)",
                        border: "1px solid var(--mocha-border)",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                      }}
                    >
                      <div
                        className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{
                          color: "var(--mocha-text-muted)",
                          borderBottom: "1px solid var(--mocha-border)",
                        }}
                      >
                        Move to
                      </div>
                      {otherStories.map((targetStory) => (
                        <button
                          key={targetStory.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToStory(targetStory.id);
                            setShowMoveMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 transition-colors hover:bg-[var(--mocha-surface-hover)]"
                          style={{ color: "var(--mocha-text)" }}
                        >
                          <BookOpen
                            className="w-3.5 h-3.5"
                            style={{ color: "var(--mocha-accent)" }}
                          />
                          <span className="truncate flex-1">
                            {targetStory.name}
                          </span>
                          <span
                            className="text-[10px] tabular-nums"
                            style={{ color: "var(--mocha-text-muted)" }}
                          >
                            {targetStory.entries.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div
                className="w-px h-4 mx-0.5"
                style={{ background: "var(--mocha-border)" }}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="p-1.5 rounded-full transition-all hover:scale-110 hover:bg-[var(--mocha-error-bg)]"
                style={{ color: "var(--mocha-text-muted)" }}
                title="Remove from logbook"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Left side: Index + Timestamp + Level */}
          <div className="flex items-center gap-4">
            {/* Evidence number */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: levelIndicator
                  ? `color-mix(in srgb, ${levelIndicator.color} 15%, transparent)`
                  : "var(--mocha-surface-active)",
                border: levelIndicator
                  ? `1px solid color-mix(in srgb, ${levelIndicator.color} 30%, transparent)`
                  : "1px solid var(--mocha-border)",
              }}
            >
              <span
                className="text-xs font-bold tabular-nums font-mono"
                style={{
                  color: levelIndicator?.color || "var(--mocha-accent)",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>

            {/* Timestamp group */}
            <div className="flex flex-col">
              {timestamp && (
                <span
                  className="text-sm font-mono tabular-nums font-medium"
                  style={{ color: "var(--mocha-text)" }}
                >
                  {timestamp}
                </span>
              )}
              {dateStr && (
                <span
                  className="text-[10px] font-mono tabular-nums"
                  style={{ color: "var(--mocha-text-muted)" }}
                >
                  {dateStr}
                </span>
              )}
            </div>

            {/* Divider */}
            {(timestamp || dateStr) && (
              <div
                className="h-6 w-px"
                style={{ background: "var(--mocha-border)" }}
              />
            )}

            {/* Service badge */}
            <span
              className="text-[11px] px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wide font-mono"
              style={{
                background: "var(--mocha-surface-active)",
                color: "var(--mocha-text-secondary)",
                border: "1px solid var(--mocha-border)",
              }}
            >
              {serviceName}
            </span>

            {/* Level indicator */}
            {levelIndicator && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
                style={{
                  background: `color-mix(in srgb, ${levelIndicator.color} 20%, transparent)`,
                  color: levelIndicator.color,
                  border: `1px solid color-mix(in srgb, ${levelIndicator.color} 40%, transparent)`,
                }}
              >
                {levelIndicator.label}
              </span>
            )}
          </div>

          {/* Right side: RAW toggle */}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] px-3 py-1.5 rounded-lg font-semibold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
            style={{
              background: showRaw ? "var(--mocha-info-muted)" : "transparent",
              color: showRaw ? "var(--mocha-info)" : "var(--mocha-text-muted)",
              border: showRaw
                ? "1px solid var(--mocha-info)"
                : "1px solid var(--mocha-border)",
            }}
          >
            {showRaw ? "Raw" : "Raw"}
          </button>
        </div>

        {/* Content area */}
        <div
          className="px-5 py-4"
          style={{
            background: showRaw
              ? "linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)"
              : "transparent",
          }}
        >
          {/* Log content */}
          {showRaw ? (
            <div
              className="text-[12px] leading-relaxed whitespace-pre-wrap break-all select-text font-mono"
              style={{ color: "var(--mocha-text)" }}
            >
              {highlightMatches(rawLog)}
            </div>
          ) : (
            <SmartContent
              content={content}
              tokens={tokens}
              onShowRaw={() => setShowRaw(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * LogbookView - Full-page logbook reading experience
 */
export function LogbookView({
  story,
  allStories,
  onClose,
  onMoveToStory,
  onDeleteStory,
  onRenameStory,
  onJumpToSource,
  scrollToHash,
  initialRawHash,
  onScrollComplete,
}: LogbookViewProps) {
  // Filter out current story for "Move to" options
  const otherStories = useMemo(
    () => allStories.filter((s) => s.id !== story?.id),
    [allStories, story?.id],
  );
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(story?.name || "");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrolledToInitialHash = useRef(false);

  // Sort logs by timestamp descending (newest first) to match the log stream view
  // Filter out minimized entries
  const minimizedSet = useMemo(
    () => new Set(story?.minimizedHashes || []),
    [story?.minimizedHashes],
  );

  const storyLogs = useMemo(() => {
    const entries = (story?.entries || []).filter(
      (e) => !e.hash || !minimizedSet.has(e.hash),
    );
    return [...entries].sort((a, b) => {
      const timestampDiff = (b.timestamp ?? 0) - (a.timestamp ?? 0);
      if (timestampDiff !== 0) return timestampDiff;
      return (b.sortIndex ?? 0) - (a.sortIndex ?? 0);
    });
  }, [story?.entries, minimizedSet]);

  const minimizedCount = minimizedSet.size;
  const [showMinimized, setShowMinimized] = useState(false);

  // Minimized entries (for restore view)
  const minimizedLogs = useMemo(() => {
    if (!showMinimized) return [];
    const entries = (story?.entries || []).filter(
      (e) => e.hash && minimizedSet.has(e.hash),
    );
    return [...entries].sort((a, b) => {
      const timestampDiff = (b.timestamp ?? 0) - (a.timestamp ?? 0);
      if (timestampDiff !== 0) return timestampDiff;
      return (b.sortIndex ?? 0) - (a.sortIndex ?? 0);
    });
  }, [story?.entries, minimizedSet, showMinimized]);

  // Removing animation state
  const [removingHash, setRemovingHash] = useState<string | null>(null);

  // Handle minimize with animation
  const handleMinimize = useCallback(
    (hash: string) => {
      const card = cardRefs.current.get(hash);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      setRemovingHash(hash);

      setTimeout(() => {
        useStoryStore.getState().minimizeInStory(hash);
        setRemovingHash(null);
      }, 500);
    },
    [],
  );

  const handleRestore = useCallback((hash: string) => {
    useStoryStore.getState().restoreInStory(hash);
  }, []);

  // Update edit name when story changes
  useEffect(() => {
    setEditName(story?.name || "");
  }, [story?.name]);

  // Keyboard shortcut: Cmd/Ctrl+G to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to close
      if (e.key === "Escape" && !searchFocused && !isEditing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchFocused, isEditing, onClose]);

  // Scroll to initial entry on mount
  useEffect(() => {
    if (scrollToHash && !scrolledToInitialHash.current) {
      // Wait for cards to render
      setTimeout(() => {
        const card = cardRefs.current.get(scrollToHash);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          scrolledToInitialHash.current = true;
          onScrollComplete?.();
        }
      }, 100);
    }
  }, [scrollToHash, onScrollComplete]);

  // Find matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const matches: { logHash: string; logIndex: number }[] = [];

    try {
      const regex = isRegex
        ? new RegExp(searchQuery, "gi")
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

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
        card.scrollIntoView({ behavior: "smooth", block: "center" });
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
      setCurrentMatchIndex(
        (prev) => (prev - 1 + searchMatches.length) % searchMatches.length,
      );
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

  const [exportFeedback, setExportFeedback] = useState(false);

  const handleExport = useCallback(async () => {
    if (!story || storyLogs.length === 0) return;

    const content = storyLogs.map((log) => log.data).join("\n");
    const defaultName = `${story.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.txt`;

    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "Text Files", extensions: ["txt"] }],
    });

    if (path) {
      const success = await exportFile(path, content);
      if (success) {
        setExportFeedback(true);
        setTimeout(() => setExportFeedback(false), 2000);
      }
    }
  }, [story, storyLogs]);

  const handleRename = useCallback(() => {
    if (story && editName.trim() && editName !== story.name) {
      onRenameStory(story.id, editName.trim());
    }
    setIsEditing(false);
  }, [story, editName, onRenameStory]);

  const isEmpty = storyLogs.length === 0;

  if (!story) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: "var(--mocha-surface)" }}
      >
        <div className="text-center">
          <BookOpen
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "var(--mocha-text-muted)" }}
          />
          <p
            className="text-lg font-medium"
            style={{ color: "var(--mocha-text)" }}
          >
            No logbook selected
          </p>
          <button
            onClick={onClose}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg mx-auto transition-colors"
            style={{
              background: "var(--mocha-surface-hover)",
              color: "var(--mocha-text-secondary)",
            }}
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0 h-full"
      style={{ background: "var(--mocha-surface)" }}
    >
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3 flex items-center justify-between"
        style={{
          background: "var(--mocha-surface)",
          borderBottom: "1px solid var(--mocha-border)",
        }}
      >
        {/* Left side - title */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--mocha-accent) 0%, #c4854a 100%)",
              boxShadow: "0 2px 8px var(--mocha-accent-glow)",
            }}
          >
            <BookOpen
              className="w-4 h-4"
              style={{ color: "var(--mocha-bg)" }}
            />
          </div>

          <div>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setEditName(story.name);
                    setIsEditing(false);
                  }
                }}
                className="text-sm font-semibold font-display px-2 py-1 rounded-lg border outline-none"
                style={{
                  background: "var(--mocha-surface-raised)",
                  color: "var(--mocha-text)",
                  borderColor: "var(--mocha-accent)",
                }}
                autoFocus
              />
            ) : (
              <h1
                className="text-sm font-semibold font-display cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: "var(--mocha-text)" }}
                onClick={() => setIsEditing(true)}
                title="Click to rename"
              >
                {story.name}
              </h1>
            )}
            <p
              className="text-[10px]"
              style={{ color: "var(--mocha-text-muted)" }}
            >
              {storyLogs.length} {storyLogs.length === 1 ? "entry" : "entries"}
            </p>
          </div>
        </div>

        {/* Center - Search */}
        <div className="flex items-center gap-2">
          <div
            className="relative flex items-center transition-all duration-300"
            style={{
              width: searchFocused || searchQuery ? "280px" : "200px",
            }}
          >
            <Search
              className="absolute left-3 w-4 h-4 pointer-events-none transition-colors duration-200"
              style={{
                color: searchFocused
                  ? "var(--mocha-accent)"
                  : "var(--mocha-text-muted)",
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.shiftKey ? goToPrevMatch() : goToNextMatch();
                }
                if (e.key === "Escape") {
                  setSearchQuery("");
                  searchInputRef.current?.blur();
                }
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search logbook..."
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl font-mono"
              style={{
                background: searchFocused
                  ? "var(--mocha-surface-raised)"
                  : "var(--mocha-surface-hover)",
                border: `1px solid ${searchFocused ? "var(--mocha-accent)" : "var(--mocha-border)"}`,
                color: "var(--mocha-text)",
                boxShadow: searchFocused
                  ? "0 0 0 3px var(--mocha-accent-muted), 0 4px 16px rgba(0,0,0,0.3)"
                  : "none",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Search logbook (⌘G). Enter for next, Shift+Enter for previous"
            />

            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 p-1 rounded-md transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{ color: "var(--mocha-text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              !searchFocused && (
                <div
                  className="absolute right-3 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: "var(--mocha-surface-active)",
                    color: "var(--mocha-text-muted)",
                  }}
                >
                  <Command className="w-2.5 h-2.5" />
                  <span>G</span>
                </div>
              )
            )}
          </div>

          {/* Regex toggle */}
          <button
            onClick={() => setIsRegex(!isRegex)}
            className="px-3 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all duration-200"
            style={{
              background: isRegex
                ? "linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)"
                : "var(--mocha-surface-hover)",
              border: `1px solid ${isRegex ? "var(--mocha-accent)" : "var(--mocha-border)"}`,
              color: isRegex ? "var(--mocha-bg)" : "var(--mocha-text-muted)",
              boxShadow: isRegex
                ? "0 2px 12px var(--mocha-accent-glow)"
                : "none",
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
                background: "var(--mocha-surface-raised)",
                border: "1px solid var(--mocha-border)",
                borderRadius: "12px",
                padding: "4px",
              }}
            >
              <button
                onClick={goToPrevMatch}
                className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{
                  color:
                    searchMatches.length > 0
                      ? "var(--mocha-text-secondary)"
                      : "var(--mocha-text-muted)",
                }}
                title="Previous match (Shift+Enter)"
                disabled={searchMatches.length === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span
                className="text-xs tabular-nums min-w-[3.5rem] text-center font-mono font-medium px-1"
                style={{
                  color:
                    searchMatches.length > 0
                      ? "var(--mocha-text-secondary)"
                      : "var(--mocha-error)",
                }}
              >
                {searchMatches.length > 0
                  ? `${currentMatchIndex + 1}/${searchMatches.length}`
                  : "0/0"}
              </span>

              <button
                onClick={goToNextMatch}
                className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[var(--mocha-surface-active)]"
                style={{
                  color:
                    searchMatches.length > 0
                      ? "var(--mocha-text-secondary)"
                      : "var(--mocha-text-muted)",
                }}
                title="Next match (Enter)"
                disabled={searchMatches.length === 0}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right side - actions */}
        <div className="flex items-center gap-1">
          {!isEmpty && (
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                background: "var(--mocha-surface-hover)",
                color: "var(--mocha-text-secondary)",
              }}
              title="Export logbook"
            >
              {exportFeedback ? (
                <Check
                  className="w-4 h-4"
                  style={{ color: "var(--mocha-success)" }}
                />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          )}
          {!isEmpty && (
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg transition-all hover:scale-105"
              style={{
                background: "var(--mocha-surface-hover)",
                color: "var(--mocha-text-secondary)",
              }}
              title="Copy all entries"
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
          )}
          <button
            onClick={onDeleteStory}
            className="p-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              background: "var(--mocha-surface-hover)",
              color: "var(--mocha-text-secondary)",
            }}
            title="Delete logbook"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div
            className="w-px h-5 mx-1"
            style={{ background: "var(--mocha-border)" }}
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              background: "var(--mocha-surface-hover)",
              color: "var(--mocha-text-secondary)",
            }}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pattern manager */}
      <div
        className="shrink-0 px-6 py-3"
        style={{
          background: "var(--mocha-surface)",
          borderBottom: "1px solid var(--mocha-border-subtle)",
        }}
      >
        <PatternManager
          patterns={story.patterns || []}
          onPatternsChange={(patterns) => {
            useStoryStore.getState().setStoryPatterns(story.id, patterns);
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-8 px-6 logbook-glass">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div
              className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{
                background: "var(--mocha-surface-raised)",
                border: "1px solid var(--mocha-border)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <BookOpen
                className="w-12 h-12"
                style={{ color: "var(--mocha-text-muted)" }}
              />
            </div>
            <p
              className="text-xl font-semibold mb-2 font-display"
              style={{ color: "var(--mocha-text)" }}
            >
              Empty Logbook
            </p>
            <p
              className="text-sm mb-6"
              style={{ color: "var(--mocha-text-muted)" }}
            >
              Click on log lines in the log viewer to add entries
            </p>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
              style={{
                background: "var(--mocha-surface-raised)",
                color: "var(--mocha-text)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                border: "1px solid var(--mocha-border)",
              }}
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {storyLogs.map((log, index) => {
              const prevLog = index > 0 ? storyLogs[index - 1] : undefined;
              const showDivider =
                index === 0 ||
                shouldShowDivider(prevLog?.timestamp, log.timestamp);

              return (
                <div key={log.hash}>
                  {showDivider && log.timestamp && (
                    <TimePeriodDivider
                      timestamp={log.timestamp}
                      isFirst={index === 0}
                    />
                  )}
                  <LogbookEvidenceCard
                    log={log}
                    index={index}
                    onRemove={() => log.hash && handleMinimize(log.hash)}
                    onJumpToSource={
                      onJumpToSource && log.hash
                        ? () => onJumpToSource(log)
                        : undefined
                    }
                    onMoveToStory={
                      log.hash
                        ? (toStoryId) => onMoveToStory(log.hash!, toStoryId)
                        : undefined
                    }
                    otherStories={otherStories}
                    searchQuery={searchQuery}
                    isRegex={isRegex}
                    isCurrentMatch={log.hash === currentMatchHash}
                    isRemoving={log.hash === removingHash}
                    cardRef={(el) => {
                      if (el && log.hash) {
                        cardRefs.current.set(log.hash, el);
                      }
                    }}
                    initialShowRaw={log.hash === initialRawHash}
                  />
                </div>
              );
            })}

            {/* Minimized entries indicator */}
            {minimizedCount > 0 && (
              <div className="mx-auto max-w-4xl mt-6 mb-2">
                <button
                  onClick={() => setShowMinimized(!showMinimized)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 hover:scale-[1.01]"
                  style={{
                    background: "var(--mocha-surface-hover)",
                    border: "1px solid var(--mocha-border)",
                    color: "var(--mocha-text-muted)",
                  }}
                >
                  <span>{showMinimized ? "Hide" : "Show"} {minimizedCount} minimized {minimizedCount === 1 ? "entry" : "entries"}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${showMinimized ? "rotate-180" : ""}`}
                  />
                </button>

                {showMinimized && (
                  <div className="mt-3 space-y-2 opacity-60">
                    {minimizedLogs.map((log, index) => (
                      <div
                        key={log.hash}
                        className="relative mx-auto max-w-4xl rounded-xl overflow-hidden"
                        style={{
                          background: "var(--mocha-surface-hover)",
                          border: "1px solid var(--mocha-border)",
                        }}
                      >
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="text-[10px] font-mono font-bold tabular-nums shrink-0"
                              style={{ color: "var(--mocha-text-muted)" }}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span
                              className="text-xs font-mono truncate"
                              style={{ color: "var(--mocha-text-muted)" }}
                            >
                              {log.parsed?.content || log.data}
                            </span>
                          </div>
                          <button
                            onClick={() => log.hash && handleRestore(log.hash)}
                            className="shrink-0 ml-3 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                            style={{
                              background: "var(--mocha-accent-muted)",
                              color: "var(--mocha-accent)",
                              border: "1px solid var(--mocha-accent)",
                            }}
                          >
                            Restore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
