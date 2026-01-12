import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, Check, Package, X, Server, AlertCircle, Upload, Code, Filter, MousePointer, Trash2, FolderOpen, Loader2 } from 'lucide-react'
// Import types (WebUI global type is declared in types.ts)
import type { ParsedLogFileResult } from './types'
import './types'
// Import WebUI API wrapper
import { isWebUI, waitForConnection, readFile, getRecentFiles } from './api'
// Import log parser
import { parseLogFile } from './parser'
// Import store and helpers
import { useLogViewerStore, useSelectionStore, useFileStore, parseFilterInput, filterLogs } from './store'
// Import components
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
    selectedHashes,
    deletedHashes,
    wrappedHashes,
    selectAll,
    deleteSelected,
    clearSelection,
    clearDeleted,
  } = useSelectionStore()

  // File store
  const {
    currentFile,
    recentFiles,
    isLoading,
    error: fileError,
    setCurrentFile,
    setRecentFiles,
    setLoading,
    setError: setFileError,
  } = useFileStore()

  // WebUI integration state
  const [webuiDetected, setWebuiDetected] = useState<boolean | null>(null)
  const [recentFilesResult, setRecentFilesResult] = useState<string | null>(null)
  const [readFileResult, setReadFileResult] = useState<string | null>(null)
  const [webuiError, setWebuiError] = useState<string | null>(null)

  // Parser test state
  const [parseResult, setParseResult] = useState<ParsedLogFileResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Watching/polling state
  const [isWatching, setIsWatching] = useState(false)

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

  // Get all hashes for selection operations
  const allHashes = useMemo(() => {
    return filteredLogs.map((log) => log.hash).filter((h): h is string => !!h)
  }, [filteredLogs])

  // Test WebUI integration on mount using the API wrapper
  useEffect(() => {
    const testWebUI = async () => {
      // Check if webui is available using the API wrapper
      const detected = isWebUI()
      setWebuiDetected(detected)

      if (!detected) {
        setWebuiError('Not running in WebUI context (expected when using npm run dev)')
        return
      }

      // Wait for WebSocket connection using the API wrapper
      const connected = await waitForConnection(5000)
      if (!connected) {
        setWebuiError('WebSocket connection timeout')
        return
      }

      try {
        // Test getRecentFiles using the API wrapper
        const recentFiles = await getRecentFiles()
        setRecentFilesResult(JSON.stringify(recentFiles))

        // Test readFile using the API wrapper
        const fileResult = await readFile('./prd.json', 0)
        if (fileResult.success) {
          setReadFileResult(`Read ${fileResult.name}: ${fileResult.size} bytes`)
        } else {
          setReadFileResult(`Error: ${fileResult.error}`)
        }
      } catch (err) {
        setWebuiError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    testWebUI()
  }, [])

  // Handle filter input submission
  const handleFilterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      const filter = parseFilterInput(input)
      if (filter) {
        addFilter(filter)
        setInput('')
      }
    }
  }

  // Handle file selection from sidebar
  const handleSelectFile = (path?: string) => {
    if (path) {
      // Re-open a recent file - for now just update current file
      // In real implementation this would call readFile via WebUI
      const file = recentFiles.find(f => f.path === path)
      if (file) {
        setCurrentFile({ path: file.path, name: file.name })
      }
    } else {
      // Open file dialog - trigger file input click
      fileInputRef.current?.click()
    }
  }

  // Handle clearing recent files
  const handleClearRecent = () => {
    setRecentFiles([])
  }

  // Handle watch toggle
  const handleToggleWatch = () => {
    setIsWatching(!isWatching)
  }

  // Handle file drop from DropZone
  const handleFileDrop = (content: string, fileName: string) => {
    try {
      const result = parseLogFile(content, fileName)
      setParseResult(result)
      setParseError(null)
      // Clear filters when new file is loaded
      clearFilters()
      // Update file store
      setCurrentFile({ path: fileName, name: fileName, size: content.length })
      // Add to recent files
      setRecentFiles([
        { path: fileName, name: fileName, lastOpened: Date.now() },
        ...recentFiles.filter(f => f.path !== fileName).slice(0, 19),
      ])
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse error')
      setParseResult(null)
    }
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        recentFiles={recentFiles}
        currentFile={currentFile}
        onSelectFile={handleSelectFile}
        onClearRecent={handleClearRecent}
      />

      {/* Main content area with toolbar */}
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

        {/* Scrollable content with DropZone */}
        <DropZone onFileDrop={handleFileDrop}>
        <div className="flex-1 overflow-auto bg-gray-900 text-gray-100 p-8 h-full">
        <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
          <FileText className="w-8 h-8" />
          Mocha Log Viewer
        </h1>
        <p className="text-gray-400 mb-6">React + Vite + Tailwind setup complete</p>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-green-400">Setup Status</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            React + TypeScript initialized
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            Vite configured
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            Tailwind CSS working
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            Build output set to ../dist
          </li>
        </ul>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-blue-400 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Dependencies Test
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2" data-testid="zustand-test">
            <Check className="w-4 h-4 text-green-500" />
            <span>Zustand: LogViewer store active (filters: {filters.length}, inactive: {inactiveNames.size})</span>
          </li>
          <li className="flex items-center gap-2" data-testid="lucide-test">
            <Check className="w-4 h-4 text-green-500" />
            <span>Lucide-react: Icons rendering above</span>
          </li>
          <li className="flex items-center gap-2" data-testid="murmurhash-test">
            <Check className="w-4 h-4 text-green-500" />
            <span>Murmurhash: used in parser for log hashing</span>
          </li>
        </ul>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-purple-400 flex items-center gap-2">
          <Server className="w-5 h-5" />
          WebUI Integration Test
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2" data-testid="webui-detected">
            {webuiDetected === null ? (
              <AlertCircle className="w-4 h-4 text-yellow-500" />
            ) : webuiDetected ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <X className="w-4 h-4 text-red-500" />
            )}
            <span>WebUI detected: {webuiDetected === null ? 'checking...' : webuiDetected ? 'Yes' : 'No'}</span>
          </li>
          <li className="flex items-center gap-2" data-testid="webui-recent">
            {recentFilesResult !== null ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : webuiError ? (
              <X className="w-4 h-4 text-red-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-500" />
            )}
            <span>getRecentFiles: {recentFilesResult ?? (webuiError ? 'N/A' : 'pending...')}</span>
          </li>
          <li className="flex items-center gap-2" data-testid="webui-readfile">
            {readFileResult !== null ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : webuiError ? (
              <X className="w-4 h-4 text-red-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-500" />
            )}
            <span>readFile: {readFileResult ?? (webuiError ? 'N/A' : 'pending...')}</span>
          </li>
          {webuiError && (
            <li className="flex items-center gap-2 text-gray-500" data-testid="webui-error">
              <AlertCircle className="w-4 h-4" />
              <span>{webuiError}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-cyan-400 flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Store Test (useLogViewerStore)
        </h2>

        {/* Filter input */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Add filter (Enter to submit):</label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleFilterSubmit}
            placeholder="text, /regex/, or -exclude"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-cyan-500"
            data-testid="filter-input"
          />
        </div>

        {/* Active filters */}
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-2">
            Active filters ({filters.length}):
            {filters.length > 0 && (
              <button
                onClick={clearFilters}
                className="ml-2 text-red-400 hover:text-red-300 text-xs"
                data-testid="clear-filters"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter, idx) => (
              <span
                key={idx}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                  filter.type === 'exclude'
                    ? 'bg-red-900 text-red-300'
                    : filter.type === 'regex'
                    ? 'bg-purple-900 text-purple-300'
                    : 'bg-cyan-900 text-cyan-300'
                }`}
                data-testid={`filter-chip-${idx}`}
              >
                {filter.text}
                <button
                  onClick={() => removeFilter(idx)}
                  className="hover:text-white"
                  data-testid={`remove-filter-${idx}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filters.length === 0 && (
              <span className="text-gray-500 text-xs">No filters active</span>
            )}
          </div>
        </div>

        {/* Service badges (only shown when logs are loaded) */}
        {serviceNames.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-gray-400 mb-2">
              Service filters ({inactiveNames.size} hidden):
            </div>
            <div className="flex flex-wrap gap-2">
              {serviceNames.map((name) => (
                <button
                  key={name}
                  onClick={() => toggleName(serviceNames, name)}
                  className={`px-2 py-1 rounded text-xs ${
                    inactiveNames.has(name)
                      ? 'bg-gray-700 text-gray-500'
                      : 'bg-blue-900 text-blue-300'
                  }`}
                  data-testid={`service-badge-${name}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtered count */}
        {parseResult && (
          <div className="text-sm text-gray-400" data-testid="filtered-count">
            Showing {filteredLogs.length} of {parseResult.logs.length} logs
          </div>
        )}
      </div>

      {/* Selection Store Test Section */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-pink-400 flex items-center gap-2">
          <MousePointer className="w-5 h-5" />
          Selection Test (useSelectionStore)
        </h2>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Selection stats */}
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-sm text-gray-400 mb-1">Selected</div>
            <div className="text-2xl font-bold text-pink-400" data-testid="selected-count">
              {selectedHashes.size}
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-sm text-gray-400 mb-1">Deleted (hidden)</div>
            <div className="text-2xl font-bold text-red-400" data-testid="deleted-count">
              {deletedHashes.size}
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-sm text-gray-400 mb-1">Wrapped</div>
            <div className="text-2xl font-bold text-blue-400" data-testid="wrapped-count">
              {wrappedHashes.size}
            </div>
          </div>
        </div>

        {/* Selection action buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => selectAll(allHashes)}
            disabled={allHashes.length === 0}
            className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="select-all-btn"
          >
            <Check className="w-4 h-4" />
            Select All ({allHashes.length})
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedHashes.size === 0}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="clear-selection-btn"
          >
            <X className="w-4 h-4" />
            Clear Selection
          </button>
          <button
            onClick={deleteSelected}
            disabled={selectedHashes.size === 0}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="delete-selected-btn"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
          <button
            onClick={clearDeleted}
            disabled={deletedHashes.size === 0}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="restore-deleted-btn"
          >
            <Check className="w-4 h-4" />
            Restore Deleted
          </button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-500">
          <p>Click a log entry to select. Shift+Click for range. Ctrl/Cmd+Click to add. Click content to toggle wrap.</p>
        </div>
      </div>

      {/* File Store Test Section */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
        <h2 className="text-xl font-semibold mb-2 text-emerald-400 flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          File Store Test (useFileStore)
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Current file info */}
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-sm text-gray-400 mb-1">Current File</div>
            <div className="text-sm font-mono" data-testid="current-file">
              {currentFile ? (
                <div className="space-y-1">
                  <div className="text-emerald-400">{currentFile.name}</div>
                  <div className="text-gray-500 text-xs">{currentFile.path}</div>
                  {currentFile.size && (
                    <div className="text-gray-500 text-xs">{currentFile.size.toLocaleString()} bytes</div>
                  )}
                </div>
              ) : (
                <span className="text-gray-500">No file open</span>
              )}
            </div>
          </div>

          {/* Status indicators */}
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-sm text-gray-400 mb-1">Status</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2" data-testid="loading-status">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span className="text-emerald-400 text-sm">Loading...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-500 text-sm">Idle</span>
                  </>
                )}
              </div>
              {fileError && (
                <div className="flex items-center gap-2 text-red-400 text-sm" data-testid="file-error">
                  <AlertCircle className="w-4 h-4" />
                  {fileError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent files list */}
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-2">
            Recent Files ({recentFiles.length}):
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto" data-testid="recent-files-list">
            {recentFiles.length > 0 ? (
              recentFiles.map((file, idx) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 px-2 py-1 bg-gray-900 rounded text-sm hover:bg-gray-700 cursor-pointer"
                  onClick={() => setCurrentFile({ path: file.path, name: file.name })}
                  data-testid={`recent-file-${idx}`}
                >
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-emerald-400">{file.name}</span>
                  <span className="text-gray-500 text-xs ml-auto">
                    {new Date(file.lastOpened).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm px-2">No recent files</div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => {
              setLoading(true)
              // Simulate a file load operation
              setTimeout(() => {
                setCurrentFile({
                  path: '/Users/test/logs/example.log',
                  name: 'example.log',
                  size: 12345,
                })
                // Add to recent files
                setRecentFiles([
                  { path: '/Users/test/logs/example.log', name: 'example.log', lastOpened: Date.now() },
                  ...recentFiles.filter(f => f.path !== '/Users/test/logs/example.log').slice(0, 19),
                ])
                setLoading(false)
              }, 1000)
            }}
            disabled={isLoading}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="simulate-load-btn"
          >
            <FolderOpen className="w-4 h-4" />
            Simulate File Load
          </button>
          <button
            onClick={() => setFileError('Test error: File not found')}
            disabled={isLoading}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="simulate-error-btn"
          >
            <AlertCircle className="w-4 h-4" />
            Simulate Error
          </button>
          <button
            onClick={() => {
              setCurrentFile(null)
              setFileError(null)
            }}
            disabled={isLoading}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="clear-file-btn"
          >
            <X className="w-4 h-4" />
            Clear Current File
          </button>
          <button
            onClick={() => setRecentFiles([])}
            disabled={recentFiles.length === 0}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm flex items-center gap-1"
            data-testid="clear-recent-btn"
          >
            <Trash2 className="w-4 h-4" />
            Clear Recent
          </button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-500">
          <p>Test useFileStore: setCurrentFile, setRecentFiles, setLoading, setError. Recent files persist to localStorage.</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-xl font-semibold mb-2 text-orange-400 flex items-center gap-2">
          <Code className="w-5 h-5" />
          Log Parser Test
        </h2>
        <div className="mb-4">
          <input
            type="file"
            ref={fileInputRef}
            accept=".log,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const reader = new FileReader()
                reader.onload = (evt) => {
                  try {
                    const content = evt.target?.result as string
                    const result = parseLogFile(content, file.name)
                    setParseResult(result)
                    setParseError(null)
                    // Clear filters when new file is loaded
                    clearFilters()
                  } catch (err) {
                    setParseError(err instanceof Error ? err.message : 'Parse error')
                    setParseResult(null)
                  }
                }
                reader.readAsText(file)
              }
            }}
            className="hidden"
            data-testid="file-input"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded flex items-center gap-2"
            data-testid="upload-button"
          >
            <Upload className="w-4 h-4" />
            Upload Log File
          </button>
        </div>

        {parseError && (
          <div className="text-red-400 text-sm mb-4" data-testid="parse-error">
            Error: {parseError}
          </div>
        )}

        {parseResult && (
          <div className="space-y-4" data-testid="parse-result">
            <div className="text-sm text-gray-400">
              <span data-testid="log-count">Parsed {parseResult.logs.length} log entries</span>
              {parseResult.truncated && (
                <span className="text-yellow-500 ml-2" data-testid="truncated-indicator">
                  (truncated from {parseResult.totalLines} lines)
                </span>
              )}
            </div>

            {/* LogViewer Component Demo */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-96" data-testid="logviewer-demo">
              <LogViewer logs={parseResult.logs} />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              <p><strong>Keyboard shortcuts:</strong> Ctrl+A (select all), Ctrl+C (copy), Delete (hide selected), Escape (clear selection)</p>
            </div>
          </div>
        )}
      </div>
        </div>
        </DropZone>
      </div>
    </div>
  )
}

export default App
