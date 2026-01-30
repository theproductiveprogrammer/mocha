/**
 * Mocha Log Viewer - Log Parser
 *
 * Parses raw log files into structured LogEntry objects.
 * Supports multiple log formats and continuation line merging.
 */

import murmurhash from "murmurhash";
import type {
  LogEntry,
  ParsedLogLine,
  LogLevel,
  ApiCallInfo,
  ParsedLogFileResult,
  LogToken,
  TokenType,
  TokenizeResult,
} from "./types";

// ============================================================================
// Log Pattern Interface
// ============================================================================

interface LogPattern {
  name: string;
  parse: (line: string) => ParsedLogLine | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize log level (e.g., WARNING -> WARN)
 */
function normalizeLevel(level: string): LogLevel {
  const upper = level.toUpperCase();
  if (upper === "WARNING") return "WARN";
  return upper as LogLevel;
}

/**
 * Check if a line is ASCII art (high ratio of special characters)
 */
function isAsciiArt(line: string): boolean {
  const specialChars = line.match(/[|_/\\+\-=<>^~[\]{}()#*@!]/g);
  if (!specialChars) return false;
  return specialChars.length / line.length > 0.3;
}

/**
 * Check if a line is just a timestamp marker (metadata line, not actual log content)
 * These appear in some log formats as sorting keys or metadata
 */
function isTimestampOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  // Match lines that are just timestamps (with optional trailing content)
  // e.g., "2026-01-09 10:18:09.249" or "\t2026-01-09 10:18:09.249\t"
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3}\s*$/.test(trimmed);
}

/**
 * Check if a line is a continuation of the previous line
 */
export function isContinuationLine(line: string): boolean {
  if (!line) return false;
  // Don't treat timestamp-only lines as continuations - they should be skipped entirely
  // Check BEFORE stripping indentation since these lines may start with tabs
  if (isTimestampOnlyLine(line)) return false;
  // Check if line starts with date pattern (after trimming) - these are standalone log lines
  const trimmed = line.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  // Indented lines
  if (line.startsWith(" ") || line.startsWith("\t")) {
    return true;
  }
  // ASCII art lines
  if (isAsciiArt(line)) return true;
  // Short lines without timestamp prefix
  if (line.length < 20 && !/^\[/.test(line)) return true;

  // Java stack trace patterns (often not indented)
  // Exception class with message: java.net.SocketTimeoutException: timeout
  if (/^[a-z]+(\.[a-z]+)*\.[A-Z][A-Za-z]*(Exception|Error):/.test(trimmed))
    return true;
  // Caused by line
  if (/^Caused by:/.test(trimmed)) return true;
  // Stack frame: at java.base/java.lang.Thread.run(Thread.java:1583)
  if (/^at\s+[a-z]/.test(trimmed)) return true;
  // Truncated stack trace: ... 15 more
  if (/^\.\.\.\s+\d+\s+more/.test(trimmed)) return true;

  return false;
}

// ============================================================================
// Log Format Patterns
// ============================================================================

const patterns: LogPattern[] = [
  // 0. SalesBox Core Format (dual timestamp - ISO + human readable)
  // 2025-12-19T09:53:23.333Z 2025-12-19 09:53:23.110 [default-nioEventLoopGroup-1-5] INFO c.s.c.c.bizlogic.MCPController [MCPController.java:466] [default] - message
  {
    name: "salesbox-core",
    parse: (line: string): ParsedLogLine | null => {
      // Full format with [context]
      // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
      let match = line.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+[-–—]\s*(.*)$/i,
      );
      if (match) {
        return {
          timestamp: match[1],
          level: normalizeLevel(match[3]),
          logger: `${match[4]}:${match[5].split(":")[1]}`,
          content: match[6],
        };
      }

      // Simpler format without [context]
      match = line.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+[-–—]\s*(.*)$/i,
      );
      if (match) {
        return {
          timestamp: match[1],
          level: normalizeLevel(match[3]),
          logger: `${match[4]}:${match[5].split(":")[1]}`,
          content: match[6],
        };
      }

      // Even simpler - dual timestamp with just level and logger
      match = line.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+[-–—]\s*(.*)$/i,
      );
      if (match) {
        return {
          timestamp: match[1],
          level: normalizeLevel(match[3]),
          logger: match[4],
          content: match[5],
        };
      }

      return null;
    },
  },

  // 1. SalesBox App Format
  // 2025-12-19 05:32:17,405 33667971 [thread] INFO com.r2.util.SQSUtil - message
  // Note: There may be extra spaces before/after the level (e.g., "INFO  " with double space)
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  {
    name: "salesbox-app",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+\d+\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+[-–—]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[3]),
        logger: match[4],
        content: match[5],
      };
    },
  },

  // 2. IWF/Spring Format
  // [http-nio-3004-exec-5] WARN i.i.w.u.StateWaitForLeads [StateWaitForLeads.java:133] [default] - message
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  {
    name: "iwf-spring",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+[-–—]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        level: normalizeLevel(match[2]),
        logger: `${match[3]} [${match[4]}]`,
        content: match[5],
      };
    },
  },

  // 3. Logback with Source
  // 2025-12-18 08:21:56.203 [thread] LEVEL logger [Source.java:line] [context] - message
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  {
    name: "logback-with-source",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+[-–—]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[3]),
        logger: `${match[4]} [${match[5]}]`,
        content: match[6],
      };
    },
  },

  // 4. Logback Internal
  // 13:42:38,400 |-INFO in ch.qos.logback...AppenderAction - message
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  {
    name: "logback-internal",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{2}:\d{2}:\d{2}[,.]\d+)\s+\|-(ERROR|WARN|INFO|DEBUG|TRACE)\s+in\s+(\S+)\s+[-–—]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[2]),
        logger: match[3],
        content: match[4],
      };
    },
  },

  // 5. Maven Format (multiple patterns)
  {
    name: "maven",
    parse: (line: string): ParsedLogLine | null => {
      // [INFO] --- mn:3.5.4:run (default-cli) @ salesboxai-platform ---
      let match = line.match(
        /^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+---\s+(\S+)\s+@\s+(\S+)\s+---\s*$/i,
      );
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          logger: match[3],
          content: `--- ${match[2]} ---`,
        };
      }

      // [INFO] /path/to/File.java: warning message
      match = line.match(
        /^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+(\/[^:]+\.java):\s*(.*)$/i,
      );
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          logger: match[2],
          content: match[3],
        };
      }

      // [INFO] message (generic)
      match = line.match(/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+(.*)$/i);
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          content: match[2],
        };
      }

      return null;
    },
  },

  // 6. Logback Standard
  // 2025-12-19 13:15:41,545 WARN [c.r.u.d.RedashApiUtil:37] message
  {
    name: "logback",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+\[([^\]]+)\]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[2]),
        logger: match[3],
        content: match[4],
      };
    },
  },

  // 7. Bracketed Level
  // 2025-12-18 05:32:18.541 [INFO] message
  {
    name: "bracketed",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s*\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[2]),
        content: match[3],
      };
    },
  },

  // 8. Python Logging Format
  // 2026-01-21 09:04:43,296 - db.py - ERROR - message
  {
    name: "python-logging",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+-\s+(\S+)\s+-\s+(ERROR|WARN(?:ING)?|INFO|DEBUG)\s+-\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        logger: match[2],
        level: normalizeLevel(match[3]),
        content: match[4],
      };
    },
  },

  // 9. Standard Logback/Spring Boot Format (with thread)
  // 2026-01-22 12:22:32.735 [scheduled-executor-thread-2] INFO  c.s.c.s.ActivityProcessingScheduler - message
  // 2026-01-23 08:41:42.909 [main] ERROR io.micronaut.runtime.Micronaut - Error starting Micronaut server...
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  // Note: spacing after level can vary (single or multiple spaces)
  {
    name: "logback-with-thread",
    parse: (line: string): ParsedLogLine | null => {
      // Handle multi-line content: only match the first line for the pattern
      // The rest will be part of the content
      const firstLine = line.split("\n")[0];

      // Pattern: timestamp [thread] LEVEL logger - message
      // Match the structure on the first line only, content can extend to multiple lines
      const match = firstLine.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+[-–—]\s*(.*)$/i,
      );

      if (!match) return null;

      // Extract content from first line
      let content = match[5];

      // If the original line has multiple lines, append them to content
      if (line.includes("\n")) {
        const remainingLines = line.split("\n").slice(1);
        if (remainingLines.length > 0) {
          content = content + "\n" + remainingLines.join("\n");
        }
      }

      return {
        timestamp: match[1],
        level: normalizeLevel(match[3]),
        logger: match[4],
        content: content,
      };
    },
  },

  // 10. Simple Format (multiple patterns)
  // NOTE: This is a catch-all format and should remain near the end
  {
    name: "simple",
    parse: (line: string): ParsedLogLine | null => {
      // With level: 2025-12-18 05:32:18.541 INFO message
      let match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i,
      );
      if (match) {
        return {
          timestamp: match[1],
          level: normalizeLevel(match[2]),
          content: match[3],
        };
      }

      // Without level: 2025-12-18 05:32:18.541 message
      match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s+(.*)$/,
      );
      if (match) {
        return {
          timestamp: match[1],
          content: match[2],
        };
      }

      return null;
    },
  },

  // 11. Logback Time-Only
  // 13:15:39.047 [main] WARN c.s.platform.util.CryptKeyUtil - message
  // Note: dash separator can be hyphen (-), en dash (–), or em dash (—)
  {
    name: "logback-time-only",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{2}:\d{2}:\d{2}[,.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+[-–—]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[3]),
        logger: match[4],
        content: match[5],
      };
    },
  },

  // 12. Level Only (multiple patterns)
  {
    name: "level-only",
    parse: (line: string): ParsedLogLine | null => {
      // [INFO] message
      let match = line.match(
        /^\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i,
      );
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          content: match[2],
        };
      }

      // [service] ERROR message
      match = line.match(
        /^\[([^\]]+)\]\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i,
      );
      if (match) {
        return {
          level: normalizeLevel(match[2]),
          logger: match[1],
          content: match[3],
        };
      }

      // INFO message
      match = line.match(/^(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i);
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          content: match[2],
        };
      }

      return null;
    },
  },

  // 13. Genie/Rust Format
  // [2026-01-09][05:12:22][app_lib::core::setup][INFO] Installing extensions...
  {
    name: "genie-rust",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]\[([^\]]+)\]\[(ERROR|WARN|INFO|DEBUG|TRACE)\]\s*(.*)$/i,
      );
      if (!match) return null;
      return {
        timestamp: `${match[1]} ${match[2]}`,
        level: normalizeLevel(match[4]),
        logger: match[3],
        content: match[5],
      };
    },
  },

  // 14. Single ISO timestamp (for stack traces, simple logs)
  // 2025-12-19T09:53:52.155Z java.net.SocketTimeoutException: timeout
  // 2025-12-19T09:53:52.155Z at okio.SocketAsyncTimeout.newTimeoutException(JvmOkio.kt:147)
  {
    name: "iso-timestamp",
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?)\s+(.+)$/,
      );
      if (!match) return null;

      const content = match[2];
      // Detect if it's an exception/stack trace
      const isException = /Exception|Error|^\s*at\s/.test(content);

      return {
        timestamp: match[1],
        level: isException ? "ERROR" : undefined,
        content: content,
      };
    },
  },
];

