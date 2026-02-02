/**
 * Utility for recursively parsing JSON strings within JSON objects.
 *
 * When a JSON object contains string values that are themselves valid JSON
 * (e.g., escaped/encoded JSON strings), this utility will detect and parse
 * them into proper objects for display in JSON viewers.
 *
 * @example
 * // Input: { data: "{\"nested\":true}" }
 * // Output: { data: { nested: true } }
 */

interface DeepParseOptions {
  /** Maximum recursion depth to prevent infinite loops (default: 10) */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 10;

/**
 * Check if a string looks like it could be JSON (starts/ends with {} or [])
 */
function isJsonString(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/**
 * Recursively parse JSON strings within a JSON object.
 *
 * Traverses the object/array structure and detects string values that
 * are valid JSON, parsing them into proper objects. This allows nested
 * JSON strings (common in log files) to be displayed as expandable trees.
 *
 * @param data - The data to process (object, array, or primitive)
 * @param options - Configuration options
 * @param currentDepth - Internal: current recursion depth
 * @returns The processed data with JSON strings parsed into objects
 *
 * @example
 * const input = {
 *   message: "hello",
 *   job_data: "{\"status\":\"ok\",\"details\":\"{\\\"count\\\":5}\"}"
 * };
 * const output = deepParseJsonStrings(input);
 * // output = {
 * //   message: "hello",
 * //   job_data: { status: "ok", details: { count: 5 } }
 * // }
 */
export function deepParseJsonStrings<T = unknown>(
  data: T,
  options: DeepParseOptions = {},
  currentDepth = 0,
): T {
  const { maxDepth = DEFAULT_MAX_DEPTH } = options;

  // Depth limit protection against infinite recursion
  if (currentDepth >= maxDepth) {
    return data;
  }

  // Handle null/undefined
  if (data == null) {
    return data;
  }

  // Handle arrays - recursively process each element
  if (Array.isArray(data)) {
    return data.map((item) =>
      deepParseJsonStrings(item, options, currentDepth + 1),
    ) as T;
  }

  // Handle objects - recursively process each value
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = deepParseJsonStrings(value, options, currentDepth + 1);
    }
    return result as T;
  }

  // Handle strings - try to parse as JSON if it looks like JSON
  if (typeof data === "string" && isJsonString(data)) {
    try {
      const parsed = JSON.parse(data);
      // Recursively process the parsed result (handles nested JSON strings)
      return deepParseJsonStrings(parsed, options, currentDepth + 1);
    } catch {
      // Not valid JSON, return as-is
      return data;
    }
  }

  // Primitives (number, boolean, etc.) - return as-is
  return data;
}
