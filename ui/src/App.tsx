import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Upload, FileSearch, Zap } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { LogEntry, OpenedFileWithLogs } from './types'
import './types'
import { isTauri, waitForConnection, readFile, getRecentFiles, addRecentFile, clearRecentFiles } from './api'
import { parseLogFile } from './parser'
import { useLogViewerStore, useStoryStore, useFileStore, filterLogs } from './store'
import { Sidebar, Toolbar, LogViewer } from './components'
import { StoryPane } from './components/StoryPane'

function App() {
  // Log viewer store
  const {
    inactiveNames: rawInactiveNames,
    filters,
    input,
    addFilter,
    removeFilter,
    setInput,
  } = useLogViewerStore()

  // Ensure inactiveNames is a Set (handles hydration race condition)
  const inactiveNames = useMemo(
    () => (rawInactiveNames instanceof Set ? rawInactiveNames : new Set(Array.isArray(rawInactiveNames) ? rawInactiveNames : [])),
    [rawInactiveNames]
  )

  // Story store - multi-story support
  const {
    stories,
    activeStoryId,
    storyPaneHeight,
    storyPaneCollapsed,
    storyPaneMaximized,
    createStory,
    deleteStory,
    renameStory,
    setActiveStory,
    toggleStory,
    removeFromStory,
    clearStory,
    setStoryPaneHeight,
    setStoryPaneCollapsed,
    setStoryPaneMaximized,
  } = useStoryStore()

  // Ref to scroll the story pane content
  const storyPaneScrollRef = useRef<HTMLDivElement>(null)

  // Get active story
  const activeStory = useMemo(
    () => stories.find(s => s.id === activeStoryId),
    [stories, activeStoryId]
  )

  // File store - now with multi-file support
  const {
    openedFiles,
    recentFiles,
    isLoading,
    error,
    openFile,
    toggleFileActive,
    setRecentFiles,
    addRecentFile: addRecentFileToStore,
    removeRecentFile,
    clearOpenedFiles,
    setLoading,
    setError,
  } = useFileStore()

  // File input ref (for browser mode)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drag/drop hover state
  const [isDragging, setIsDragging] = useState(false)

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Search state for log stream
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIsRegex, setSearchIsRegex] = useState(false)
  const [searchCurrentIndex, setSearchCurrentIndex] = useState(0)

  // Jump-to-source state (from logbook)
  const [jumpToHash, setJumpToHash] = useState<string | null>(null)

  // Ensure openedFiles is a Map (handles hydration)
  const safeOpenedFiles = useMemo(
    () => (openedFiles instanceof Map ? openedFiles : new Map<string, OpenedFileWithLogs>()),
    [openedFiles]
  )

  // Merged logs from all active files, sorted by (timestamp, sortIndex)
  // sortIndex ensures stable ordering for lines without parseable timestamps
  const mergedLogs = useMemo(() => {
    const allLogs: LogEntry[] = []
    safeOpenedFiles.forEach((file) => {
      if (file.isActive) {
        allLogs.push(...file.logs)
      }
    })
    // Sort by timestamp first, then by sortIndex for stable ordering within same timestamp
    return allLogs.sort((a, b) => {
      const timestampDiff = (a.timestamp ?? 0) - (b.timestamp ?? 0)
      if (timestampDiff !== 0) return timestampDiff
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    })
  }, [safeOpenedFiles])

  // Story logs come directly from the story (independent of loaded files)
  const storyLogs = useMemo(() => {
    const entries = activeStory?.entries || []
    // Sort by timestamp (chronological order)
    return [...entries].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  }, [activeStory])

  // Filter logs for display (apply filters)
  const filteredLogs = useMemo(() => {
    return filterLogs(mergedLogs, filters, inactiveNames)
  }, [mergedLogs, filters, inactiveNames])

  // Search matches in filtered logs
  // Note: filteredLogs is in ascending order (oldest first), but LogViewer displays
  // newest-first. So we reverse the matches to match visual order (top to bottom).
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []

    const matches: number[] = [] // indices into filteredLogs

    try {
      const regex = searchIsRegex
        ? new RegExp(searchQuery, 'gi')
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

      filteredLogs.forEach((log, index) => {
        if (regex.test(log.data)) {
          matches.push(index)
        }
        regex.lastIndex = 0 // Reset for next test
      })
    } catch {
      // Invalid regex
    }

    // Reverse to match visual order (newest/top first)
    return matches.reverse()
  }, [searchQuery, searchIsRegex, filteredLogs])

  // Reset search index when query changes
  useEffect(() => {
    setSearchCurrentIndex(0)
  }, [searchQuery, searchIsRegex])

  // Auto-collapse story pane when all logs are closed
  useEffect(() => {
    if (mergedLogs.length === 0) {
      setStoryPaneCollapsed(true)
    }
  }, [mergedLogs.length, setStoryPaneCollapsed])

  // Current match hash for scrolling and highlighting
  const searchCurrentMatchHash = useMemo(() => {
    if (searchMatches.length === 0) return null
    const matchIndex = searchMatches[searchCurrentIndex]
    return filteredLogs[matchIndex]?.hash || null
  }, [searchMatches, searchCurrentIndex, filteredLogs])

  // Search navigation
  const handleSearchNext = useCallback(() => {
    if (searchMatches.length > 0) {
      setSearchCurrentIndex((prev) => (prev + 1) % searchMatches.length)
    }
  }, [searchMatches.length])

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length > 0) {
      setSearchCurrentIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length)
    }
  }, [searchMatches.length])

  // Handle toggling a log in/out of story - expand pane and scroll when adding
  const handleToggleStory = useCallback((log: LogEntry) => {
    // If no active story exists, create one first
    if (!activeStory) {
      createStory()
    }

    // Check if this log is already in the story (will be removed)
    const isRemoving = activeStory?.entries.some(e => e.hash === log.hash)

    // Toggle the log
    toggleStory(log)

    // If adding (not removing), expand pane and scroll to the new entry
    if (!isRemoving) {
      // Expand if collapsed
      if (storyPaneCollapsed) {
        setStoryPaneCollapsed(false)
      }

      // Scroll to the specific entry after render
      setTimeout(() => {
        const card = document.querySelector(`[data-story-hash="${log.hash}"]`)
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 150)
    }
  }, [activeStory, createStory, toggleStory, storyPaneCollapsed, setStoryPaneCollapsed])

  // Count of active files
  const activeFileCount = useMemo(() => {
    let count = 0
    safeOpenedFiles.forEach((file) => {
      if (file.isActive) count++
    })
    return count
  }, [safeOpenedFiles])

  // Load recent files on mount
  useEffect(() => {
    const loadRecentFiles = async () => {
      if (!isTauri()) return
      const connected = await waitForConnection(5000)
      if (!connected) return
      try {
        const recent = await getRecentFiles()
        setRecentFiles(recent)
      } catch (err) {
        console.error('Failed to load recent files:', err)
      }
    }
    loadRecentFiles()
  }, [setRecentFiles])

  // Handle opening a file (adds to view, doesn't replace)
  const handleOpenFile = useCallback(async (path?: string) => {
    if (path) {
      // Check if file is already opened
      const existing = safeOpenedFiles.get(path)
      if (existing) {
        // File already open - just ensure it's active
        if (!existing.isActive) {
          toggleFileActive(path)
        }
        return
      }

      if (!isTauri()) {
        setError('Cannot open files by path in browser mode')
        return
      }

      setLoading(true)
      setError(null)

      try {
        console.time('total')
        console.time('read')
        const result = await readFile(path, 0)
        console.timeEnd('read')

        if (!result.success) {
          setError(result.error || 'Failed to read file')
          setLoading(false)
          return
        }

        const fileContent = result.content ?? ''
        const filePath = result.path ?? path
        const fileName = result.name ?? path.split('/').pop() ?? 'unknown'
        const fileSize = result.size ?? 0

        console.time('parse')
        const parsed = parseLogFile(fileContent, fileName, filePath)
        console.timeEnd('parse')

        console.log(`${parsed.logs.length} logs from ${fileName}`)

        // Add file to opened files map
        const newFile: OpenedFileWithLogs = {
          path: filePath,
          name: fileName,
          size: fileSize,
          logs: parsed.logs,
          isActive: true,
          lastModified: fileSize,
          mtime: result.mtime,
        }
        openFile(newFile)

        console.timeEnd('total')

        // Background updates - use store action to avoid race conditions with multiple drops
        setTimeout(() => {
          addRecentFile(filePath)  // Persist to Tauri backend
          addRecentFileToStore({ path: filePath, name: fileName, lastOpened: Date.now() })
        }, 0)

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open file')
      } finally {
        setLoading(false)
      }
    } else {
      if (isTauri()) {
        try {
          const selected = await openFileDialog({
            multiple: false,
            filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
          })
          if (selected) {
            handleOpenFile(selected)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to open file dialog')
        }
      } else {
        fileInputRef.current?.click()
      }
    }
  }, [safeOpenedFiles, openFile, toggleFileActive, setLoading, setError, addRecentFileToStore])

  // Jump to source from logbook - open file if needed, minimize logbook and scroll to the log
  const handleJumpToSource = useCallback(async (log: LogEntry) => {
    const hash = log.hash
    if (!hash) return

    // If maximized, minimize first
    if (storyPaneMaximized) {
      setStoryPaneMaximized(false)
    }

    // Try to find the file path - use filePath if available, otherwise search recent files by name
    let filePath = log.filePath
    if (!filePath) {
      // Fall back to finding in recent files by filename
      const recentMatch = recentFiles.find(f => f.name === log.name)
      if (recentMatch) {
        filePath = recentMatch.path
      }
    }

    // Check if the file is currently open and active
    const openedFile = filePath ? safeOpenedFiles.get(filePath) : null
    const isFileOpenAndActive = openedFile?.isActive

    if (filePath && !openedFile) {
      // File is not open - need to open it first
      await handleOpenFile(filePath)

      // Wait for the file to be loaded and rendered, then scroll
      setTimeout(() => {
        setJumpToHash(hash)
      }, 300)
    } else if (openedFile && !isFileOpenAndActive) {
      // File is open but not active - activate it first
      toggleFileActive(filePath!)

      // Wait for re-render, then scroll
      setTimeout(() => {
        setJumpToHash(hash)
      }, 100)
    } else {
      // File is already open and active - just scroll
      setJumpToHash(hash)
    }
  }, [storyPaneMaximized, setStoryPaneMaximized, safeOpenedFiles, recentFiles, handleOpenFile, toggleFileActive])

  // Clear jump hash after scroll completes
  const handleJumpComplete = useCallback(() => {
    setJumpToHash(null)
  }, [])

  // Handle file selection from browser file input
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check if file is already opened
    const existing = safeOpenedFiles.get(file.name)
    if (existing) {
      if (!existing.isActive) {
        toggleFileActive(file.name)
      }
      e.target.value = ''
      return
    }

    setLoading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string
        const parsed = parseLogFile(content, file.name, file.name)

        const newFile: OpenedFileWithLogs = {
          path: file.name,
          name: file.name,
          size: content.length,
          logs: parsed.logs,
          isActive: true,
          lastModified: content.length,
        }
        openFile(newFile)

        setTimeout(() => {
          addRecentFileToStore({ path: file.name, name: file.name, lastOpened: Date.now() })
        }, 0)

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file')
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setLoading(false)
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [safeOpenedFiles, openFile, toggleFileActive, setLoading, setError, addRecentFileToStore])

  // Tauri drag/drop event listener - uses native file paths for recent files persistence
  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | undefined

    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        setIsDragging(true)
      } else if (event.payload.type === 'drop') {
        setIsDragging(false)
        // Open each dropped file using the same path as "Open File"
        const paths = event.payload.paths as string[]
        for (const path of paths) {
          // Filter to only .log and .txt files
          const lowerPath = path.toLowerCase()
          if (lowerPath.endsWith('.log') || lowerPath.endsWith('.txt')) {
            handleOpenFile(path)
          }
        }
      } else {
        // cancel
        setIsDragging(false)
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [handleOpenFile])

  // Handle clicking a file in sidebar - toggle if open, open if not
  const handleSelectFile = useCallback((path?: string) => {
    if (!path) {
      handleOpenFile()
      return
    }

    const existing = safeOpenedFiles.get(path)
    if (existing) {
      // File is already opened - toggle its active state
      toggleFileActive(path)
    } else {
      // File not opened - open it
      handleOpenFile(path)
    }
  }, [safeOpenedFiles, handleOpenFile, toggleFileActive])

  // Toggle a file's active state (called from sidebar)
  const handleToggleFile = useCallback((path: string) => {
    toggleFileActive(path)
  }, [toggleFileActive])

  const handleClearRecent = useCallback(() => {
    setRecentFiles([])
    clearOpenedFiles()  // Also clear opened files so logs disappear
    clearRecentFiles()  // Also clear Tauri's ~/.mocha/recent.json
  }, [setRecentFiles, clearOpenedFiles])

  const handleRemoveFile = useCallback((path: string) => {
    removeRecentFile(path)
  }, [removeRecentFile])

  const handleToggleWatch = useCallback(() => {
    // For now, watching is disabled with multi-file - would need more complex logic
    // TODO: Implement multi-file watching
  }, [])

  // Polling effect for active files
  // Note: We get fresh state inside the callback to avoid stale closure issues
  // that could cause lines to be skipped or duplicated
  useEffect(() => {
    if (!isTauri()) return

    // Only run polling if we have active files (quick check)
    const hasActiveFiles = Array.from(safeOpenedFiles.values()).some(
      f => f.isActive && f.path.startsWith('/')
    )
    if (!hasActiveFiles) return

    const pollInterval = window.setInterval(async () => {
      // Get FRESH state inside callback to avoid stale closures
      const currentFiles = useFileStore.getState().openedFiles
      const activeFiles = Array.from(currentFiles.values()).filter(
        f => f.isActive && f.path.startsWith('/')
      )

      for (const file of activeFiles) {
        try {
          const result = await readFile(file.path, file.lastModified)
          if (!result.success) continue
          const newSize = result.size ?? 0

          if (result.content && newSize > file.lastModified) {
            const newLines = parseLogFile(result.content, file.name, file.path)
            // Use store action directly to avoid stale closure
            useFileStore.getState().appendFileLogs(file.path, newLines.logs, newSize)
          }
        } catch (err) {
          console.error(`Polling error for ${file.name}:`, err)
        }
      }
    }, 5000) // Poll every 5 seconds

    return () => window.clearInterval(pollInterval)
  }, [safeOpenedFiles]) // Only re-create interval when files change

  // Compute visible count from current filters
  const visibleCount = useMemo(() => {
    if (mergedLogs.length === 0) return 0
    return filterLogs(mergedLogs, filters, inactiveNames).length
  }, [mergedLogs, filters, inactiveNames])

  return (
    <div className="h-screen flex" style={{ background: 'var(--mocha-bg)' }}>
      <input
        type="file"
        ref={fileInputRef}
        accept=".log,.txt"
        onChange={handleFileInputChange}
        className="hidden"
        data-testid="file-input"
      />

      <Sidebar
        recentFiles={recentFiles}
        openedFiles={safeOpenedFiles}
        onSelectFile={handleSelectFile}
        onToggleFile={handleToggleFile}
        onRemoveFile={handleRemoveFile}
        onClearRecent={handleClearRecent}
        isCollapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Toolbar
          filters={filters}
          filterInput={input}
          activeFileCount={activeFileCount}
          totalLines={mergedLogs.length}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          onFilterInputChange={setInput}
          onToggleWatch={handleToggleWatch}
          visibleCount={visibleCount}
          isWatching={false}
          // Search props
          searchQuery={searchQuery}
          searchIsRegex={searchIsRegex}
          searchMatchCount={searchMatches.length}
          searchCurrentIndex={searchCurrentIndex}
          onSearchChange={setSearchQuery}
          onSearchRegexToggle={() => setSearchIsRegex(!searchIsRegex)}
          onSearchNext={handleSearchNext}
          onSearchPrev={handleSearchPrev}
        />

        <div className="relative flex-1 flex flex-col overflow-hidden h-full">
          {/* Error banner */}
          {error && (
            <div
              className="animate-fade-in px-5 py-3 text-sm flex items-center justify-between"
              style={{
                background: 'var(--mocha-error-bg)',
                borderBottom: '1px solid var(--mocha-error-border)',
                color: 'var(--mocha-error)'
              }}
            >
              <span className="font-medium">{error}</span>
              <button
                onClick={() => setError(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105"
                style={{ background: 'var(--mocha-error)', color: 'var(--mocha-bg)' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading banner */}
          {isLoading && (
            <div
              className="animate-fade-in px-5 py-3 text-sm flex items-center gap-3"
              style={{
                background: 'var(--mocha-surface-raised)',
                borderBottom: '1px solid var(--mocha-border)',
                color: 'var(--mocha-accent)'
              }}
            >
              <div
                className="w-4 h-4 rounded-full animate-spin"
                style={{
                  border: '2px solid var(--mocha-accent-muted)',
                  borderTopColor: 'var(--mocha-accent)',
                }}
              />
              <span className="font-medium">Loading file...</span>
            </div>
          )}

          {/* Virtualized Log viewer */}
          {mergedLogs.length > 0 ? (
            <LogViewer
              logs={mergedLogs}
              onToggleStory={handleToggleStory}
              searchQuery={searchQuery}
              searchIsRegex={searchIsRegex}
              searchCurrentMatchHash={searchCurrentMatchHash}
              jumpToHash={jumpToHash}
              onJumpComplete={handleJumpComplete}
            />
          ) : (
            /* Beautiful empty state */
            <div
              className="flex-1 flex items-center justify-center relative overflow-hidden"
              style={{ background: 'var(--mocha-bg)' }}
            >
              {/* Ambient background glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(232, 168, 84, 0.06) 0%, transparent 60%)',
                }}
              />

              {/* Grid pattern overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-30 grid-pattern"
              />

              <div className="relative z-10 text-center max-w-lg px-8 animate-fade-in-up">
                {/* Iconic illustration with distant orbiting particles */}
                <div className="relative mb-10 w-72 h-72 mx-auto">
                  {/* Center icon */}
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)',
                      border: '1px solid var(--mocha-border)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}
                  >
                    <FileSearch
                      className="w-9 h-9"
                      style={{ color: 'var(--mocha-accent)' }}
                      strokeWidth={1.5}
                    />
                  </div>

                  {/* Orbiting particles - very slow, spread apart radially, offset starting positions */}
                  {/* Outer orbit - 12 o'clock start */}
                  <div className="absolute inset-0 animate-orbit" style={{ animationDuration: '140s', animationDelay: '0s' }}>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                      style={{
                        background: 'var(--mocha-accent)',
                        opacity: 0.5,
                        boxShadow: '0 0 6px var(--mocha-accent)',
                      }}
                    />
                  </div>
                  {/* Middle-outer orbit - 4 o'clock start (120°) */}
                  <div className="absolute inset-8 animate-orbit" style={{ animationDuration: '170s', animationDelay: '-56.7s', animationDirection: 'reverse' }}>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{
                        background: 'var(--mocha-info)',
                        opacity: 0.45,
                        boxShadow: '0 0 5px var(--mocha-info)',
                      }}
                    />
                  </div>
                  {/* Middle-inner orbit - 7 o'clock start (210°) */}
                  <div className="absolute inset-16 animate-orbit" style={{ animationDuration: '130s', animationDelay: '-75.8s' }}>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{
                        background: 'var(--mocha-accent)',
                        opacity: 0.35,
                        boxShadow: '0 0 4px var(--mocha-accent)',
                      }}
                    />
                  </div>
                  {/* Inner orbit - 10 o'clock start (300°) */}
                  <div className="absolute inset-[68px] animate-orbit" style={{ animationDuration: '110s', animationDelay: '-91.7s', animationDirection: 'reverse' }}>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{
                        background: 'var(--mocha-info)',
                        opacity: 0.3,
                      }}
                    />
                  </div>
                </div>

                <h2
                  className="text-2xl font-semibold mb-4 font-display"
                  style={{ color: 'var(--mocha-text)' }}
                >
                  Ready to analyze
                </h2>

                <p
                  className="text-sm mb-10 leading-relaxed"
                  style={{ color: 'var(--mocha-text-secondary)' }}
                >
                  Drop a log file anywhere on this window, or use the button below.
                  <br />
                  <span style={{ color: 'var(--mocha-text-muted)' }}>
                    Your recent files are waiting in the sidebar.
                  </span>
                </p>

                <button
                  onClick={() => handleOpenFile()}
                  className="group px-8 py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 mx-auto transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, var(--mocha-accent) 0%, #d49544 100%)',
                    color: 'var(--mocha-bg)',
                    boxShadow: '0 4px 24px var(--mocha-accent-glow), 0 8px 32px rgba(0,0,0,0.2)',
                  }}
                  data-testid="open-file-btn"
                >
                  <Zap className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
                  Open Log File
                </button>

                {/* Keyboard shortcut hint */}
                <p
                  className="mt-8 text-xs flex items-center justify-center gap-2"
                  style={{ color: 'var(--mocha-text-muted)' }}
                >
                  <span
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--mocha-surface-raised)',
                      border: '1px solid var(--mocha-border)',
                    }}
                  >
                    Drag & Drop
                  </span>
                  <span>or</span>
                  <span
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{
                      background: 'var(--mocha-surface-raised)',
                      border: '1px solid var(--mocha-border)',
                    }}
                  >
                    .log / .txt
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Story pane - always visible when there are stories or logs */}
          {(mergedLogs.length > 0 || storyLogs.length > 0 || stories.length > 0) && (
            <StoryPane
              stories={stories}
              activeStoryId={activeStoryId}
              storyLogs={storyLogs}
              height={storyPaneHeight}
              collapsed={storyPaneCollapsed}
              maximized={storyPaneMaximized}
              onRemoveFromStory={removeFromStory}
              onClearStory={clearStory}
              onHeightChange={setStoryPaneHeight}
              onToggleCollapsed={() => setStoryPaneCollapsed(!storyPaneCollapsed)}
              onToggleMaximized={() => setStoryPaneMaximized(!storyPaneMaximized)}
              onCreateStory={createStory}
              onDeleteStory={deleteStory}
              onRenameStory={renameStory}
              onSetActiveStory={setActiveStory}
              onJumpToSource={handleJumpToSource}
              scrollRef={storyPaneScrollRef}
            />
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div
              className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-fade-in"
              style={{
                background: 'rgba(8, 9, 12, 0.95)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div
                className="px-12 py-10 rounded-3xl flex flex-col items-center gap-6 animate-scale-in"
                style={{
                  background: 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)',
                  border: '2px dashed var(--mocha-accent)',
                  boxShadow: '0 0 60px var(--mocha-accent-glow), 0 20px 60px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'var(--mocha-accent-muted)',
                    border: '1px solid rgba(232, 168, 84, 0.3)',
                  }}
                >
                  <Upload
                    className="w-10 h-10 animate-float"
                    style={{ color: 'var(--mocha-accent)' }}
                  />
                </div>
                <div className="text-center">
                  <div
                    className="font-semibold text-xl mb-2 font-display"
                    style={{ color: 'var(--mocha-text)' }}
                  >
                    Drop to analyze
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: 'var(--mocha-text-secondary)' }}
                  >
                    Accepts .log and .txt files
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