// ============================================================================
// API Call Pattern Detection
// ============================================================================

/**
 * Parse API call information from log content
 */
export function parseApiCall(content: string): ApiCallInfo | undefined {
  // Outgoing GET no params: api call (no params) to https://api.example.com/users
  let match = content.match(/api call \(no params\) to (\S+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "GET",
      endpoint: match[1],
    };
  }

  // Outgoing GET with params: api call to https://api.example.com/users with {id: 1}
  match = content.match(/api call to (\S+) with (.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "GET",
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // Outgoing DELETE no params: api DELETE call (no params) to https://api.example.com/users/1
  match = content.match(/api DELETE call \(no params\) to (\S+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "DELETE",
      endpoint: match[1],
    };
  }

  // Outgoing DELETE with params: api DELETE call to https://api.example.com/users with {id: 1}
  match = content.match(/api DELETE call to (\S+) with (.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "DELETE",
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // POST with headers: api call -> https://api.example.com/users with [...]: {...}
  match = content.match(/api call -> (\S+) with \[([^\]]*)\]:\s*(.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "POST",
      endpoint: match[1],
      requestBody: match[3],
    };
  }

  // Multipart request: api multipart call -> https://api.example.com/upload with file: ...
  match = content.match(/api multipart call -> (\S+) with (.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "request",
      method: "POST",
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // HTTP status response: HTTP POST https://api.example.com/users -> 200 (45ms)
  match = content.match(
    /HTTP (GET|POST|PUT|DELETE|PATCH) (\S+) -> (\d+)(?: \((\d+m?s)\))?/i,
  );
  if (match) {
    return {
      direction: "outgoing",
      phase: "response",
      method: match[1].toUpperCase(),
      endpoint: match[2],
      status: parseInt(match[3], 10),
      timing: match[4],
    };
  }

  // GET response: api call /users {id: 1} response: {name: "John"}
  match = content.match(/api call (\S+) (\{[^}]*\}) response:\s*(.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "complete",
      method: "GET",
      endpoint: match[1],
      requestBody: match[2],
      responseBody: match[3],
    };
  }

  // POST response: api call -> /users with {...} -> response: {...}
  match = content.match(/api call -> (\S+) with (.+?) -> response:\s*(.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "complete",
      method: "POST",
      endpoint: match[1],
      requestBody: match[2],
      responseBody: match[3],
    };
  }

  // Multipart response: api multipart call -> /upload -> response: {...}
  match = content.match(/api multipart call -> (\S+) -> response:\s*(.+)/i);
  if (match) {
    return {
      direction: "outgoing",
      phase: "complete",
      method: "POST",
      endpoint: match[1],
      responseBody: match[2],
    };
  }

  // Incoming request: /api/users <- {...}
  match = content.match(/^(\S+) <- (.+)$/);
  if (match && match[1].startsWith("/")) {
    return {
      direction: "incoming",
      phase: "request",
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // Incoming response: /api/users -> {...}
  match = content.match(/^(\S+) -> (.+)$/);
  if (match && match[1].startsWith("/")) {
    return {
      direction: "incoming",
      phase: "response",
      endpoint: match[1],
      responseBody: match[2],
    };
  }

  // Complete incoming: /api/users <- {...} -> {...}
  match = content.match(/^(\S+) <- (.+?) -> (.+)$/);
  if (match && match[1].startsWith("/")) {
    return {
      direction: "incoming",
      phase: "complete",
      endpoint: match[1],
      requestBody: match[2],
      responseBody: match[3],
    };
  }

  return undefined;
}

// ============================================================================
// Main Parsing Functions
// ============================================================================

/**
 * Parse a single log line using all patterns
 */
export function parseLogLine(data: string): ParsedLogLine {
  // Strip trailing whitespace including \r (Windows line endings)
  const cleanData = data.replace(/\s+$/, "");

  for (const pattern of patterns) {
    const result = pattern.parse(cleanData);
    if (result) {
      // Try to detect API call info
      result.apiCall = parseApiCall(result.content);
      return result;
    }
  }
  // Fallback: return raw content
  // Debug unparsed lines
  if (/\d{4}-\d{2}-\d{2}.*ERROR|WARN|INFO/.test(cleanData)) {
    console.log(
      "[parser] UNPARSED:",
      JSON.stringify(cleanData.substring(0, 80)),
    );
    // Show char codes around the spaces after log level
    const levelMatch = cleanData.match(/(INFO|ERROR|WARN|DEBUG|TRACE)(\s+)/);
    if (levelMatch) {
      const spaces = levelMatch[2];
      console.log(
        "[parser] Spaces after level:",
        spaces.length,
        "chars:",
        [...spaces].map((c) => c.charCodeAt(0)),
      );
    }
  }
  return { content: cleanData };
}

/**
 * Normalize log entries by merging continuation lines
 */
export function normalize(logs: LogEntry[]): LogEntry[] {
  const result: LogEntry[] = [];

  for (const log of logs) {
    if (isContinuationLine(log.data) && result.length > 0) {
      // Merge with previous log
      const prev = result[result.length - 1];
      prev.data = prev.data + "\n" + log.data;
    } else {
      result.push({ ...log });
    }
  }

  return result;
}

/**
 * Generate unique hash for a log entry
 */
function generateHash(
  serviceName: string,
  content: string,
  index: number,
  existingHashes: Set<string>,
): string {
  const base = murmurhash.v3(`${serviceName}|${content}`).toString();
  if (existingHashes.has(base)) {
    return `${base}.<<${index}>>`;
  }
  return base;
}

/**
 * Get the last N lines from content efficiently
 * Avoids splitting the entire file into an array
 */
function getLastNLines(
  content: string,
  n: number,
): { lines: string[]; totalLines: number; truncated: boolean } {
  // Count total lines by counting newlines (fast)
  let totalLines = 1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") totalLines++;
  }

  if (totalLines <= n) {
    return { lines: content.split("\n"), totalLines, truncated: false };
  }

  // Find the start position for last N lines by scanning from the end
  let newlineCount = 0;
  let startPos = content.length;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i] === "\n") {
      newlineCount++;
      if (newlineCount === n) {
        startPos = i + 1;
        break;
      }
    }
  }

  return {
    lines: content.slice(startPos).split("\n"),
    totalLines,
    truncated: true,
  };
}

/**
 * Check if a line is a Grafana/Loki export header (should be skipped)
 * Header patterns:
 * - : "330 lines displayed"
 * - Total bytes processed: "4.34  MB"
 * - Common labels: {"filename":"/var/log/..."}
 */
function isGrafanaHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    /^:\s*"[\d,]+\s+lines?\s+displayed"$/i.test(trimmed) ||
    /^Total\s+bytes\s+processed:/i.test(trimmed) ||
    /^Common\s+labels:/i.test(trimmed)
  );
}

