/**
 * Mocha Log Viewer - Log Parser
 *
 * Parses raw log files into structured LogEntry objects.
 * Supports multiple log formats and continuation line merging.
 */

import murmurhash from 'murmurhash';
import type { LogEntry, ParsedLogLine, LogLevel, ApiCallInfo, ParsedLogFileResult } from './types';

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
  if (upper === 'WARNING') return 'WARN';
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
  // Don't treat timestamp-only lines as continuations - they should be skipped
  if (isTimestampOnlyLine(line)) return false;
  // Indented lines (but not timestamp-only lines starting with tab)
  if (line.startsWith(' ') || line.startsWith('\t')) {
    // Skip if it's just a timestamp after the tab
    if (isTimestampOnlyLine(line)) return false;
    return true;
  }
  // ASCII art lines
  if (isAsciiArt(line)) return true;
  // Short lines without timestamp prefix
  if (line.length < 20 && !/^\d{4}-\d{2}-\d{2}/.test(line) && !/^\[/.test(line)) return true;
  return false;
}

// ============================================================================
// Log Format Patterns
// ============================================================================

const patterns: LogPattern[] = [
  // 1. SalesBox App Format
  // 2025-12-19 05:32:17,405 33667971 [thread] INFO com.r2.util.SQSUtil - message
  // Note: There may be extra spaces before/after the level (e.g., "INFO  " with double space)
  {
    name: 'salesbox-app',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+\d+\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+-\s*(.*)$/i
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
  {
    name: 'iwf-spring',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+-\s*(.*)$/i
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
  {
    name: 'logback-with-source',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+-\s*(.*)$/i
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
  {
    name: 'logback-internal',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{2}:\d{2}:\d{2}[,.]\d+)\s+\|-(ERROR|WARN|INFO|DEBUG|TRACE)\s+in\s+(\S+)\s+-\s*(.*)$/i
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
    name: 'maven',
    parse: (line: string): ParsedLogLine | null => {
      // [INFO] --- mn:3.5.4:run (default-cli) @ salesboxai-platform ---
      let match = line.match(
        /^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+---\s+(\S+)\s+@\s+(\S+)\s+---\s*$/i
      );
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          logger: match[3],
          content: `--- ${match[2]} ---`,
        };
      }

      // [INFO] /path/to/File.java: warning message
      match = line.match(/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+(\/[^:]+\.java):\s*(.*)$/i);
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
    name: 'logback',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,.]\d+)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+\[([^\]]+)\]\s*(.*)$/i
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
    name: 'bracketed',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s*\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i
      );
      if (!match) return null;
      return {
        timestamp: match[1],
        level: normalizeLevel(match[2]),
        content: match[3],
      };
    },
  },

  // 8. Simple Format (multiple patterns)
  {
    name: 'simple',
    parse: (line: string): ParsedLogLine | null => {
      // With level: 2025-12-18 05:32:18.541 INFO message
      let match = line.match(
        /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i
      );
      if (match) {
        return {
          timestamp: match[1],
          level: normalizeLevel(match[2]),
          content: match[3],
        };
      }

      // Without level: 2025-12-18 05:32:18.541 message
      match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,.]\d+)?)\s+(.*)$/);
      if (match) {
        return {
          timestamp: match[1],
          content: match[2],
        };
      }

      return null;
    },
  },

  // 9. Logback Time-Only
  // 13:15:39.047 [main] WARN c.s.platform.util.CryptKeyUtil - message
  {
    name: 'logback-time-only',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^(\d{2}:\d{2}:\d{2}[,.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+-\s*(.*)$/i
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

  // 10. Level Only (multiple patterns)
  {
    name: 'level-only',
    parse: (line: string): ParsedLogLine | null => {
      // [INFO] message
      let match = line.match(/^\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i);
      if (match) {
        return {
          level: normalizeLevel(match[1]),
          content: match[2],
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

  // 11. Genie/Rust Format
  // [2026-01-09][05:12:22][app_lib::core::setup][INFO] Installing extensions...
  {
    name: 'genie-rust',
    parse: (line: string): ParsedLogLine | null => {
      const match = line.match(
        /^\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]\[([^\]]+)\]\[(ERROR|WARN|INFO|DEBUG|TRACE)\]\s*(.*)$/i
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
      direction: 'outgoing',
      phase: 'request',
      method: 'GET',
      endpoint: match[1],
    };
  }

  // Outgoing GET with params: api call to https://api.example.com/users with {id: 1}
  match = content.match(/api call to (\S+) with (.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'request',
      method: 'GET',
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // Outgoing DELETE no params: api DELETE call (no params) to https://api.example.com/users/1
  match = content.match(/api DELETE call \(no params\) to (\S+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'request',
      method: 'DELETE',
      endpoint: match[1],
    };
  }

  // Outgoing DELETE with params: api DELETE call to https://api.example.com/users with {id: 1}
  match = content.match(/api DELETE call to (\S+) with (.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'request',
      method: 'DELETE',
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // POST with headers: api call -> https://api.example.com/users with [...]: {...}
  match = content.match(/api call -> (\S+) with \[([^\]]*)\]:\s*(.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'request',
      method: 'POST',
      endpoint: match[1],
      requestBody: match[3],
    };
  }

  // Multipart request: api multipart call -> https://api.example.com/upload with file: ...
  match = content.match(/api multipart call -> (\S+) with (.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'request',
      method: 'POST',
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // HTTP status response: HTTP POST https://api.example.com/users -> 200 (45ms)
  match = content.match(/HTTP (GET|POST|PUT|DELETE|PATCH) (\S+) -> (\d+)(?: \((\d+m?s)\))?/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'response',
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
      direction: 'outgoing',
      phase: 'complete',
      method: 'GET',
      endpoint: match[1],
      requestBody: match[2],
      responseBody: match[3],
    };
  }

  // POST response: api call -> /users with {...} -> response: {...}
  match = content.match(/api call -> (\S+) with (.+?) -> response:\s*(.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'complete',
      method: 'POST',
      endpoint: match[1],
      requestBody: match[2],
      responseBody: match[3],
    };
  }

  // Multipart response: api multipart call -> /upload -> response: {...}
  match = content.match(/api multipart call -> (\S+) -> response:\s*(.+)/i);
  if (match) {
    return {
      direction: 'outgoing',
      phase: 'complete',
      method: 'POST',
      endpoint: match[1],
      responseBody: match[2],
    };
  }

  // Incoming request: /api/users <- {...}
  match = content.match(/^(\S+) <- (.+)$/);
  if (match && match[1].startsWith('/')) {
    return {
      direction: 'incoming',
      phase: 'request',
      endpoint: match[1],
      requestBody: match[2],
    };
  }

  // Incoming response: /api/users -> {...}
  match = content.match(/^(\S+) -> (.+)$/);
  if (match && match[1].startsWith('/')) {
    return {
      direction: 'incoming',
      phase: 'response',
      endpoint: match[1],
      responseBody: match[2],
    };
  }

  // Complete incoming: /api/users <- {...} -> {...}
  match = content.match(/^(\S+) <- (.+?) -> (.+)$/);
  if (match && match[1].startsWith('/')) {
    return {
      direction: 'incoming',
      phase: 'complete',
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
  for (const pattern of patterns) {
    const result = pattern.parse(data);
    if (result) {
      // Try to detect API call info
      result.apiCall = parseApiCall(result.content);
      return result;
    }
  }
  // Fallback: return raw content
  return { content: data };
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
      prev.data = prev.data + '\n' + log.data;
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
  existingHashes: Set<string>
): string {
  const base = murmurhash.v3(`${serviceName}|${content}`).toString();
  if (existingHashes.has(base)) {
    return `${base}.<<${index}>>`;
  }
  return base;
}

/**
 * Parse raw file lines into LogEntry array
 */
function parseFileLines(
  content: string,
  fileName: string
): { logs: LogEntry[]; totalLines: number; truncated: boolean } {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const maxLines = 2000;
  const truncated = totalLines > maxLines;

  // Keep only last maxLines if truncated
  const linesToProcess = truncated ? lines.slice(-maxLines) : lines;

  const logs: LogEntry[] = [];
  const existingHashes = new Set<string>();

  for (let i = 0; i < linesToProcess.length; i++) {
    let line = linesToProcess[i];

    // Skip empty lines
    if (!line.trim()) continue;

    // Skip timestamp-only lines (metadata/sorting keys in some log formats)
    const trimmedLine = line.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3}\s*$/.test(trimmedLine)) continue;

    // Handle tab-separated epoch format:
    // 1735123456789\t2025-12-25T10:30:00Z\t[INFO] Log message here
    // Also seen: 2026-01-09 10:18:09.249\t followed by the actual log line
    const tabParts = line.split('\t');
    let timestamp: number | undefined;

    if (tabParts.length >= 2) {
      // Check if first part is epoch timestamp (10+ digits)
      if (/^\d{10,}$/.test(tabParts[0].trim())) {
        timestamp = parseInt(tabParts[0].trim(), 10);
        line = tabParts.slice(1).join('\t');
      }
      // Check if first part is ISO date or timestamp-like
      else if (/^\d{4}-\d{2}-\d{2}/.test(tabParts[0].trim())) {
        // Try parsing as date
        const dateStr = tabParts[0].trim();
        const parsed = Date.parse(dateStr.replace(' ', 'T'));
        if (!isNaN(parsed)) {
          timestamp = parsed;
        }
        // Take the rest as the actual log line
        line = tabParts.slice(1).join('\t').trim();
        // Skip if remaining line is empty
        if (!line) continue;
      }
    }

    // Generate fake timestamp based on line order if not extracted
    if (!timestamp) {
      timestamp = Date.now() - (linesToProcess.length - i) * 1000;
    }

    const hash = generateHash(fileName, line, i, existingHashes);
    existingHashes.add(hash);

    logs.push({
      name: fileName,
      data: line,
      isErr: false,
      hash,
      timestamp,
    });
  }

  return { logs, totalLines, truncated };
}

/**
 * Parse a complete log file into structured log entries
 */
export function parseLogFile(content: string, fileName: string): ParsedLogFileResult {
  const { logs: rawLogs, totalLines, truncated } = parseFileLines(content, fileName);
  const normalized = normalize(rawLogs);

  const logs = normalized.map((log) => ({
    ...log,
    parsed: parseLogLine(log.data),
  }));

  return { logs, totalLines, truncated };
}
