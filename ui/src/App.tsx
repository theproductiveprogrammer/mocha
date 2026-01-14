import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Coffee, Upload, Sparkles } from 'lucide-react'
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
    appendFileLogs,
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

  // Search state for log stream
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIsRegex, setSearchIsRegex] = useState(false)
  const [searchCurrentIndex, setSearchCurrentIndex] = useState(0)

  // Ensure openedFiles is a Map (handles hydration)
  const safeOpenedFiles = useMemo(
    () => (openedFiles instanceof Map ? openedFiles : new Map<string, OpenedFileWithLogs>()),
    [openedFiles]
  )

  // Merged logs from all active files, sorted by timestamp
  const mergedLogs = useMemo(() => {
    const allLogs: LogEntry[] = []
    safeOpenedFiles.forEach((file) => {
      if (file.isActive) {
        allLogs.push(...file.logs)
      }
    })
    // Sort by timestamp (ascending - LogViewer will reverse for newest-first)
    return allLogs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
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

  // Polling effect for all active files
  useEffect(() => {
    if (!isTauri()) return

    // Get active files with Tauri paths (not browser files)
    const activeFiles = Array.from(safeOpenedFiles.values()).filter(
      f => f.isActive && f.path.startsWith('/')
    )

    if (activeFiles.length === 0) return

    const pollInterval = window.setInterval(async () => {
      for (const file of activeFiles) {
        try {
          const result = await readFile(file.path, file.lastModified)
          if (!result.success) continue
          const newSize = result.size ?? 0

          if (result.content && newSize > file.lastModified) {
            const newLines = parseLogFile(result.content, file.name, file.path)
            appendFileLogs(file.path, newLines.logs, newSize)
          }
        } catch (err) {
          console.error(`Polling error for ${file.name}:`, err)
        }
      }
    }, 5000) // Poll every 5 seconds

    return () => window.clearInterval(pollInterval)
  }, [safeOpenedFiles, appendFileLogs])

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
              className="animate-fade-in px-4 py-3 text-sm flex items-center justify-between"
              style={{
                background: 'var(--mocha-error-bg)',
                borderBottom: '1px solid var(--mocha-error-border)',
                color: 'var(--mocha-error)'
              }}
            >
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="px-2 py-1 rounded text-xs font-medium hover:opacity-80"
                style={{ background: 'var(--mocha-error)', color: 'var(--mocha-bg)' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading banner */}
          {isLoading && (
            <div
              className="animate-fade-in px-4 py-3 text-sm flex items-center gap-2"
              style={{
                background: 'var(--mocha-surface-raised)',
                borderBottom: '1px solid var(--mocha-border)',
                color: 'var(--mocha-accent)'
              }}
            >
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Loading file...
            </div>
          )}

          {/* Virtualized Log viewer */}
          {mergedLogs.length > 0 ? (
            <>
              <LogViewer
                logs={mergedLogs}
                onToggleStory={handleToggleStory}
                searchQuery={searchQuery}
                searchIsRegex={searchIsRegex}
                searchCurrentMatchHash={searchCurrentMatchHash}
              />
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
                scrollRef={storyPaneScrollRef}
              />
            </>
          ) : (
            <div
              className="flex-1 flex items-center justify-center"
              style={{ background: 'var(--mocha-bg)' }}
            >
              <div className="text-center max-w-md px-8">
                {/* Decorative coffee cup */}
                <div className="relative mb-8">
                  <div
                    className="w-24 h-24 mx-auto rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, var(--mocha-surface-raised) 0%, var(--mocha-surface) 100%)',
                      border: '1px solid var(--mocha-border)'
                    }}
                  >
                    <Coffee
                      className="w-12 h-12"
                      style={{ color: 'var(--mocha-accent)' }}
                      strokeWidth={1.5}
                    />
                  </div>
                  {/* Steam animation */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1">
                    <div
                      className="w-1 h-6 rounded-full animate-pulse-subtle"
                      style={{
                        background: 'linear-gradient(to top, var(--mocha-accent-muted), transparent)',
                        animationDelay: '0s'
                      }}
                    />
                    <div
                      className="w-1 h-8 rounded-full animate-pulse-subtle"
                      style={{
                        background: 'linear-gradient(to top, var(--mocha-accent-muted), transparent)',
                        animationDelay: '0.3s'
                      }}
                    />
                    <div
                      className="w-1 h-5 rounded-full animate-pulse-subtle"
                      style={{
                        background: 'linear-gradient(to top, var(--mocha-accent-muted), transparent)',
                        animationDelay: '0.6s'
                      }}
                    />
                  </div>
                </div>

                <h2
                  className="text-2xl font-semibold mb-3"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: 'var(--mocha-text)'
                  }}
                >
                  Ready to brew some logs
                </h2>
                <p
                  className="text-sm mb-8 leading-relaxed"
                  style={{ color: 'var(--mocha-text-secondary)' }}
                >
                  Drop a log file here, click the button below,<br />
                  or pick from your recent files in the sidebar.
                </p>
                <button
                  onClick={() => handleOpenFile()}
                  className="group px-6 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 mx-auto transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, var(--mocha-accent) 0%, var(--mocha-accent-hover) 100%)',
                    color: 'var(--mocha-bg)',
                    boxShadow: '0 4px 20px rgba(196, 167, 125, 0.3)'
                  }}
                  data-testid="open-file-btn"
                >
                  <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  Open Log File
                </button>

                {/* Keyboard shortcut hint */}
                <p
                  className="mt-6 text-xs"
                  style={{ color: 'var(--mocha-text-muted)' }}
                >
                  Pro tip: Drag &amp; drop works too
                </p>
              </div>
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div
              className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-fade-in"
              style={{
                background: 'rgba(20, 18, 16, 0.9)',
                backdropFilter: 'blur(8px)'
              }}
            >
              <div
                className="px-8 py-6 rounded-2xl flex items-center gap-4"
                style={{
                  background: 'var(--mocha-surface-raised)',
                  border: '2px dashed var(--mocha-accent)',
                  boxShadow: '0 0 40px rgba(196, 167, 125, 0.2)'
                }}
              >
                <Upload className="w-10 h-10" style={{ color: 'var(--mocha-accent)' }} />
                <div>
                  <div
                    className="font-semibold text-lg"
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      color: 'var(--mocha-text)'
                    }}
                  >
                    Drop your log file
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
