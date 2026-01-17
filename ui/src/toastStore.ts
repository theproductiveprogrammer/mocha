/**
 * Toast notification store for file feedback
 */

import { create } from 'zustand'

export type ToastType = 'added' | 'removed' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  timestamp: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (type: ToastType, message: string) => void
  removeToast: (id: string) => void
  clearAll: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (type, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const toast: Toast = { id, type, message, timestamp: Date.now() }

    set((state) => ({
      toasts: [...state.toasts, toast].slice(-5), // Max 5 toasts
    }))

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      get().removeToast(id)
    }, 3000)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearAll: () => set({ toasts: [] }),
}))
