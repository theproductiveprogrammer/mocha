import { create } from 'zustand'
import { FileText, Check, Package } from 'lucide-react'
import murmurhash from 'murmurhash'

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

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
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
    </div>
  )
}

export default App