/**
 * Parse raw file lines into LogEntry array
 */
function parseFileLines(
  content: string,
  fileName: string,
  hashKey: string,
  filePath?: string,
): { logs: LogEntry[]; totalLines: number; truncated: boolean } {
  const maxLines = 2000;
  const {
    lines: linesToProcess,
    totalLines,
    truncated,
  } = getLastNLines(content, maxLines);

  const logs: LogEntry[] = [];
  const existingHashes = new Set<string>();

  for (let i = 0; i < linesToProcess.length; i++) {
    let line = linesToProcess[i];

    // Skip empty lines
    if (!line.trim()) continue;

    // Skip Grafana/Loki export header lines
    if (isGrafanaHeader(line)) continue;

    // Skip timestamp-only lines (metadata/sorting keys in some log formats)
    const trimmedLine = line.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3}\s*$/.test(trimmedLine))
      continue;

    // Handle tab-separated epoch format:
    // 1735123456789\t2025-12-25T10:30:00Z\t[INFO] Log message here
    // Also seen: 2026-01-09 10:18:09.249\t followed by the actual log line
    const tabParts = line.split("\t");
    let timestamp: number | undefined;

    if (tabParts.length >= 2) {
      // Check for 3-part Grafana/Loki format: epoch \t ISO_timestamp \t actual_log_line
      // Example: 1766138817990	2025-12-19T10:06:57.990Z	2025-12-19 10:06:57.799 [thread] INFO ...
      if (
        tabParts.length >= 3 &&
        /^\d{10,}$/.test(tabParts[0].trim()) &&
        /^\d{4}-\d{2}-\d{2}T/.test(tabParts[1].trim())
      ) {
        timestamp = parseInt(tabParts[0].trim(), 10);
        line = tabParts.slice(2).join("\t"); // Skip both epoch and ISO prefix
      }
      // Check if first part is epoch timestamp (10+ digits) - 2-part format
      else if (/^\d{10,}$/.test(tabParts[0].trim())) {
        timestamp = parseInt(tabParts[0].trim(), 10);
        line = tabParts.slice(1).join("\t");
      }
      // Check if first part is ISO date or timestamp-like
      else if (/^\d{4}-\d{2}-\d{2}/.test(tabParts[0].trim())) {
        // Try parsing as date
        const dateStr = tabParts[0].trim();
        // Replace space with T for ISO format, and comma with dot for milliseconds
        const parsed = Date.parse(dateStr.replace(" ", "T").replace(",", "."));
        if (!isNaN(parsed)) {
          const remainder = tabParts.slice(1).join("\t").trim();
          // Skip if remaining line is empty (timestamp-only metadata line)
          if (!remainder) continue;
          // Check if remainder looks like a log entry continuation (starts with digits + space)
          // If so, the tab was likely within a log line - keep original and just extract timestamp
          if (/^\d+\s+\[/.test(remainder)) {
            // Log line has tab between date and thread ID - keep original line
            timestamp = parsed;
            // Don't modify line - keep it intact for pattern matching
          } else {
            // Metadata timestamp followed by actual content
            timestamp = parsed;
            line = remainder;
          }
        }
        // If parsing failed, keep the original line intact
      }
    }

    // Generate fake timestamp based on line order if not extracted
    if (!timestamp) {
      timestamp = Date.now() - (linesToProcess.length - i) * 1000;
    }

    const hash = generateHash(hashKey, line, i, existingHashes);
    existingHashes.add(hash);

    logs.push({
      name: fileName,
      filePath,
      data: line,
      isErr: false,
      hash,
      timestamp,
    });
  }

  return { logs, totalLines, truncated };
}

