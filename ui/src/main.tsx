import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Test import - exposes testDirectRender on window
import './test-render'

createRoot(document.getElementById('root')!).render(<App />)
