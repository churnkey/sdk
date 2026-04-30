import type { CloseButtonProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultCloseButton({ onClose, className }: CloseButtonProps) {
  return (
    <button type="button" className={cn('ck-close-button', className)} onClick={onClose} aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
