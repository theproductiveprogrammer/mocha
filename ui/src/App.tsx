import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { LogEntry, OpenedFileWithLogs } from './types'
import './types'
import { isTauri, waitForConnection, readFile, getRecentFiles, addRecentFile } from './api'
import { parseLogFile } from './parser'
import { useLogViewerStore, useSelectionStore, useFileStore, filterLogs } from './store'
import { Sidebar, Toolbar, LogViewer } from './components'

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

  // Selection store
  const {
    deletedHashes,
    cleanupInvalidHashes,
  } = useSelectionStore()

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
    setLoading,
    setError,
  } = useFileStore()

  // File input ref (for browser mode)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drag/drop hover state
  const [isDragging, setIsDragging] = useState(false)

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

        // Background updates
        setTimeout(() => {
          addRecentFile(filePath)
          const newRecentFile = { path: filePath, name: fileName, lastOpened: Date.now() }
          setRecentFiles([newRecentFile, ...recentFiles.filter(f => f.path !== filePath).slice(0, 19)])
          // Don't clear filters when adding a file - user may want to keep their filter
          cleanupInvalidHashes(parsed.logs.map(l => l.hash).filter((h): h is string => !!h))
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
  }, [safeOpenedFiles, openFile, toggleFileActive, setLoading, setError, setRecentFiles, recentFiles, cleanupInvalidHashes])

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
          const now = Date.now()
          setRecentFiles([
            { path: file.name, name: file.name, lastOpened: now },
            ...recentFiles.filter(f => f.path !== file.name).slice(0, 19),
          ])
          cleanupInvalidHashes(parsed.logs.map(l => l.hash).filter((h): h is string => !!h))
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
  }, [safeOpenedFiles, openFile, toggleFileActive, setLoading, setError, setRecentFiles, recentFiles, cleanupInvalidHashes])

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
  }, [setRecentFiles])

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
            appendFileLogs(file.path, newLines.logs)
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
    const safeDeletedHashes = deletedHashes instanceof Set ? deletedHashes : new Set<string>()
    return filterLogs(mergedLogs, filters, inactiveNames, safeDeletedHashes).length
  }, [mergedLogs, filters, inactiveNames, deletedHashes])

  return (
    <div className="h-screen flex bg-gray-50">
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
        />

        <div className="relative flex-1 flex flex-col overflow-hidden h-full">
          {error && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-700 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                Dismiss
              </button>
            </div>
          )}

          {isLoading && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-blue-700 text-sm">
              Loading file...
            </div>
          )}

          {/* Virtualized Log viewer */}
          {mergedLogs.length > 0 ? (
            <LogViewer logs={mergedLogs} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="text-center text-gray-500">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h2 className="text-xl font-medium mb-2">No log file open</h2>
                <p className="text-sm mb-4">
                  Click "Open File" in the sidebar, drag and drop a file here,<br />
                  or select from recent files
                </p>
                <button
                  onClick={() => handleOpenFile()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  data-testid="open-file-btn"
                >
                  Open File
                </button>
              </div>
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 flex items-center justify-center z-50 pointer-events-none">
              <div className="bg-blue-600 text-white px-6 py-4 rounded-lg flex items-center gap-3 shadow-lg">
                <Upload className="w-8 h-8" />
                <div>
                  <div className="font-semibold text-lg">Drop log file here</div>
                  <div className="text-sm text-blue-200">Accepts .log and .txt files</div>
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
