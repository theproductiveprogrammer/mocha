import { memo, useCallback, useState, useEffect, useMemo } from "react";
import { Bookmark, Copy, Check, X } from "lucide-react";
import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { LogEntry, LogToken, LogLevel } from "../types";
import { tokenizeContent } from "../parser";
import { Tooltip } from "./Tooltip";

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

// Custom JSON viewer styles for inline expansion (same as logbook)
const inlineJsonStyles = {
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

// Service colors - refined palette
const SERVICE_COLORS: Record<string, string> = {
  core: "var(--badge-core)",
  app: "var(--badge-app)",
  platform: "var(--badge-platform)",
  runner: "var(--badge-runner)",
  iwf: "var(--badge-iwf)",
  rag: "var(--badge-rag)",
  transcriber: "var(--badge-transcriber)",
  tracker: "var(--badge-tracker)",
  verify: "var(--badge-verify)",
  pixel: "var(--badge-pixel)",
  api: "var(--mocha-info)",
  controller: "var(--badge-core)",
  service: "var(--badge-app)",
  helper: "var(--badge-platform)",
  scheduler: "var(--badge-tracker)",
  state: "var(--badge-verify)",
  notification: "var(--badge-iwf)",
  unipile: "var(--badge-rag)",
  openai: "var(--badge-transcriber)",
  mcp: "var(--badge-pixel)",
};

function getServiceColor(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, color] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return "var(--badge-default)";
}

/**
 * Get row styling based on log level
 */
function getRowStyle(effectiveLevel?: LogLevel): {
  bg: string;
  bgHover: string;
  border: string;
  signal: string;
} {
  if (effectiveLevel === "ERROR") {
    return {
      bg: "var(--mocha-error-bg)",
      bgHover: "var(--mocha-error-bg-hover)",
      border: "var(--mocha-error)",
      signal: "var(--mocha-error)",
    };
  }
  if (effectiveLevel === "WARN") {
    return {
      bg: "var(--mocha-warning-bg)",
      bgHover: "rgba(255, 217, 61, 0.1)",
      border: "var(--mocha-warning)",
      signal: "var(--mocha-warning)",
    };
  }
  return {
    bg: "transparent",
    bgHover: "var(--mocha-surface-hover)",
    border: "transparent",
    signal: "var(--mocha-text-faint)",
  };
}

// Known source file extensions for detecting file paths vs class names
const SOURCE_EXTENSIONS =
  /\.(java|kt|scala|groovy|py|js|ts|tsx|jsx|rb|go|rs|c|cpp|hpp|cs|swift|php|sh)$/i;
// Pattern for [SourceFile.ext:lineNum] suffix with known extensions
const SOURCE_FILE_SUFFIX =
  /\s*\[([^\]]+)\.(java|kt|scala|groovy|py|js|ts|tsx|jsx|rb|go|rs|c|cpp|hpp|cs|swift|php|sh):(\d+)\]$/i;

/**
 * Get short service name from log entry
 */
export function getServiceName(log: LogEntry): string {
  if (log.parsed?.logger) {
    const logger = log.parsed.logger;

    // Check for [SourceFile.ext:lineNum] suffix - only strip if it's a known source extension
    const suffixMatch = logger.match(SOURCE_FILE_SUFFIX);
    if (suffixMatch) {
      // Return just the filename without extension
      return suffixMatch[1];
    }

    // Strip line number suffix (e.g., ":123")
    const withoutLineNum = logger.split(":")[0];

    // Check if the whole thing is a source file path (has known extension)
    if (SOURCE_EXTENSIONS.test(withoutLineNum)) {
      // Get filename (handle paths)
      const filename = withoutLineNum.includes("/")
        ? withoutLineNum.split("/").pop() || withoutLineNum
        : withoutLineNum;
      // Remove extension
      return filename.replace(SOURCE_EXTENSIONS, "");
    }

    // Standard logger: com.example.ClassName → ClassName
    const parts = withoutLineNum.split(".");
    return parts[parts.length - 1] || withoutLineNum;
  }
  return log.name;
}

/**
 * Smart abbreviation for long service names
 */
function getServiceAbbrev(name: string): string {
  if (name.length <= 14) return name;

  const parts = name.split(/(?=[A-Z])/).filter((p) => p.length > 0);
  const suffixes = [
    "Service",
    "Controller",
    "Helper",
    "Logic",
    "Scheduler",
    "Manager",
    "Handler",
    "Processor",
  ];
  const cleanParts = parts.filter((p) => !suffixes.includes(p));

  if (cleanParts.length === 0) {
    return name.slice(0, 12) + "…";
  }

  if (cleanParts.length === 1) {
    return cleanParts[0].slice(0, 14) + (cleanParts[0].length > 14 ? "…" : "");
  }

  let result = "";
  for (const part of cleanParts) {
    if (result.length + part.length <= 14) {
      result += part;
    } else {
      break;
    }
  }

  return result || name.slice(0, 12) + "…";
}

