import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, Check, Package, X, Server, AlertCircle, Upload, Code, Filter } from 'lucide-react'
// Import types (WebUI global type is declared in types.ts)
import type { ParsedLogFileResult } from './types'
import './types'
// Import WebUI API wrapper
import { isWebUI, waitForConnection, readFile, getRecentFiles } from './api'
// Import log parser
import { parseLogFile } from './parser'
// Import store and helpers
import { useLogViewerStore, parseFilterInput, filterLogs } from './store'

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

  // WebUI integration state
  const [webuiDetected, setWebuiDetected] = useState<boolean | null>(null)
  const [recentFilesResult, setRecentFilesResult] = useState<string | null>(null)
  const [readFileResult, setReadFileResult] = useState<string | null>(null)
  const [webuiError, setWebuiError] = useState<string | null>(null)

  // Parser test state
  const [parseResult, setParseResult] = useState<ParsedLogFileResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get unique service names from parsed logs
  const serviceNames = useMemo(() => {
    if (!parseResult) return []
    const names = new Set(parseResult.logs.map((log) => log.name))
    return Array.from(names).sort()
  }, [parseResult])

  // Filter logs using the store state
  const filteredLogs = useMemo(() => {
    if (!parseResult) return []
    return filterLogs(parseResult.logs, filters, inactiveNames)
  }, [parseResult, filters, inactiveNames])

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

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
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

            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredLogs.slice(0, 20).map((log, idx) => (
                <div
                  key={log.hash || idx}
                  className="bg-gray-900 p-3 rounded text-xs font-mono border border-gray-700"
                  data-testid={`log-entry-${idx}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {log.parsed?.level && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          log.parsed.level === 'ERROR'
                            ? 'bg-red-900 text-red-300'
                            : log.parsed.level === 'WARN'
                            ? 'bg-yellow-900 text-yellow-300'
                            : log.parsed.level === 'INFO'
                            ? 'bg-blue-900 text-blue-300'
                            : log.parsed.level === 'DEBUG'
                            ? 'bg-gray-700 text-gray-300'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                        data-testid={`log-level-${idx}`}
                      >
                        {log.parsed.level}
                      </span>
                    )}
                    {log.parsed?.timestamp && (
                      <span className="text-gray-500" data-testid={`log-timestamp-${idx}`}>
                        {log.parsed.timestamp}
                      </span>
                    )}
                    {log.parsed?.logger && (
                      <span className="text-purple-400" data-testid={`log-logger-${idx}`}>
                        {log.parsed.logger}
                      </span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400"
                      data-testid={`log-service-${idx}`}
                    >
                      {log.name}
                    </span>
                  </div>
                  <div className="text-gray-300 line-clamp-2" data-testid={`log-content-${idx}`}>
                    {log.parsed?.content || log.data}
                  </div>
                  {log.parsed?.apiCall && (
                    <div className="mt-1 text-cyan-400 text-xs" data-testid={`log-api-${idx}`}>
                      API: {log.parsed.apiCall.direction} {log.parsed.apiCall.method || ''} {log.parsed.apiCall.endpoint}
                      {log.parsed.apiCall.status && ` -> ${log.parsed.apiCall.status}`}
                    </div>
                  )}
                </div>
              ))}
              {filteredLogs.length > 20 && (
                <div className="text-gray-500 text-sm">
                  ... and {filteredLogs.length - 20} more entries
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