/**
 * Check if a timestamp string includes a date component
 */
export function timestampHasDate(timestamp: string): boolean {
  if (!timestamp) return false;
  // Has date if it contains YYYY-MM-DD pattern
  return /\d{4}-\d{2}-\d{2}/.test(timestamp);
}

/**
 * Convert a parsed timestamp string to epoch milliseconds
 * Handles formats:
 * - "2025-12-19 09:53:23.110" (date + space + time)
 * - "2025-12-19 05:32:17,405" (comma for ms separator)
 * - "2025-12-19T09:53:52.155Z" (ISO format)
 * - "04:48:45,406" (time only - uses today's date)
 */
export function parseTimestampToEpoch(timestamp: string): number | null {
  if (!timestamp) return null;

  // Normalize: comma → dot for milliseconds
  let normalized = timestamp.replace(",", ".");

  // If it's time-only (no date), prepend today's date
  if (/^\d{2}:\d{2}:\d{2}/.test(normalized) && !normalized.includes("-")) {
    const today = new Date().toISOString().split("T")[0];
    normalized = `${today} ${normalized}`;
  }

  // Normalize: space → T for ISO format if needed
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(normalized)) {
    normalized = normalized.replace(/\s+/, "T");
  }

  const parsed = Date.parse(normalized);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Recalculate timestamp and sortIndex for an array of log entries.
 * Handles backfilling when first real timestamp is found.
 * Mutates the input array in place.
 */
