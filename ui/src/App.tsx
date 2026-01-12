function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">Mocha Log Viewer</h1>
      <p className="text-gray-400 mb-6">React + Vite + Tailwind setup complete</p>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-xl font-semibold mb-2 text-green-400">Setup Status</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-green-500">&#10003;</span>
            React + TypeScript initialized
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">&#10003;</span>
            Vite configured
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">&#10003;</span>
            Tailwind CSS working
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">&#10003;</span>
            Build output set to ../dist
          </li>
        </ul>
      </div>
    </div>
  )
}

export default App
