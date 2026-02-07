import { useState, useCallback } from "react";
import { X, Plus, Hash, Search } from "lucide-react";
import type { ParsedFilter } from "../types";
import { parseFilterInput } from "../store";

interface PatternManagerProps {
  patterns: ParsedFilter[];
  onPatternsChange: (patterns: ParsedFilter[]) => void;
  compact?: boolean;
}

/**
 * PatternManager - manage auto-capture patterns for a logbook.
 * Supports text and /regex/ patterns.
 */
export function PatternManager({
  patterns,
  onPatternsChange,
  compact,
}: PatternManagerProps) {
  const [input, setInput] = useState("");

  const handleAddPattern = useCallback(() => {
    const filter = parseFilterInput(input);
    if (filter && (filter.type === "text" || filter.type === "regex")) {
      onPatternsChange([...patterns, filter]);
      setInput("");
    }
  }, [input, patterns, onPatternsChange]);

  const handleRemovePattern = useCallback(
    (index: number) => {
      onPatternsChange(patterns.filter((_, i) => i !== index));
    },
    [patterns, onPatternsChange],
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Pattern chips */}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((pattern, index) => (
            <div
              key={index}
              className="group/chip flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs font-mono transition-all duration-150"
              style={{
                background:
                  pattern.type === "regex"
                    ? "var(--mocha-accent-muted)"
                    : "var(--mocha-surface-raised)",
                border: `1px solid ${pattern.type === "regex" ? "var(--mocha-accent)" : "var(--mocha-border)"}`,
                color:
                  pattern.type === "regex"
                    ? "var(--mocha-accent)"
                    : "var(--mocha-text)",
              }}
            >
              {pattern.type === "regex" ? (
                <Hash className="w-3 h-3 shrink-0 opacity-60" />
              ) : (
                <Search className="w-3 h-3 shrink-0 opacity-60" />
              )}
              <span className="truncate max-w-[160px]">{pattern.value}</span>
              <button
                onClick={() => handleRemovePattern(index)}
                className="p-0.5 rounded transition-colors opacity-40 group-hover/chip:opacity-100"
                style={{ color: "var(--mocha-text-muted)" }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add pattern input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              handleAddPattern();
            }
          }}
          placeholder={compact ? "Add pattern..." : "/regex/ or text pattern"}
          className={`flex-1 px-3 rounded-lg text-xs font-mono outline-none transition-all duration-200 ${compact ? "py-1.5" : "py-2"}`}
          style={{
            background: "var(--mocha-surface-raised)",
            border: "1px solid var(--mocha-border)",
            color: "var(--mocha-text)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--mocha-accent)";
            e.currentTarget.style.boxShadow =
              "0 0 0 2px var(--mocha-accent-muted)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--mocha-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          onClick={handleAddPattern}
          disabled={!input.trim()}
          className={`rounded-lg text-xs font-semibold flex items-center gap-1 transition-all duration-150 disabled:opacity-30 ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}
          style={{
            background: "var(--mocha-accent-muted)",
            color: "var(--mocha-accent)",
            border: "1px solid var(--mocha-accent)",
          }}
        >
          <Plus className="w-3 h-3" />
          {!compact && "Add"}
        </button>
      </div>
    </div>
  );
}