export function recalculateTimestamps(logs: LogEntry[]): void {
  let lastTimestamp = 0;
  let lastSortIndex = 0;
  let firstRealTimestamp: number | null = null;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const parsed = log.parsed;

    const parsedEpoch = parsed?.timestamp
      ? parseTimestampToEpoch(parsed.timestamp)
      : null;
    const parsedHasDate = parsed?.timestamp
      ? timestampHasDate(parsed.timestamp)
      : false;
    const hasRealTimestamp = parsedEpoch !== null && parsedHasDate;

    if (hasRealTimestamp) {
      log.timestamp = parsedEpoch;
      log.sortIndex = 0;
      lastSortIndex = 0;

      if (firstRealTimestamp === null) {
        firstRealTimestamp = parsedEpoch;
        for (let j = 0; j < i; j++) {
          logs[j].timestamp = firstRealTimestamp;
          logs[j].sortIndex = j - i;
        }
      }
    } else {
      lastSortIndex++;
      log.sortIndex = lastSortIndex;

      if (firstRealTimestamp !== null) {
        log.timestamp = lastTimestamp;
      } else {
        log.timestamp = 0;
      }
    }
    lastTimestamp = log.timestamp || lastTimestamp;
  }
}

/**
 * Parse a complete log file into structured log entries
 * @param content - The file content
 * @param fileName - The filename (used for display)
 * @param filePath - Optional full file path (used for hash uniqueness in multi-file mode)
 */
