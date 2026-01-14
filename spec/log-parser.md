# Log Parser Specification

## Overview

The log parser handles:
1. Parsing raw log files into structured entries
2. Detecting and parsing multiple log formats
3. Merging continuation lines
4. Extracting API call information

## Type Definitions

```typescript
interface LogEntry {
  name: string;          // Service/file name
  data: string;          // Original line (used for clipboard)
  isErr: boolean;        // Whether from stderr
  hash?: string;         // Unique identifier
  timestamp?: number;    // Unix timestamp
  parsed?: ParsedLogLine;
}

interface ParsedLogLine {
  timestamp?: string;    // Extracted timestamp
  level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
  logger?: string;       // Class/logger name
  content: string;       // Cleaned content
  apiCall?: ApiCallInfo;
}

interface ApiCallInfo {
  direction: 'outgoing' | 'incoming';
  phase: 'request' | 'response' | 'complete';
  method?: string;       // GET, POST, DELETE, etc.
  endpoint: string;      // /path or URL
  status?: number;       // HTTP status code
  timing?: string;       // "45ms"
  requestBody?: string;
  responseBody?: string;
}
```

## Log Format Patterns

The parser tries each pattern in order until one matches.

### 1. SalesBox App Format
**Pattern**: `salesbox-app`
```
2025-12-19 05:32:17,405 33667971 [thread] INFO com.r2.util.SQSUtil - message
```
- Timestamp with milliseconds
- Counter number after timestamp
- Thread in brackets
- Level (ERROR/WARN/INFO/DEBUG/TRACE)
- Full class path
- Message after dash

**Regex**:
```regex
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,\.]\d+)\s+\d+\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+-\s*(.*)$/i
```

### 2. IWF/Spring Format
**Pattern**: `iwf-spring`
```
[http-nio-3004-exec-5] WARN i.i.w.u.StateWaitForLeads [StateWaitForLeads.java:133] [default] - message
```
- Thread in brackets
- Level
- Abbreviated logger path
- Source file with line number in brackets
- Context in brackets
- Message after dash

**Regex**:
```regex
/^\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+-\s*(.*)$/i
```

### 3. Logback with Source
**Pattern**: `logback-with-source`
```
2025-12-18 08:21:56.203 [thread] LEVEL logger [Source.java:line] [context] - message
```

**Regex**:
```regex
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,\.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+\[([^\]]+\.java:\d+)\]\s+\[[^\]]*\]\s+-\s*(.*)$/i
```

### 4. Logback Internal
**Pattern**: `logback-internal`
```
13:42:38,400 |-INFO in ch.qos.logback...AppenderAction - message
```

**Regex**:
```regex
/^(\d{2}:\d{2}:\d{2}[,\.]\d+)\s+\|-(ERROR|WARN|INFO|DEBUG|TRACE)\s+in\s+(\S+)\s+-\s*(.*)$/i
```

### 5. Maven Format
**Pattern**: `maven`
```
[INFO] --- mn:3.5.4:run (default-cli) @ salesboxai-platform ---
[INFO] Building xyz...
[INFO] /path/to/File.java: warning message
```

**Regex** (multiple):
```regex
/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+---\s+(\S+)\s+@\s+(\S+)\s+---\s*$/i
/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+(\/[^:]+\.java):\s*(.*)$/i
/^\[(ERROR|WARN|WARNING|INFO|DEBUG)\]\s+(.*)$/i
```

### 6. Logback Standard
**Pattern**: `logback`
```
2025-12-19 13:15:41,545 WARN [c.r.u.d.RedashApiUtil:37] message
```

**Regex**:
```regex
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,\.]\d+)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+\[([^\]]+)\]\s*(.*)$/i
```

### 7. Bracketed Level
**Pattern**: `bracketed`
```
2025-12-18 05:32:18.541 [INFO] message
```

**Regex**:
```regex
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,\.]\d+)?)\s*\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i
```

### 8. Simple Format
**Pattern**: `simple`
```
2025-12-18 05:32:18.541 INFO message
2025-12-18 05:32:18.541 message
```

**Regex** (multiple):
```regex
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,\.]\d+)?)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i
/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:[,\.]\d+)?)\s+(.*)$/
```

### 9. Logback Time-Only
**Pattern**: `logback-time-only`
```
13:15:39.047 [main] WARN c.s.platform.util.CryptKeyUtil - message
```

**Regex**:
```regex
/^(\d{2}:\d{2}:\d{2}[,\.]\d+)\s+\[([^\]]+)\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(\S+)\s+-\s*(.*)$/i
```

### 10. Level Only
**Pattern**: `level-only`
```
[INFO] message
INFO message
```

**Regex** (multiple):
```regex
/^\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]\s*(.*)$/i
/^(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+(.*)$/i
```

### 11. Genie/Rust Format
**Pattern**: `genie-rust`
```
[2026-01-09][05:12:22][app_lib::core::setup][INFO] Installing extensions...
```
- Date in brackets
- Time in brackets
- Module path in brackets
- Level in brackets
- Message

**Regex**:
```regex
/^\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]\[([^\]]+)\]\[(ERROR|WARN|INFO|DEBUG|TRACE)\]\s*(.*)$/i
```

### 12. Fallback
If no pattern matches, return raw content:
```typescript
{ content: data }
```

## API Call Patterns

### Outgoing Requests

| Pattern | Example |
|---------|---------|
| GET no params | `api call (no params) to https://api.example.com/users` |
| GET with params | `api call to https://api.example.com/users with {id: 1}` |
| DELETE no params | `api DELETE call (no params) to https://api.example.com/users/1` |
| DELETE with params | `api DELETE call to https://api.example.com/users with {id: 1}` |
| POST with headers | `api call -> https://api.example.com/users with [Content-Type: application/json]: {name: "John"}` |
| Multipart request | `api multipart call -> https://api.example.com/upload with file: doc.pdf (1024 bytes)` |