/**
 * Token rendering with syntax highlighting
 */
function TokenSpan({
  token,
  isCurrentMatch,
}: {
  token: LogToken;
  isCurrentMatch?: boolean;
}) {
  const getTokenStyle = (): React.CSSProperties => {
    switch (token.type) {
      case "search.match":
        return {
          background: isCurrentMatch
            ? "var(--mocha-accent)"
            : "var(--mocha-accent-muted)",
          color: isCurrentMatch ? "var(--mocha-bg)" : "var(--mocha-accent)",
          padding: "0 2px",
          borderRadius: "2px",
          fontWeight: 500,
        };
      case "marker.error":
        return { color: "var(--mocha-error)", fontWeight: 600 };
      case "marker.warn":
        return { color: "var(--mocha-warning)", fontWeight: 600 };
      case "marker.info":
        return { color: "var(--mocha-text-muted)" };
      case "url":
        return {
          color: "var(--mocha-info)",
          textDecoration: "underline",
          textDecorationColor: "var(--mocha-info-muted)",
        };
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
 * Tokenized content renderer
 */
function TokenizedContent({
  tokens,
  isCurrentMatch,
}: {
  tokens: LogToken[];
  isCurrentMatch?: boolean;
}) {
  return (
    <>
      {tokens.map((token, i) => (
        <TokenSpan key={i} token={token} isCurrentMatch={isCurrentMatch} />
      ))}
    </>
  );
}

/**
 * Expanded content view with smart content and JSON rendering
 */
function ExpandedContent({
  content,
  tokens,
  onShowRaw,
  showRaw,
}: {
  content: string;
  tokens: LogToken[];
  onShowRaw: () => void;
  showRaw: boolean;
}) {
  const { firstLine, importantLines, hiddenCount, totalLines } = useMemo(
    () => extractImportantLines(content),
    [content],
  );

  const isMultiLine = totalLines > 1;
  const hasImportantLines = importantLines.length > 0;

  // For raw mode, show the full content
  if (showRaw) {
    return (
      <div
        className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-all"
        style={{ color: "var(--mocha-text)" }}
      >
        {content}
      </div>
    );
  }

  // Single line - render with JSON expansion
  if (!isMultiLine) {
    return (
      <div
        className="text-[12px] leading-relaxed font-mono"
        style={{ color: "var(--mocha-text)", wordBreak: "break-word" }}
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
                    background: "var(--mocha-surface-hover)",
                    border: "1px solid var(--mocha-border)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <JsonView
                    data={parsed}
                    shouldExpandNode={(level) => level < 2}
                    style={inlineJsonStyles}
                  />
                </div>
              );
            } catch {
              // Parse failed, render as text
            }
          }
          return <TokenSpan key={i} token={token} />;
        })}
      </div>
    );
  }

  // Multi-line content - show first line with JSON, then important lines
  const firstLineTokens = tokenizeContent(firstLine).tokens;

  return (
    <div className="font-mono" style={{ color: "var(--mocha-text)" }}>
      {/* First line with JSON rendering */}
      <div
        className="text-[12px] leading-relaxed"
        style={{ wordBreak: "break-word" }}
      >
        {firstLineTokens.map((token, i) => {
          if (token.type === "json") {
            try {
              const parsed = JSON.parse(token.text);
              return (
                <div
                  key={i}
                  className="my-2 p-2.5 rounded-lg text-[11px]"
                  style={{
                    background: "var(--mocha-surface-hover)",
                    border: "1px solid var(--mocha-border)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <JsonView
                    data={parsed}
                    shouldExpandNode={(level) => level < 2}
                    style={inlineJsonStyles}
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

      {/* Important lines (stack traces, exceptions) */}
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

      {/* Hidden lines indicator */}
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
 * Highlight search matches in tokens
 */
function highlightSearchInTokens(
  tokens: LogToken[],
  searchQuery: string,
  isRegex: boolean,
): LogToken[] {
  if (!searchQuery?.trim()) return tokens;

  try {
    const regex = isRegex
      ? new RegExp(`(${searchQuery})`, "gi")
      : new RegExp(
          `(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
          "gi",
        );

    const result: LogToken[] = [];

    for (const token of tokens) {
      regex.lastIndex = 0;
      const parts = token.text.split(regex);

      for (const part of parts) {
        if (!part) continue;
        regex.lastIndex = 0;
        if (regex.test(part)) {
          result.push({ text: part, type: "search.match" });
        } else {
          result.push({ text: part, type: token.type });
        }
        regex.lastIndex = 0;
      }
    }

    return result;
  } catch {
    return tokens;
  }
}

export interface LogLineProps {
  log: LogEntry;
  isInStory: boolean;
  isManuallyAdded?: boolean;
  isContinuation: boolean;
  isLastInGroup: boolean;
  onToggleStory: (log: LogEntry) => void;
  searchQuery?: string;
  searchIsRegex?: boolean;
  isCurrentMatch?: boolean;
  isFlashing?: boolean;
}

function LogLineComponent({
  log,
  isInStory,
  isManuallyAdded,
  isContinuation,
  isLastInGroup,
  onToggleStory,
  searchQuery,
  searchIsRegex,
  isCurrentMatch,
  isFlashing,
}: LogLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const serviceName = getServiceName(log);
  const serviceAbbrev = getServiceAbbrev(serviceName);
  const serviceColor = getServiceColor(serviceName);

  const content = log.parsed?.content || log.data;
  const contentLines = content.split("\n");
  const firstLine = contentLines[0];
  const previewLines = contentLines.slice(1, 3); // 2nd and 3rd lines
  const additionalLineCount = contentLines.length - 3; // Lines beyond first 3

  const { tokens, detectedLevel } = tokenizeContent(firstLine);
  const fullContentTokens = useMemo(
    () => tokenizeContent(content).tokens,
    [content],
  );

  const effectiveLevel = log.parsed?.level || detectedLevel;
  const rowStyle = getRowStyle(effectiveLevel);

  // Expansion is determined by: in story AND manually added
  // No separate isExpanded state needed
  const isExpanded = isInStory && isManuallyAdded;

  // Reset showRaw when removed from story
  useEffect(() => {
    if (!isInStory) {
      setShowRaw(false);
    }
  }, [isInStory]);

  // Simple click handler - just toggles story membership
  const handleClick = useCallback(() => {
    if (log.hash) {
      onToggleStory(log);
    }
  }, [log, onToggleStory]);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(log.data);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [log.data],
  );

  const displayTokens = searchQuery
    ? highlightSearchInTokens(tokens, searchQuery, searchIsRegex ?? false)
    : tokens;

  const displayTimestamp = log.parsed?.timestamp
    ? log.parsed.timestamp.includes(" ")
      ? log.parsed.timestamp.split(" ")[1]?.slice(0, 8)
      : log.parsed.timestamp.slice(0, 8)
    : null;

  // Background based on state priority
  // Selection uses border, not background, to preserve error/warning colors
  const getBackgroundStyle = () => {
    if (isFlashing) return "var(--mocha-accent-muted)";
    if (isCurrentMatch) return "var(--mocha-accent-muted)";
    // For in-story lines, keep the original error/warning background
    if (isHovered) return rowStyle.bgHover;
    return rowStyle.bg;
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        group relative flex cursor-pointer transition-all duration-150
        ${isCurrentMatch ? "ring-1 ring-inset ring-[var(--mocha-accent)]" : ""}
        ${isFlashing ? "animate-flash-highlight" : ""}
        ${isInStory && isManuallyAdded ? "ring-1 ring-inset ring-[var(--mocha-info)]" : ""}
      `}
      style={{
        background: getBackgroundStyle(),
        borderBottom: isLastInGroup
          ? "1px solid var(--mocha-border-subtle)"
          : "none",
      }}
      data-testid="log-line"
      data-hash={log.hash}
      data-in-story={isInStory}
    >
      {/* Signal line - colored left border */}
      {/* Preserve error/warning signal even when in story */}
      <div
        className="w-[3px] shrink-0 transition-all duration-150"
        style={{
          background:
            effectiveLevel === "ERROR" || effectiveLevel === "WARN"
              ? rowStyle.signal
              : isInStory && isManuallyAdded
                ? "var(--mocha-info)"
                : isInStory && !isManuallyAdded
                  ? "color-mix(in srgb, var(--mocha-info) 40%, transparent)"
                  : isHovered
                    ? rowStyle.signal
                    : "transparent",
          boxShadow:
            effectiveLevel === "ERROR"
              ? "0 0 6px var(--mocha-error-glow)"
              : effectiveLevel === "WARN"
                ? "0 0 4px var(--mocha-warning-glow)"
                : isInStory && isManuallyAdded
                  ? "0 0 8px var(--mocha-selection-glow)"
                  : "none",
        }}
      />

      {/* Left column: timestamp + service badge */}
      <div
        className={`w-32 shrink-0 px-3 flex flex-col justify-center items-start gap-1 ${
          isContinuation ? "py-0.5" : "py-2"
        }`}
        style={{
          borderRight: "1px solid var(--mocha-border-subtle)",
        }}
      >
        {!isContinuation && (
          <>
            {displayTimestamp && (
              <span
                className="font-mono text-[10px] tabular-nums tracking-wide"
                style={{ color: "var(--mocha-text-muted)" }}
              >
                {displayTimestamp}
              </span>
            )}
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-full transition-all"
              style={{
                background: `color-mix(in srgb, ${serviceColor} 12%, transparent)`,
                color: serviceColor,
                border: `1px solid color-mix(in srgb, ${serviceColor} 20%, transparent)`,
              }}
              title={serviceName}
            >
              {serviceAbbrev}
            </span>
          </>
        )}
      </div>

      {/* Right column: log content */}
      <div
        className={`flex-1 min-w-0 px-4 font-mono text-[12px] leading-relaxed flex flex-col ${
          isContinuation ? "py-0.5" : "py-2"
        }`}
        style={{ color: "var(--mocha-text)" }}
      >
        {isExpanded ? (
          /* Expanded view with full content and JSON rendering */
          <div className="flex-1">
            {/* Header row with controls */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {displayTimestamp && (
                  <span
                    className="text-[10px] tabular-nums font-mono"
                    style={{ color: "var(--mocha-text-muted)" }}
                  >
                    {displayTimestamp}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRaw(!showRaw);
                  }}
                  className="text-[9px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                  style={{
                    background: showRaw
                      ? "var(--mocha-info-muted)"
                      : "var(--mocha-surface-active)",
                    color: showRaw
                      ? "var(--mocha-info)"
                      : "var(--mocha-text-muted)",
                  }}
                >
                  RAW
                </button>
              </div>
              <div className="flex items-center gap-1">
                {/* Bookmark indicator - shows this is in logbook */}
                <Bookmark
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--mocha-info)" }}
                  fill="currentColor"
                />
                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
                  style={{
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
                {/* Collapse/Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStory(log);
                  }}
                  className="p-1.5 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
                  style={{ color: "var(--mocha-text-muted)" }}
                  title="Collapse and remove from logbook"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Expanded content */}
            <ExpandedContent
              content={content}
              tokens={fullContentTokens}
              onShowRaw={() => setShowRaw(true)}
              showRaw={showRaw}
            />
          </div>
        ) : (
          /* Collapsed view - original compact display */
          <div className="flex items-start">
            <Tooltip content={log.data} className="flex-1 min-w-0">
              {/* First line */}
              <div className="truncate">
                <TokenizedContent
                  tokens={displayTokens}
                  isCurrentMatch={isCurrentMatch}
                />
              </div>

              {/* Preview lines for multi-line content */}
              {previewLines.length > 0 && (
                <div
                  className="mt-1 pl-4 text-[10px] font-mono space-y-0.5"
                  style={{ color: "var(--mocha-text-muted)" }}
                >
                  {previewLines.map((line, i) => (
                    <div key={i} className="truncate">
                      {line || "\u00A0"}
                    </div>
                  ))}
                  {additionalLineCount > 0 && (
                    <span
                      className="text-[9px] inline-block mt-0.5"
                      style={{ color: "var(--mocha-text-muted)", opacity: 0.7 }}
                    >
                      +{additionalLineCount} more
                    </span>
                  )}
                </div>
              )}
            </Tooltip>

            {/* Action buttons - appear on hover */}
            <div
              className={`flex items-center gap-1 ml-3 shrink-0 transition-opacity duration-150 ${
                isHovered ? "opacity-100" : "opacity-0"
              }`}
            >
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
                style={{
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

              {/* Bookmark/Story button */}
              <button
                onClick={handleClick}
                className="p-1.5 rounded-md transition-all hover:bg-[var(--mocha-surface-active)]"
                style={{
                  color: isInStory
                    ? "var(--mocha-info)"
                    : "var(--mocha-text-muted)",
                }}
                title={isInStory ? "Remove from logbook" : "Add to logbook"}
              >
                <Bookmark
                  className="w-3.5 h-3.5"
                  fill={isInStory ? "currentColor" : "none"}
                />
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export const LogLine = memo(LogLineComponent);