export function parseLogFile(
  content: string,
  fileName: string,
  filePath?: string,
): ParsedLogFileResult {
  // Use filePath for hash generation to ensure uniqueness across files
  const hashKey = filePath || fileName;
  const {
    logs: rawLogs,
    totalLines,
    truncated,
  } = parseFileLines(content, fileName, hashKey, filePath);
  const normalized = normalize(rawLogs);

  // Parse each log line to extract structured data
  const logs: LogEntry[] = normalized.map((log) => ({
    ...log,
    parsed: parseLogLine(log.data),
  }));

  // Calculate timestamp and sortIndex for all logs
  recalculateTimestamps(logs);

  return { logs, totalLines, truncated };
}

// ============================================================================
// Content Tokenization
// ============================================================================

/**
 * Classify a token string into its type
 */
function classifyToken(text: string): TokenType {
  // URL - starts with / or http
  if (/^(https?:\/\/|\/[a-zA-Z])/.test(text)) return "url";

  // JSON - balanced braces (simple check)
  if (/^\{.*\}$/.test(text) || /^\[.*\]$/.test(text)) return "json";

  // Symbol - arrows, colons, equals
  if (/^(<-|->|←|→|=)$/.test(text)) return "symbol";

  // Data: pure numbers, or number followed by comma
  if (/^\d+,?$/.test(text)) return "data";

  // Default: message
  return "message";
}

