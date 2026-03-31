import { useCallback, useEffect, useRef } from 'react'
import type { ModalProps } from '../../core/types'
import { cn } from '../../core/utils'

// Only traps visible, enabled elements
function trapFocus(container: HTMLElement): () => void {
  const focusableSelector = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'textarea:not(:disabled)',
    'select:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (el) => el.offsetParent !== null,
    ) // visible only
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  container.addEventListener('keydown', handleKeyDown)
  return () => container.removeEventListener('keydown', handleKeyDown)
}

export function DefaultModal({ open, onClose, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Save focus, set up trap, restore on unmount
  useEffect(() => {
    if (!open || !modalRef.current) return

    previousFocusRef.current = document.activeElement as HTMLElement
    modalRef.current.focus()

    const cleanup = trapFocus(modalRef.current)
    return () => {
      cleanup()
      previousFocusRef.current?.focus()
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="ck-overlay"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-dialog-title"
        tabIndex={-1}
        className={cn('ck-modal', className)}
      >
        {children}
      </div>
    </div>
  )
}
