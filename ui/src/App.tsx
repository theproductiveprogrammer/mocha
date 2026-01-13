import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import type { LogEntry } from './types'
import './types'
import { isTauri, waitForConnection, readFile, getRecentFiles, addRecentFile } from './api'
import { parseLogFile } from './parser'
import { useLogViewerStore, useSelectionStore, useFileStore, filterLogs } from './store'
import { Sidebar, Toolbar, DropZone, LogViewer, getServiceName } from './components'

function App() {
  // Logs state - now in React state for virtualized LogViewer
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [serviceNames, setServiceNames] = useState<string[]>([])

  // Log viewer store
  const {
    inactiveNames: rawInactiveNames,
    filters,
    input,
    toggleName,
    addFilter,
    removeFilter,
    clearFilters,
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

  // Watching/polling state
  const [isWatching, setIsWatching] = useState(false)
  const pollIntervalRef = useRef<number | null>(null)
  const fileSizeRef = useRef<number>(0)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Handle opening a file
  const handleOpenFile = useCallback(async (path?: string) => {
    if (path) {
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
        const parsed = parseLogFile(fileContent, fileName)
        console.timeEnd('parse')

        console.log(`${parsed.logs.length} logs`)

        // Update state
        console.time('setState')
        setLogs(parsed.logs)
        setServiceNames(Array.from(new Set(parsed.logs.map(getServiceName))).sort())
        setCurrentFile({ path: filePath, name: fileName, size: fileSize })
        fileSizeRef.current = fileSize
        console.timeEnd('setState')

        console.timeEnd('total')

        // Background updates
        setTimeout(() => {
          addRecentFile(filePath)
          const newRecentFile = { path: filePath, name: fileName, lastOpened: Date.now() }
          setRecentFiles([newRecentFile, ...recentFiles.filter(f => f.path !== filePath).slice(0, 19)])
          clearFilters()
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
  }, [setLoading, setError, setCurrentFile, setRecentFiles, recentFiles, clearFilters, cleanupInvalidHashes])

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
        const parsed = parseLogFile(content, file.name)

        setLogs(parsed.logs)
        setServiceNames(Array.from(new Set(parsed.logs.map(getServiceName))).sort())

        setTimeout(() => {
          setCurrentFile({ path: file.name, name: file.name, size: content.length })
          const now = Date.now()
          setRecentFiles([
            { path: file.name, name: file.name, lastOpened: now },
            ...recentFiles.filter(f => f.path !== file.name).slice(0, 19),
          ])
          clearFilters()
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
  }, [setLoading, setError, setCurrentFile, setRecentFiles, recentFiles, clearFilters, cleanupInvalidHashes])

  // Handle file drop
  const handleFileDrop = useCallback((content: string, fileName: string) => {
    try {
      const parsed = parseLogFile(content, fileName)
      setLogs(parsed.logs)
      setServiceNames(Array.from(new Set(parsed.logs.map(getServiceName))).sort())
      setError(null)

      setTimeout(() => {
        setCurrentFile({ path: fileName, name: fileName, size: content.length })
        const now = Date.now()
        setRecentFiles([
          { path: fileName, name: fileName, lastOpened: now },
          ...recentFiles.filter(f => f.path !== fileName).slice(0, 19),
        ])
        clearFilters()
        cleanupInvalidHashes(parsed.logs.map(l => l.hash).filter((h): h is string => !!h))
      }, 0)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    }
  }, [setCurrentFile, setRecentFiles, recentFiles, clearFilters, cleanupInvalidHashes, setError])

  const handleSelectFile = useCallback((path?: string) => {
    handleOpenFile(path)
  }, [handleOpenFile])

  const handleClearRecent = useCallback(() => {
    setRecentFiles([])
  }, [setRecentFiles])

  const handleToggleWatch = useCallback(() => {
    setIsWatching(prev => !prev)
  }, [])

  // Polling effect
  useEffect(() => {
    if (!isWatching || !currentFile?.path || !isTauri()) {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const result = await readFile(currentFile.path, fileSizeRef.current)
        if (!result.success) return
        const newSize = result.size ?? 0

        if (result.content && newSize > fileSizeRef.current) {
          const newLines = parseLogFile(result.content, currentFile.name)
          setLogs(prev => [...prev, ...newLines.logs])
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

  // Compute visible count from current filters
  const visibleCount = (() => {
    if (logs.length === 0) return 0
    const safeDeletedHashes = deletedHashes instanceof Set ? deletedHashes : new Set<string>()
    return filterLogs(logs, filters, inactiveNames, safeDeletedHashes).length
  })()

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
        currentFile={currentFile}
        onSelectFile={handleSelectFile}
        onClearRecent={handleClearRecent}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
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
          totalLines={logs.length}
          truncated={false}
          visibleCount={visibleCount}
          isWatching={isWatching}
        />

        <DropZone onFileDrop={handleFileDrop}>
          <div className="flex-1 flex flex-col overflow-hidden h-full">
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
            {logs.length > 0 ? (
              <LogViewer logs={logs} />
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