/**
 * Find the end of a JSON block starting at position 0
 * Returns the index after the closing bracket, or -1 if not valid JSON
 */
function findJsonEnd(str: string): number {
  if (!str || (str[0] !== "{" && str[0] !== "[")) return -1;

  const endChar = str[0] === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === str[0]) {
      depth++;
    } else if (char === endChar) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}

/**
 * Tokenize a segment of content (non-marker parts)
 * Extracts JSON blocks first, then tokenizes the rest by whitespace
 */
function tokenizeSegment(segment: string): LogToken[] {
  const tokens: LogToken[] = [];
  let remaining = segment;

  while (remaining.length > 0) {
    // Find the first potential JSON start
    const jsonStart = remaining.search(/[{[]/);

    if (jsonStart === -1) {
      // No JSON found, tokenize the rest normally
      tokenizeSimpleParts(remaining, tokens);
      break;
    }

    // Tokenize text before JSON
    if (jsonStart > 0) {
      tokenizeSimpleParts(remaining.slice(0, jsonStart), tokens);
    }

    // Try to extract JSON
    const jsonStr = remaining.slice(jsonStart);
    const jsonEnd = findJsonEnd(jsonStr);

    if (jsonEnd > 0) {
      // Valid JSON found
      const jsonText = jsonStr.slice(0, jsonEnd);
      // Verify it parses
      try {
        JSON.parse(jsonText);
        tokens.push({ text: jsonText, type: "json" });
        remaining = jsonStr.slice(jsonEnd);
        continue;
      } catch {
        // Not valid JSON, treat the opening bracket as regular text
      }
    }

    // Not valid JSON, tokenize just the bracket and continue
    tokens.push({ text: remaining[jsonStart], type: "message" });
    remaining = remaining.slice(jsonStart + 1);
  }

  return tokens;
}

/**
 * Tokenize simple text parts (no JSON) by whitespace
 */
function tokenizeSimpleParts(text: string, tokens: LogToken[]): void {
  const parts = text.split(/(\s+)/);

  for (const part of parts) {
    if (!part) continue;

    // Whitespace
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, type: "message" });
      continue;
    }

    // Labels ending with colon
    if (part.endsWith(":") && part.length > 1) {
      tokens.push({ text: part, type: "message" });
      continue;
    }

    // Classify the token
    tokens.push({ text: part, type: classifyToken(part) });
  }
}

/**
 * Tokenize log content into typed segments for rendering.
 * Detects [ERROR], [WARN], [INFO] markers and styles them specially.
 * Does NOT strip any content - keeps everything visible.
 */
export function tokenizeContent(content: string): TokenizeResult {
  if (!content) return { tokens: [] };

  const tokens: LogToken[] = [];

  // Split content by log level markers, keeping the markers
  // Matches: [ERROR], [WARN], [WARNING], [INFO], [DEBUG], [TRACE]
  const markerRegex = /(\[(?:ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\])/gi;
  const parts = content.split(markerRegex);

  for (const part of parts) {
    if (!part) continue;

    // Check if this part is a marker
    const upperPart = part.toUpperCase();
    if (upperPart === "[ERROR]") {
      tokens.push({ text: part, type: "marker.error" });
    } else if (upperPart === "[WARN]" || upperPart === "[WARNING]") {
      tokens.push({ text: part, type: "marker.warn" });
    } else if (upperPart === "[INFO]") {
      tokens.push({ text: part, type: "marker.info" });
    } else if (upperPart === "[DEBUG]" || upperPart === "[TRACE]") {
      // Debug/trace markers - style as muted
      tokens.push({ text: part, type: "marker.info" });
    } else {
      // Tokenize the rest normally
      tokens.push(...tokenizeSegment(part));
    }
  }

  return { tokens };
}
