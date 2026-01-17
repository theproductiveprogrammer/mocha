/**
 * Toast notification component for file feedback
 */

import { memo } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore, type Toast } from '../toastStore'

const ToastIcon = ({ type }: { type: Toast['type'] }) => {
  switch (type) {
    case 'added':
      return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--mocha-success)' }} />
    case 'removed':
      return <XCircle className="w-4 h-4" style={{ color: 'var(--mocha-text-muted)' }} />
    case 'error':
      return <AlertCircle className="w-4 h-4" style={{ color: 'var(--mocha-error)' }} />
    default:
      return <Info className="w-4 h-4" style={{ color: 'var(--mocha-info)' }} />
  }
}

const ToastItem = memo(function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <div
      className="animate-toast-in flex items-center gap-3 px-4 py-3 rounded-xl pointer-events-auto"
      style={{
        background: 'var(--glass-card-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--mocha-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        minWidth: '280px',
        maxWidth: '400px',
      }}
    >
      <ToastIcon type={toast.type} />
      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--mocha-text)' }}>
        {toast.message}
      </span>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-1 rounded-md transition-colors hover:bg-[var(--mocha-surface-hover)]"
        style={{ color: 'var(--mocha-text-muted)' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
})

export const ToastContainer = memo(function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
})
