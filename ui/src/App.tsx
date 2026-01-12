import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FileText } from 'lucide-react'
import type { ParsedLogFileResult } from './types'
import './types'
import { isWebUI, waitForConnection, readFile, getRecentFiles, addRecentFile } from './api'
import { parseLogFile } from './parser'
import { useLogViewerStore, useSelectionStore, useFileStore, filterLogs } from './store'
import { LogViewer, Sidebar, Toolbar, DropZone } from './components'

function App() {
  // Log viewer store
  const {
    inactiveNames,
    filters,
    input,
    toggleName,
    addFilter,
    removeFilter,
    clearFilters,
    setInput,
  } = useLogViewerStore()

  // Selection store
  const {
    deletedHashes,
    cleanupInvalidHashes,
  } = useSelectionStore()

  // File store
  const {
    currentFile,
    recentFiles,
    isLoading,
    error,
    setCurrentFile,
    setRecentFiles,
    setLoading,
    setError,
  } = useFileStore()

  // Parsed logs state
  const [parseResult, setParseResult] = useState<ParsedLogFileResult | null>(null)

  // Watching/polling state
  const [isWatching, setIsWatching] = useState(false)
  const pollIntervalRef = useRef<number | null>(null)
  const fileSizeRef = useRef<number>(0)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get unique service names from parsed logs
  const serviceNames = useMemo(() => {
    if (!parseResult) return []
    const names = new Set(parseResult.logs.map((log) => log.name))
    return Array.from(names).sort()
  }, [parseResult])

  // Filter logs using the store state (including deleted hashes)
  const filteredLogs = useMemo(() => {
    if (!parseResult) return []
    return filterLogs(parseResult.logs, filters, inactiveNames, deletedHashes)
  }, [parseResult, filters, inactiveNames, deletedHashes])

  // Load recent files on mount
  useEffect(() => {
    const loadRecentFiles = async () => {
      if (!isWebUI()) return

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

  // Handle opening a file (either by path or via file dialog)
  const handleOpenFile = useCallback(async (path?: string) => {
    if (path) {
      // Opening a file by path (from recent files or WebUI)
      if (!isWebUI()) {
        setError('Cannot open files by path in browser mode')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const result = await readFile(path, 0)

        if (!result.success) {
          setError(result.error || 'Failed to read file')
          setLoading(false)
          return
        }

        // Extract values with defaults
        const fileContent = result.content ?? ''
        const filePath = result.path ?? path
        const fileName = result.name ?? path.split('/').pop() ?? 'unknown'
        const fileSize = result.size ?? 0

        // Parse the file content
        const parsed = parseLogFile(fileContent, fileName)
        setParseResult(parsed)

        // Update current file
        setCurrentFile({
          path: filePath,
          name: fileName,
          size: fileSize,
        })

        // Track file size for polling
        fileSizeRef.current = fileSize

        // Add to recent files
        await addRecentFile(filePath)

        // Refresh recent files list
        const recent = await getRecentFiles()
        setRecentFiles(recent)

        // Clear filters and stale selection state for new file
        clearFilters()
        cleanupInvalidHashes(parsed.logs.map(l => l.hash).filter((h): h is string => !!h))

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open file')
      } finally {
        setLoading(false)
      }
    } else {
      // Trigger file dialog
      fileInputRef.current?.click()
    }
  }, [setLoading, setError, setCurrentFile, setRecentFiles, clearFilters, cleanupInvalidHashes])

  // Handle file selection from browser file input
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string
        const result = parseLogFile(content, file.name)
        setParseResult(result)

        // Update current file (browser mode - path is just filename)
        setCurrentFile({
          path: file.name,
          name: file.name,
          size: content.length,
        })

        // Add to recent files (browser mode - uses filename as path)
        const now = Date.now()
        setRecentFiles([
          { path: file.name, name: file.name, lastOpened: now },
          ...recentFiles.filter(f => f.path !== file.name).slice(0, 19),
        ])

        // Clear filters and stale selection state for new file
        clearFilters()
        cleanupInvalidHashes(result.logs.map(l => l.hash).filter((h): h is string => !!h))

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file')
        setParseResult(null)
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setLoading(false)
    }
    reader.readAsText(file)

    // Reset input so same file can be selected again
    e.target.value = ''
  }, [setLoading, setError, setCurrentFile, setRecentFiles, recentFiles, clearFilters, cleanupInvalidHashes])

  // Handle file drop from DropZone
  const handleFileDrop = useCallback((content: string, fileName: string) => {
    try {
      const result = parseLogFile(content, fileName)
      setParseResult(result)
      setError(null)

      // Update current file
      setCurrentFile({
        path: fileName,
        name: fileName,
        size: content.length,
      })

      // Add to recent files
      const now = Date.now()
      setRecentFiles([
        { path: fileName, name: fileName, lastOpened: now },
        ...recentFiles.filter(f => f.path !== fileName).slice(0, 19),
      ])

      // Clear filters and stale selection state for new file
      clearFilters()
      cleanupInvalidHashes(result.logs.map(l => l.hash).filter((h): h is string => !!h))

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setParseResult(null)
    }
  }, [setCurrentFile, setRecentFiles, recentFiles, clearFilters, cleanupInvalidHashes, setError])

  // Handle file selection from sidebar
  const handleSelectFile = useCallback((path?: string) => {
    handleOpenFile(path)
  }, [handleOpenFile])

  // Handle clearing recent files
  const handleClearRecent = useCallback(() => {
    setRecentFiles([])
  }, [setRecentFiles])

  // Handle watch toggle
  const handleToggleWatch = useCallback(() => {
    setIsWatching(prev => !prev)
  }, [])

  // Polling effect for file updates
  useEffect(() => {
    if (!isWatching || !currentFile?.path || !isWebUI()) {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // Start polling
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const result = await readFile(currentFile.path, fileSizeRef.current)

        if (!result.success) return

        const newSize = result.size ?? 0

        // If file has new content
        if (result.content && newSize > fileSizeRef.current) {
          // Parse new lines
          const newLines = parseLogFile(result.content, currentFile.name)

          // Append to existing logs
          setParseResult(prev => {
            if (!prev) return newLines
            return {
              logs: [...prev.logs, ...newLines.logs],
              totalLines: prev.totalLines + newLines.totalLines,
              truncated: prev.truncated,
            }
          })

          // Update tracked size
          fileSizeRef.current = newSize
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000)

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isWatching, currentFile])

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".log,.txt"
        onChange={handleFileInputChange}
        className="hidden"
        data-testid="file-input"
      />

      {/* Sidebar */}
      <Sidebar
        recentFiles={recentFiles}
        currentFile={currentFile}
        onSelectFile={handleSelectFile}
        onClearRecent={handleClearRecent}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <Toolbar
          serviceNames={serviceNames}
          inactiveNames={inactiveNames}
          filters={filters}
          filterInput={input}
          currentFile={currentFile}
          onToggleService={(name) => toggleName(serviceNames, name)}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          onFilterInputChange={setInput}
          onToggleWatch={handleToggleWatch}
          totalLines={parseResult?.totalLines ?? 0}
          truncated={parseResult?.truncated ?? false}
          visibleCount={filteredLogs.length}
          isWatching={isWatching}
        />

        {/* Main content with DropZone */}
        <DropZone onFileDrop={handleFileDrop}>
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* Error display */}
            {error && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-700 text-sm flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-red-500 hover:text-red-700"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-blue-700 text-sm">
                Loading file...
              </div>
            )}

            {/* Log viewer or empty state */}
            {parseResult ? (
              <div className="flex-1 overflow-hidden">
                <LogViewer logs={parseResult.logs} />
              </div>
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
          </div>
        </DropZone>
      </div>
    </div>
  )
}

export default App
