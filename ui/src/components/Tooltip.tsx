import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  delay?: number
  maxWidth?: number
  className?: string
}

interface Position {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

function TooltipComponent({ content, children, delay = 300, maxWidth = 600, className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<number | null>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipHeight = tooltipRef.current?.offsetHeight || 100
    const viewportHeight = window.innerHeight
    const padding = 8

    // Default: show below
    let placement: 'top' | 'bottom' = 'bottom'
    let top = rect.bottom + padding

    // If not enough room below, show above
    if (top + tooltipHeight > viewportHeight - padding) {
      placement = 'top'
      top = rect.top - tooltipHeight - padding
    }

    // Clamp to viewport bounds
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding))

    // Horizontal: align with left edge of trigger, but stay in viewport
    let left = rect.left
    const tooltipWidth = Math.min(maxWidth, window.innerWidth - padding * 2)
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding
    }
    left = Math.max(padding, left)

    setPosition({ top, left, placement })
  }, [maxWidth])

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true)
      // Position is calculated after render via useEffect
    }, delay)
  }, [delay])

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
    setPosition(null)
  }, [])

  // Update position when tooltip becomes visible or content changes
  useEffect(() => {
    if (isVisible) {
      // Use requestAnimationFrame to ensure tooltip is rendered before measuring
      requestAnimationFrame(updatePosition)
    }
  }, [isVisible, content, updatePosition])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="raw-line-tooltip animate-fade-in"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              maxWidth,
              opacity: position ? 1 : 0,
            }}
            onMouseEnter={handleMouseLeave} // Hide if mouse enters tooltip
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}

export const Tooltip = memo(TooltipComponent)