### Outgoing Responses

| Pattern | Example |
|---------|---------|
| Status only | `HTTP POST https://api.example.com/users -> 200 (45ms)` |
| GET response | `api call /users {id: 1} response: {name: "John"}` |
| POST response | `api call -> /users with {name: "John"} -> response: {id: 1}` |
| Multipart response | `api multipart call -> /upload -> response: {success: true}` |

### Incoming Requests/Responses

| Pattern | Example |
|---------|---------|
| Request only | `/api/users <- {name: "John"}` |
| Response only | `/api/users -> {id: 1, name: "John"}` |
| Complete | `/api/users <- {name: "John"} -> {id: 1}` |

## Continuation Line Detection

Lines are merged if they appear to be continuations:

1. **Indented lines**: Start with space or tab
2. **ASCII art**: High ratio of special characters (`|_/\+\-=<>^~[]{}()#*@!`)
3. **Short lines**: Less than 20 characters without timestamp prefix

```typescript
function isContinuationLine(line: string): boolean {
  if (!line) return false;
  if (line.startsWith(" ") || line.startsWith("\t")) return true;
  if (isAsciiArt(line)) return true;
  if (line.length < 20 && !/^\d{4}-\d{2}-\d{2}/.test(line)) return true;
  return false;
}
```

## File Parsing

### Grafana/Loki Export Format

Grafana exports logs with metadata headers and a 3-part tab-separated format:

**Header lines** (skipped during parsing):
```
: "330 lines displayed"
Total bytes processed: "4.34  MB"
Common labels: {"filename":"/var/log/sandbox_microservice_core.log","host":"sandbox",...}
```

**Log lines** (tab-separated with 3 parts):
```
1766138817990	2025-12-19T10:06:57.990Z	2025-12-19 10:06:57.799 [thread] INFO logger [Source.java:229] - message
│              │                        │
epoch_ms       ISO_timestamp            actual_log_line
```

The parser:
1. Detects and skips header lines using `isGrafanaHeader()` helper
2. Splits 3-part format: uses epoch for timestamp, strips ISO prefix, keeps actual log line
3. Passes actual log line to pattern matching as normal

### Tab-Separated Format (2-part)
```
1735123456789	[INFO] Log message here
```
- Epoch timestamp (10+ digits)
- Log line

### Plain Log File
- Lines parsed individually
- Parsed timestamps converted to epoch when possible
- Fake timestamps assigned based on line order as fallback
- Last 2000 lines kept if file exceeds limit

## Level Normalization

```typescript
function normalizeLevel(level: string): 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' {
  const upper = level.toUpperCase();
  if (upper === 'WARNING') return 'WARN';
  return upper;
}
```

## Hash Generation

Each log entry needs a unique hash for selection/deletion tracking:

```typescript
import murmurhash from 'murmurhash';

function generateHash(serviceName: string, content: string, index: number): string {
  const base = murmurhash.v3(`${serviceName}|${content}`).toString();
  // Handle duplicates by appending index
  return existingHashes.has(base) ? `${base}.<<${index}>>` : base;
}
```

## Public API

```typescript
// Parse file content into log entries
function parseLogFile(content: string, fileName: string): ParsedLogFileResult {
  const { logs: rawLogs, totalLines, truncated } = parseFileLines(content, fileName);
  const normalized = normalize(rawLogs);
  const logs = normalized.map(log => ({
    ...log,
    parsed: parseLogLine(log.data),
  }));
  return { logs, totalLines, truncated };
}

interface ParsedLogFileResult {
  logs: LogEntry[];
  totalLines: number;
  truncated: boolean;
}

// Parse a single log line
function parseLogLine(data: string): ParsedLogLine;

// Tokenize log content for syntax highlighting
function tokenizeContent(content: string): TokenizeResult;

// Apply search highlighting to tokens
function highlightSearchInTokens(
  tokens: LogToken[],
  searchQuery: string,
  isRegex: boolean
): LogToken[];
```

## Content Tokenization

Log content is tokenized for syntax highlighting. Each token has a type that determines its color/style.

### Token Types

```typescript
type TokenType =
  | 'timestamp'      // Time values in content
  | 'level'          // Log level keywords (ERROR, WARN, INFO, DEBUG, TRACE)
  | 'service'        // Service/logger names
  | 'symbol'         // Brackets, punctuation
  | 'url'            // URLs and endpoints
  | 'message'        // General text content
  | 'data'           // Data values
  | 'json'           // JSON objects/arrays
  | 'marker.error'   // [ERROR] markers
  | 'marker.warn'    // [WARN] markers
  | 'marker.info'    // [INFO] markers
  | 'search.match';  // Highlighted search match

interface LogToken {
  text: string;
  type: TokenType;
}

interface TokenizeResult {
  tokens: LogToken[];
  detectedLevel?: LogLevel;  // Level detected at start of content
}
```

### Search Highlighting

When search is active, tokens are split at match boundaries to create `search.match` tokens:

```typescript
// Before search highlighting:
[{text: "api call to /users with ", type: "message"}, {text: '{"id":1}', type: "json"}]

// After applying search "users":
[
  {text: "api call to /", type: "message"},
  {text: "users", type: "search.match"},
  {text: " with ", type: "message"},
  {text: '{"id":1}', type: "json"}
]
```

This approach ensures search highlighting integrates with existing tokenization, preserving syntax colors while highlighting matches.
