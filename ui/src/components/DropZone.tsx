import { useState, useCallback } from 'react'
import { Upload } from 'lucide-react'

interface DropZoneProps {
  onFileDrop: (content: string, fileName: string) => void
  children: React.ReactNode
}

/**
 * DropZone component for handling drag-and-drop file loading.
 *
 * Features:
 * - Invisible in normal state
 * - Shows blue dashed border overlay when dragging files
 * - Accepts only .log and .txt files
 * - Reads file as text and calls onFileDrop callback
 */
export const DropZone = ({ onFileDrop, children }: DropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)

  // Check if file has valid extension
  const isValidFile = (file: File): boolean => {
    const validExtensions = ['.log', '.txt']
    const fileName = file.name.toLowerCase()
    return validExtensions.some(ext => fileName.endsWith(ext))
  }

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragError(null)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only hide if leaving the dropzone entirely (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }
    setIsDragging(false)
    setDragError(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setDragError(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      return
    }

    // Take first file only
    const file = files[0]

    // Validate file extension
    if (!isValidFile(file)) {
      setDragError('Please drop a .log or .txt file')
      setTimeout(() => setDragError(null), 3000)
      return
    }

    // Read file content
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      if (content !== undefined) {
        onFileDrop(content, file.name)
      }
    }
    reader.onerror = () => {
      setDragError('Failed to read file')
      setTimeout(() => setDragError(null), 3000)
    }
    reader.readAsText(file)
  }, [onFileDrop])

  return (
    <div
      className="relative h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="dropzone"
    >
      {/* Children (main content) */}
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 flex items-center justify-center z-50 pointer-events-none"
          data-testid="dropzone-overlay"
        >
          <div className="bg-blue-600 text-white px-6 py-4 rounded-lg flex items-center gap-3 shadow-lg">
            <Upload className="w-8 h-8" />
            <div>
              <div className="font-semibold text-lg">Drop log file here</div>
              <div className="text-sm text-blue-200">Accepts .log and .txt files</div>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {dragError && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50"
          data-testid="dropzone-error"
        >
          {dragError}
        </div>
      )}
    </div>
  )
}
