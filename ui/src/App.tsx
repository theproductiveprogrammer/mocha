import { useState, useEffect } from 'react'
import { create } from 'zustand'
import { FileText, Check, Package, X, Server, AlertCircle } from 'lucide-react'
import murmurhash from 'murmurhash'

// Declare WebUI global type
declare global {
  interface Window {
    webui?: {
      call: (name: string, ...args: unknown[]) => Promise<string>;
    };
  }
}

// Check if running in WebUI context
function isWebUI(): boolean {
  return typeof window.webui !== 'undefined';
}

// Test zustand store
interface TestState {
  count: number
  increment: () => void
}

const useTestStore = create<TestState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))

function App() {
  const { count, increment } = useTestStore()
  const testHash = murmurhash.v3('test-string')

  // WebUI integration state
  const [webuiDetected, setWebuiDetected] = useState<boolean | null>(null)
  const [recentFilesResult, setRecentFilesResult] = useState<string | null>(null)
  const [readFileResult, setReadFileResult] = useState<string | null>(null)
  const [webuiError, setWebuiError] = useState<string | null>(null)

  // Test WebUI integration on mount
  useEffect(() => {
    const testWebUI = async () => {
      // Check if webui is available
      const detected = isWebUI()
      setWebuiDetected(detected)

      if (!detected) {
        setWebuiError('Not running in WebUI context (expected when using npm run dev)')
        return
      }

      // Wait for WebSocket connection (webui.isConnected())
      const waitForConnection = async (maxAttempts = 20): Promise<boolean> => {
        for (let i = 0; i < maxAttempts; i++) {
          if (window.webui && typeof (window.webui as any).isConnected === 'function') {
            if ((window.webui as any).isConnected()) {
              return true
            }
          }
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        return false
      }

      const connected = await waitForConnection()
      if (!connected) {
        setWebuiError('WebSocket is not connected')
        return
      }

      try {
        // Test getRecentFiles binding
        const recentResult = await window.webui!.call('getRecentFiles')
        setRecentFilesResult(recentResult)

        // Test readFile binding with a known file
        const readResult = await window.webui!.call('readFile', './prd.json', 0)
        const parsed = JSON.parse(readResult)
        if (parsed.success) {
          setReadFileResult(`Read ${parsed.name}: ${parsed.size} bytes`)
        } else {
          setReadFileResult(`Error: ${parsed.error}`)
        }
      } catch (err) {
        setWebuiError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    testWebUI()
  }, [])

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
            <span>Zustand: count = {count}</span>
            <button
              onClick={increment}
              className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
            >
              Increment
            </button>
          </li>
          <li className="flex items-center gap-2" data-testid="lucide-test">
            <Check className="w-4 h-4 text-green-500" />
            <span>Lucide-react: Icons rendering above</span>
          </li>
          <li className="flex items-center gap-2" data-testid="murmurhash-test">
            <Check className="w-4 h-4 text-green-500" />
            <span>Murmurhash: hash("test-string") = {testHash}</span>
          </li>
        </ul>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
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
    </div>
  )
}

export default App
