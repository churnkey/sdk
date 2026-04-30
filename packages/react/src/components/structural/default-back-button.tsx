import type { BackButtonProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultBackButton({ onBack, className }: BackButtonProps) {
  return (
    <button type="button" className={cn('ck-back-button', className)} onClick={onBack}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M12.5 4L6.5 10l6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Back</span>
    </button>
  )
}
