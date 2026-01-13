/**
 * React wrapper for the lit-html LogViewer
 * Bridges React state management with lit-html rendering
 */

import { useEffect, useRef, useCallback, useMemo } from 'react'
import type { LogEntry } from '../types'
import { useLogViewerStore, useSelectionStore, filterLogs } from '../store'
import { renderLogViewer } from './LogViewerLit'

export interface LogViewerProps {
  logs: LogEntry[]
}

export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Log viewer store (filters and service visibility)
  const { inactiveNames, filters } = useLogViewerStore()

  // Selection store
  const {
    selectedHashes: rawSelectedHashes,
    deletedHashes: rawDeletedHashes,
    wrappedHashes: rawWrappedHashes,
    lastSelectedHash,
    toggleSelection,
    selectRange,
    selectAll,
    deleteSelected,
    clearSelection,
    toggleWrap,
  } = useSelectionStore()

  // Ensure hashes are Sets
  const selectedHashes = useMemo(
    () => (rawSelectedHashes instanceof Set ? rawSelectedHashes : new Set(Array.isArray(rawSelectedHashes) ? rawSelectedHashes : [])),
    [rawSelectedHashes]
  )
  const deletedHashes = useMemo(
    () => (rawDeletedHashes instanceof Set ? rawDeletedHashes : new Set(Array.isArray(rawDeletedHashes) ? rawDeletedHashes : [])),
    [rawDeletedHashes]
  )
  const wrappedHashes = useMemo(
    () => (rawWrappedHashes instanceof Set ? rawWrappedHashes : new Set(Array.isArray(rawWrappedHashes) ? rawWrappedHashes : [])),
    [rawWrappedHashes]
  )

  // Filter and reverse logs
  const filteredLogs = useMemo(() => {
    const filtered = filterLogs(logs, filters, inactiveNames, deletedHashes)
    return [...filtered].reverse()
  }, [logs, filters, inactiveNames, deletedHashes])

  // Get all hashes for keyboard shortcuts
  const allHashes = useMemo(() => {
    return filteredLogs.map((log) => log.hash).filter((h): h is string => !!h)
  }, [filteredLogs])

  // Stable ref for allHashes
  const allHashesRef = useRef(allHashes)
  useEffect(() => {
    allHashesRef.current = allHashes
  }, [allHashes])

  // Selection handler
  const handleSelect = useCallback(
    (hash: string, event: MouseEvent) => {
      if (event.shiftKey && lastSelectedHash) {
        selectRange(lastSelectedHash, hash, allHashesRef.current)
      } else if (event.ctrlKey || event.metaKey) {
        toggleSelection(hash)
      } else {
        toggleSelection(hash)
      }
    },
    [lastSelectedHash, selectRange, toggleSelection]
  )

  // Copy to clipboard
  const copySelectedToClipboard = useCallback(async () => {
    if (selectedHashes.size === 0) return
    const selectedLogs = filteredLogs
      .filter((log) => log.hash && selectedHashes.has(log.hash))
      .map((log) => log.data)
      .join('\n')
    try {
      await navigator.clipboard.writeText(selectedLogs)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [filteredLogs, selectedHashes])

  // Render lit-html template when state changes
  useEffect(() => {
    if (!containerRef.current) return

    renderLogViewer(containerRef.current, {
      logs: filteredLogs,
      selectedHashes,
      wrappedHashes,
      onSelect: handleSelect,
      onToggleWrap: toggleWrap,
    })
  }, [filteredLogs, selectedHashes, wrappedHashes, handleSelect, toggleWrap])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll(allHashes)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          copySelectedToClipboard()
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHashes.size > 0) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allHashes, selectedHashes, selectAll, deleteSelected, clearSelection, copySelectedToClipboard])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-white"
      tabIndex={0}
      data-testid="log-viewer"
      style={{ height: '100%' }}
    />
  )
}
