import { memo, useCallback, useMemo, useState } from "react";
import {
  FolderOpen,
  FileText,
  Clock,
  Trash2,
  Check,
  X,
  Radio,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  BookOpen,
  Plus,
  ChevronDown,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import type {
  SidebarProps,
  RecentFile,
  OpenedFileWithLogs,
  Story,
  ThemeName,
} from "../types";

/**
 * Theme definitions for the selector
 */
const THEMES: {
  id: ThemeName;
  name: string;
  icon: typeof Moon;
  description: string;
}[] = [
  {
    id: "system",
    name: "System",
    icon: Monitor,
    description: "Follow OS setting",
  },
  {
    id: "observatory",
    name: "Observatory",
    icon: Moon,
    description: "Dark theme",
  },
  {
    id: "morning-brew",
    name: "Morning Brew",
    icon: Sun,
    description: "Light theme",
  },
];

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return days === 1 ? "1d ago" : `${days}d ago`;
  if (hours > 0) return hours === 1 ? "1h ago" : `${hours}h ago`;
  if (minutes > 0) return minutes === 1 ? "1m ago" : `${minutes}m ago`;
  return "Just now";
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Recent file item component
 */
interface RecentFileItemProps {
  file: RecentFile;
  openedFile?: OpenedFileWithLogs;
  onClick: () => void;
  onRemove: () => void;
  index: number;
  isCollapsed: boolean;
}

const RecentFileItem = memo(function RecentFileItem({
  file,
  openedFile,
  onClick,
  onRemove,
  index,
  isCollapsed,
}: RecentFileItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isOpened = !!openedFile;
  const isActive = openedFile?.isActive ?? false;

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove();
    },
    [onRemove],
  );

  // Collapsed view - just the icon
  if (isCollapsed) {
    return (
      <div
        className="animate-fade-in"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <button
          onClick={onClick}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 mx-auto"
          style={{
            background: isActive
              ? "var(--mocha-info)"
              : isOpened
                ? "var(--mocha-surface-active)"
                : "var(--mocha-surface-raised)",
            boxShadow: isActive
              ? "0 0 12px var(--mocha-selection-glow)"
              : "none",
          }}
          title={file.name}
          data-testid={`recent-file-${file.name}`}
        >
          {isActive ? (
            <Check className="w-4 h-4" style={{ color: "var(--mocha-bg)" }} />
          ) : isOpened ? (
            <Radio
              className="w-4 h-4"
              style={{ color: "var(--mocha-text-muted)" }}
            />
          ) : (
            <FileText
              className="w-4 h-4"
              style={{ color: "var(--mocha-text-muted)" }}
            />
          )}
        </button>
      </div>
    );
  }

  // Expanded view - full item
  return (
    <div
      className="group relative animate-slide-in"
      style={{ animationDelay: `${index * 40}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-3"
        style={{
          background: isActive
            ? "var(--mocha-selection)"
            : isOpened
              ? "var(--mocha-surface-raised)"
              : isHovered
                ? "var(--mocha-surface-hover)"
                : "transparent",
          border: isActive
            ? "1px solid var(--mocha-selection-border)"
            : "1px solid transparent",
        }}
        data-testid={`recent-file-${file.name}`}
        title={file.path}
      >
        {/* Status indicator */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            background: isActive
              ? "var(--mocha-info)"
              : isOpened
                ? "var(--mocha-surface-active)"
                : "var(--mocha-surface-raised)",
            boxShadow: isActive
              ? "0 0 12px var(--mocha-selection-glow)"
              : "none",
          }}
        >
          {isActive ? (
            <Check className="w-4 h-4" style={{ color: "var(--mocha-bg)" }} />
          ) : isOpened ? (
            <Radio
              className="w-4 h-4"
              style={{ color: "var(--mocha-text-muted)" }}
            />
          ) : (
            <FileText
              className="w-4 h-4"
              style={{ color: "var(--mocha-text-muted)" }}
            />
          )}
        </div>

        {/* File info */}
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-sm truncate transition-colors duration-200"
            style={{
              color: isActive
                ? "var(--mocha-info)"
                : isOpened
                  ? "var(--mocha-text)"
                  : "var(--mocha-text-secondary)",
            }}
          >
            {file.name}
          </div>
          <div
            className="text-xs flex items-center gap-2 mt-0.5"
            style={{
              color:
                file.exists === false
                  ? "var(--mocha-error)"
                  : "var(--mocha-text-muted)",
            }}
          >
            {file.exists === false ? (
              <span>[not found]</span>
            ) : (
              <>
                {(openedFile?.mtime ?? file.mtime) && (
                  <>
                    <Clock className="w-3 h-3" />
                    <span>
                      {formatRelativeTime(openedFile?.mtime ?? file.mtime!)}
                    </span>
                  </>
                )}
                {file.size != null && (
                  <span style={{ opacity: 0.7 }}>
                    {formatFileSize(file.size)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chevron indicator */}
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-all duration-200 ${
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
          }`}
          style={{ color: "var(--mocha-text-muted)" }}
        />
      </button>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        className={`
          absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md
          transition-all duration-200
          ${isHovered ? "opacity-100 scale-100" : "opacity-0 scale-90"}
        `}
        style={{
          background: "var(--mocha-surface-active)",
          color: "var(--mocha-text-muted)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--mocha-error-bg)";
          e.currentTarget.style.color = "var(--mocha-error)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--mocha-surface-active)";
          e.currentTarget.style.color = "var(--mocha-text-muted)";
        }}
        title="Remove from list"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

/**
 * Logbook item component
 */
interface LogbookItemProps {
  story: Story;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  index: number;
  isCollapsed: boolean;
}

const LogbookItem = memo(function LogbookItem({
  story,
  isActive,
  isSelected,
  onClick,
  onDelete,
  onRename,
  index,
  isCollapsed,
}: LogbookItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(story.name);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditName(story.name);
      setIsEditing(true);
    },
    [story.name],
  );

  const handleRename = useCallback(() => {
    if (editName.trim() && editName !== story.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  }, [editName, story.name, onRename]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete],
  );

  // Collapsed view - just the icon
  // isSelected = viewing this logbook (striking highlight)
  // isActive only = target logbook but in log view (subtle accent on icon)
  const isActiveOnlyCollapsed = isActive && !isSelected;

  if (isCollapsed) {
    const isInactiveCollapsed = !isActive;
    return (
      <div
        className="animate-fade-in"
        style={{
          animationDelay: `${index * 30}ms`,
        }}
      >
        <button
          onClick={onClick}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 mx-auto relative hover:opacity-100"
          style={{
            background: isSelected
              ? "var(--mocha-accent-muted)"
              : "var(--mocha-surface-raised)",
            border: isSelected
              ? "1px solid var(--mocha-accent)"
              : "1px solid var(--mocha-border)",
            opacity: isInactiveCollapsed ? 0.85 : 1,
          }}
          title={`${story.name} (${story.entries.length} entries)`}
        >
          <BookOpen
            className="w-4 h-4"
            style={{
              color: isSelected
                ? "var(--mocha-accent)"
                : isActiveOnlyCollapsed
                  ? "var(--mocha-accent)"
                  : "var(--mocha-text-muted)",
            }}
          />
          {story.entries.length > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-1"
              style={{
                background: isActive
                  ? "var(--mocha-accent)"
                  : "var(--mocha-text-muted)",
                color: "var(--mocha-bg)",
              }}
            >
              {story.entries.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Expanded view - full item
  // isSelected = viewing this logbook in logbook mode (striking highlight)
  // isActive only = this is the target logbook but we're in log view (just bold)
  const isActiveOnly = isActive && !isSelected;

  // Non-active logbooks should be visually muted
  const isInactive = !isActive;

  return (
    <div
      className="group relative animate-slide-in transition-all duration-200"
      style={{
        animationDelay: `${index * 40}ms`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onClick}
        onDoubleClick={handleDoubleClick}
        className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-3"
        style={{
          background: isSelected
            ? "var(--mocha-accent-muted)"
            : isHovered
              ? "var(--mocha-surface-hover)"
              : "transparent",
          border: isSelected
            ? "1px solid var(--mocha-accent)"
            : "1px solid transparent",
          boxShadow: isSelected ? "0 2px 8px var(--mocha-accent-glow)" : "none",
          opacity: isInactive && !isHovered ? 0.85 : 1,
        }}
        title="Double-click to rename"
      >
        {/* Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            background: isSelected
              ? "var(--mocha-accent)"
              : "var(--mocha-surface-raised)",
          }}
        >
          <BookOpen
            className="w-4 h-4"
            style={{
              color: isSelected
                ? "var(--mocha-bg)"
                : isActiveOnly
                  ? "var(--mocha-accent)"
                  : "var(--mocha-text-muted)",
            }}
          />
        </div>

        {/* Name and count */}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setIsEditing(false);
              }}
              className="w-full text-sm font-medium px-1 py-0.5 rounded bg-transparent border outline-none"
              style={{
                color: "var(--mocha-text)",
                borderColor: "var(--mocha-accent)",
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="text-sm truncate transition-colors duration-200"
              style={{
                color: isSelected
                  ? "var(--mocha-accent)"
                  : isActiveOnly
                    ? "var(--mocha-text)"
                    : "var(--mocha-text-muted)",
                fontWeight: isSelected || isActiveOnly ? 600 : 400,
              }}
            >
              {story.name}
            </div>
          )}
          <div
            className="text-xs mt-0.5"
            style={{ color: "var(--mocha-text-faint)" }}
          >
            {story.entries.length}{" "}
            {story.entries.length === 1 ? "entry" : "entries"}
          </div>
        </div>

        {/* Entry count badge */}
        {story.entries.length > 0 && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
            style={{
              background: isActive
                ? "var(--mocha-accent-muted)"
                : "var(--mocha-surface-hover)",
              color: isActive
                ? "var(--mocha-accent)"
                : "var(--mocha-text-muted)",
            }}
          >
            {story.entries.length}
          </span>
        )}

        {/* Chevron indicator */}
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-all duration-200 ${
            isHovered && !isEditing
              ? "opacity-100 translate-x-0"
              : "opacity-0 -translate-x-1"
          }`}
          style={{ color: "var(--mocha-text-muted)" }}
        />
      </button>

      {/* Delete button */}
      {!isEditing && (
        <button
          onClick={handleDelete}
          className={`
            absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md
            transition-all duration-200
            ${isHovered ? "opacity-100 scale-100" : "opacity-0 scale-90"}
          `}
          style={{
            background: "var(--mocha-surface-active)",
            color: "var(--mocha-text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--mocha-error-bg)";
            e.currentTarget.style.color = "var(--mocha-error)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--mocha-surface-active)";
            e.currentTarget.style.color = "var(--mocha-text-muted)";
          }}
          title="Delete logbook"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

/**
 * Sidebar component - refined control panel with collapse support
 */
export const Sidebar = memo(function Sidebar({
  // File management
  recentFiles,
  openedFiles,
  onSelectFile,
  onToggleFile,
  onRemoveFile,
  onClearRecent,
  // Logbook management
  stories,
  activeStoryId,
  mainViewMode,
  onSelectLogbook,
  onCreateLogbook,
  onDeleteLogbook,
  onRenameLogbook,
  // Theme
  theme,
  onThemeChange,
  // UI state
  isCollapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const activeCount = Array.from(openedFiles.values()).filter(
    (f) => f.isActive,
  ).length;
  const openedCount = openedFiles.size;

  // Section collapse states
  const [logbooksExpanded, setLogbooksExpanded] = useState(true);
  const [filesExpanded, setFilesExpanded] = useState(true);

  // Sort recent files alphabetically by name
  const sortedRecentFiles = useMemo(
    () => [...recentFiles].sort((a, b) => a.name.localeCompare(b.name)),
    [recentFiles],
  );

  // Sort stories by creation date (newest first)
  const sortedStories = useMemo(
    () => [...stories].sort((a, b) => b.createdAt - a.createdAt),
    [stories],
  );

  return (
    <aside
      className="flex flex-col h-full relative transition-all duration-300 ease-out"
      style={{
        width: isCollapsed ? "64px" : "256px",
        minWidth: isCollapsed ? "64px" : "256px",
        background: "var(--mocha-surface)",
        borderRight: "1px solid var(--mocha-border)",
      }}
      data-testid="sidebar"
    >
      {/* Subtle gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 p-4 transition-all duration-300"
        style={{
          borderBottom: "1px solid var(--mocha-border-subtle)",
          padding: isCollapsed ? "16px 12px" : "20px",
        }}
      >
        {/* Logo */}
        <div
          className={`flex items-center mb-4 transition-all duration-300 ${isCollapsed ? "justify-center" : "gap-3"}`}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--mocha-accent) 0%, #c4854a 50%, #a06830 100%)",
              boxShadow: "0 4px 16px var(--mocha-accent-glow)",
            }}
          >
            {/* Coffee cup with steam SVG */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 342 342"
              fill="none"
              style={{ opacity: 0.92, transform: "translateY(-1px)" }}
            >
              {/* Cup body with handle */}
              <path
                d="M291.177,134.159C284.842,134.159 275.857,135.475 267.236,141.271C266.736,140.223 266.232,139.176 265.706,138.136C265.625,137.976 265.543,137.805 265.457,137.626C264.078,134.756 261.207,128.781 248.812,128.781L30.31,128.781C25.646,128.781 19.231,130.49 15.15,138.632C5.097,158.692 0,180.251 0,202.71C0,256.504 30.255,305.89 78.959,331.595C79.718,331.996 86.585,335.512 93.738,335.512L187.562,335.512C194.083,335.512 199.562,332.938 201.086,332.149C222.918,320.845 241.083,304.831 254.564,285.794C256.56,286.23 258.773,286.489 261.242,286.489C276.395,286.489 296.207,276.983 311.715,262.27C331.108,243.872 341.789,219.387 341.789,193.327C341.79,160.701 319.085,134.159 291.177,134.159ZM271.753,253.554C277.838,237.545 281.105,220.379 281.105,202.71C281.105,192.733 280.097,182.937 278.1,173.372C282.849,164.169 288.299,164.159 291.177,164.159C302.35,164.159 311.789,177.515 311.789,193.326C311.79,227.259 287.432,246.636 271.753,253.554Z"
                fill="var(--mocha-bg)"
              />
              {/* Steam wisps */}
              <path
                d="M137.304,91.933C138.258,92.58 139.376,92.923 140.536,92.923L140.548,92.923C143.729,92.923 146.316,90.336 146.316,87.157C146.316,86.617 146.242,86.083 146.095,85.566C143.43,73.868 144.672,64.48 149.788,57.664C156.203,49.118 159.042,38.141 157.384,28.303C155.912,19.541 151.202,12.26 143.775,7.252C141.845,5.943 139.184,5.955 137.268,7.277C135.305,8.628 134.383,11.004 134.923,13.344C137.81,25.661 135.164,33.502 128.537,45.424C124.225,53.178 122.466,61.899 123.582,69.981C124.854,79.168 129.604,86.764 137.304,91.933Z"
                fill="var(--mocha-bg)"
                opacity="0.7"
              />
              <path
                d="M185.838,88.114C186.742,88.731 187.797,89.057 188.89,89.057L188.895,89.057C191.888,89.057 194.322,86.621 194.322,83.628C194.322,83.133 194.255,82.642 194.121,82.164C192.254,73.935 193.1,67.374 196.637,62.661C201.544,56.127 203.714,47.719 202.442,40.172C201.305,33.405 197.668,27.781 191.922,23.905C190.115,22.686 187.671,22.672 185.799,23.943C183.97,25.212 183.093,27.515 183.609,29.644C185.655,38.373 183.851,43.711 179.031,52.377C175.737,58.304 174.394,64.977 175.252,71.165C176.232,78.265 179.903,84.132 185.838,88.114Z"
                fill="var(--mocha-bg)"
                opacity="0.5"
              />
              <path
                d="M89.137,88.11C90.041,88.729 91.098,89.057 92.194,89.057L92.199,89.057C95.192,89.057 97.626,86.621 97.626,83.628C97.626,83.131 97.558,82.638 97.423,82.16C95.558,73.932 96.404,67.373 99.941,62.661C104.848,56.126 107.018,47.718 105.746,40.171C104.609,33.405 100.972,27.781 95.229,23.907C93.422,22.686 90.981,22.668 89.104,23.943C87.275,25.211 86.398,27.514 86.915,29.644C88.961,38.373 87.157,43.711 82.337,52.377C79.043,58.302 77.7,64.976 78.557,71.166C79.537,78.265 83.208,84.132 89.137,88.11Z"
                fill="var(--mocha-bg)"
                opacity="0.6"
              />
            </svg>
          </div>

          {/* Title - only show when expanded */}
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              width: isCollapsed ? 0 : "auto",
              opacity: isCollapsed ? 0 : 1,
            }}
          >
            <h1
              style={{
                color: "var(--mocha-text)",
                fontFamily: '"Fraunces Display", serif',
                fontWeight: 400,
                fontSize: "24px",
                letterSpacing: "0.35px",
                fontVariationSettings: '"WONK" 1, "opsz" 50',
                whiteSpace: "nowrap",
              }}
            >
              Mocha
            </h1>
            <p
              className="text-[10px] uppercase tracking-widest font-medium"
              style={{ color: "var(--mocha-text-muted)", whiteSpace: "nowrap" }}
            >
              Log Viewer
            </p>
          </div>
        </div>

        {/* Open File button */}
        <button
          onClick={() => onSelectFile()}
          className={`rounded-xl font-medium text-sm flex items-center justify-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
            isCollapsed ? "w-10 h-10 p-0" : "w-full px-4 py-3 gap-2"
          }`}
          style={{
            background:
              "linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface-hover) 100%)",
            border: "1px solid var(--mocha-border)",
            color: "var(--mocha-text)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            margin: isCollapsed ? "0 auto" : undefined,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--mocha-accent)";
            e.currentTarget.style.boxShadow =
              "0 4px 16px rgba(0,0,0,0.3), 0 0 20px var(--mocha-accent-glow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--mocha-border)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
          }}
          data-testid="open-file-button"
          title={isCollapsed ? "Open Log File" : undefined}
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Open Log File</span>}
        </button>
      </div>

      {/* Scrollable content area with both sections */}
      <div className="relative z-10 flex-1 overflow-y-auto flex flex-col">
        {/* Logbooks section */}
        <div className="shrink-0">
          {/* Section header */}
          {!isCollapsed && (
            <div className="px-5 py-3 flex items-center justify-between">
              <button
                onClick={() => setLogbooksExpanded(!logbooksExpanded)}
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest transition-colors"
                style={{ color: "var(--mocha-text-muted)" }}
              >
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 ${logbooksExpanded ? "" : "-rotate-90"}`}
                />
                Logbooks
              </button>
              <button
                onClick={() => onCreateLogbook()}
                className="p-1.5 rounded-md transition-all duration-200"
                style={{ color: "var(--mocha-text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--mocha-accent-muted)";
                  e.currentTarget.style.color = "var(--mocha-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--mocha-text-muted)";
                }}
                title="Create new logbook"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Collapsed: New logbook button */}
          {isCollapsed && (
            <div className="px-2 pt-4 pb-2">
              <button
                onClick={() => onCreateLogbook()}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 mx-auto"
                style={{
                  background: "var(--mocha-surface-raised)",
                  border: "1px solid var(--mocha-border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--mocha-accent)";
                  e.currentTarget.style.background =
                    "var(--mocha-accent-muted)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--mocha-border)";
                  e.currentTarget.style.background =
                    "var(--mocha-surface-raised)";
                }}
                title="Create new logbook"
              >
                <Plus
                  className="w-4 h-4"
                  style={{ color: "var(--mocha-text-muted)" }}
                />
              </button>
            </div>
          )}

          {/* Logbook list */}
          {(logbooksExpanded || isCollapsed) && (
            <div
              className={`${isCollapsed ? "px-2 pb-2 space-y-2" : "px-3 pb-3 space-y-1"}`}
            >
              {sortedStories.map((story, index) => (
                <LogbookItem
                  key={story.id}
                  story={story}
                  isActive={story.id === activeStoryId}
                  isSelected={
                    story.id === activeStoryId && mainViewMode === "logbook"
                  }
                  onClick={() => onSelectLogbook(story.id)}
                  onDelete={() => onDeleteLogbook(story.id)}
                  onRename={(name) => onRenameLogbook(story.id, name)}
                  index={index}
                  isCollapsed={isCollapsed}
                />
              ))}

              {/* Empty state for logbooks */}
              {sortedStories.length === 0 && !isCollapsed && (
                <div className="text-center py-6 animate-fade-in">
                  <p
                    className="text-xs"
                    style={{ color: "var(--mocha-text-muted)" }}
                  >
                    No logbooks yet
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        {!isCollapsed &&
          (sortedStories.length > 0 || sortedRecentFiles.length > 0) && (
            <div
              className="mx-5 my-1"
              style={{
                height: "1px",
                background: "var(--mocha-border-subtle)",
              }}
            />
          )}

        {/* Recent files section */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Section header - only show when expanded */}
          {!isCollapsed && (
            <div className="px-5 py-3 flex items-center justify-between shrink-0">
              <button
                onClick={() => setFilesExpanded(!filesExpanded)}
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest transition-colors"
                style={{ color: "var(--mocha-text-muted)" }}
              >
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 ${filesExpanded ? "" : "-rotate-90"}`}
                />
                Recent Files
              </button>
              {recentFiles.length > 0 && (
                <button
                  onClick={onClearRecent}
                  className="p-1.5 rounded-md transition-all duration-200"
                  style={{ color: "var(--mocha-text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--mocha-error-bg)";
                    e.currentTarget.style.color = "var(--mocha-error)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--mocha-text-muted)";
                  }}
                  title="Clear all recent files"
                  data-testid="clear-recent-button"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* File list */}
          {(filesExpanded || isCollapsed) && (
            <div
              className={`flex-1 overflow-y-auto pb-4 ${isCollapsed ? "px-2 pt-2" : "px-3"}`}
              data-testid="recent-files-list"
            >
              {sortedRecentFiles.length > 0 ? (
                <div className={isCollapsed ? "space-y-2" : "space-y-1"}>
                  {sortedRecentFiles.map((file, index) => {
                    const openedFile = openedFiles.get(file.path);
                    return (
                      <RecentFileItem
                        key={file.path}
                        file={file}
                        openedFile={openedFile}
                        index={index}
                        isCollapsed={isCollapsed}
                        onClick={() => {
                          if (openedFile) {
                            onToggleFile(file.path);
                          } else {
                            onSelectFile(file.path);
                          }
                        }}
                        onRemove={() => onRemoveFile(file.path)}
                      />
                    );
                  })}
                </div>
              ) : !isCollapsed ? (
                <div
                  className="text-center py-10 animate-fade-in"
                  data-testid="empty-recent"
                >
                  <div
                    className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
                    style={{
                      background: "var(--mocha-surface-raised)",
                      border: "1px solid var(--mocha-border)",
                    }}
                  >
                    <FileText
                      className="w-5 h-5"
                      style={{ color: "var(--mocha-text-muted)" }}
                    />
                  </div>
                  <p
                    className="text-xs"
                    style={{ color: "var(--mocha-text-muted)" }}
                  >
                    No recent files
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Footer - status bar with collapse toggle and theme selector */}
      <div
        className="relative z-10 px-3 py-2.5"
        style={{
          background: "transparent",
        }}
      >
        {/* Single row: collapse toggle, status (expanded only), theme toggle */}
        <div
          className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "justify-between"}`}
        >
          {/* Collapse toggle button */}
          <button
            onClick={onToggleCollapsed}
            className="p-2 rounded-lg transition-all duration-200 shrink-0"
            style={{
              color: "var(--mocha-text-muted)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--mocha-surface-hover)";
              e.currentTarget.style.color = "var(--mocha-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--mocha-text-muted)";
            }}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>

          {/* Status - only show when expanded */}
          {!isCollapsed && (
            <div className="flex-1 flex justify-center">
              {openedCount > 0 ? (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: "var(--mocha-selection)",
                    border: "1px solid var(--mocha-selection-border)",
                    color: "var(--mocha-info)",
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: "var(--mocha-info)" }}
                  />
                  {activeCount} of {openedCount} active
                </div>
              ) : recentFiles.length > 0 ? (
                <p
                  className="text-xs text-center"
                  style={{ color: "var(--mocha-text-muted)" }}
                >
                  {recentFiles.length} recent{" "}
                  {recentFiles.length === 1 ? "file" : "files"}
                </p>
              ) : (
                <p
                  className="text-xs text-center"
                  style={{ color: "var(--mocha-text-faint)" }}
                >
                  Ready to analyze
                </p>
              )}
            </div>
          )}

          {/* Theme toggle - cycles through themes */}
          {(() => {
            const currentTheme =
              THEMES.find((t) => t.id === theme) || THEMES[0];
            const currentIndex = THEMES.findIndex((t) => t.id === theme);
            const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
            const Icon = currentTheme.icon;
            return (
              <button
                onClick={() => onThemeChange(nextTheme.id)}
                className="p-2 rounded-lg transition-all duration-200 shrink-0"
                style={{
                  color: "var(--mocha-text-muted)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--mocha-surface-hover)";
                  e.currentTarget.style.color = "var(--mocha-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--mocha-text-muted)";
                }}
                title={`${currentTheme.name} theme — click for ${nextTheme.name}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })()}
        </div>
      </div>
    </aside>
  );
});

export type { SidebarProps };
