import type { SuccessStepProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultSuccess({ outcome, title, description, onClose, classNames }: SuccessStepProps) {
  return (
    <div className={cn('ck-step ck-step-success', classNames?.root)}>
      <div className={cn('ck-success-icon', classNames?.icon)}>
        {outcome === 'saved' ? (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="24" fill="var(--ck-color-success)" opacity="0.1" />
            <path
              d="M16 24l6 6 10-12"
              stroke="var(--ck-color-success)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="24" fill="var(--ck-color-text-secondary)" opacity="0.1" />
            <path
              d="M20 20l8 8M28 20l-8 8"
              stroke="var(--ck-color-text-secondary)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <h3 className={cn('ck-step-title', classNames?.title)}>{title}</h3>
      {description && <p className={cn('ck-step-description', classNames?.description)}>{description}</p>}

      <button type="button" className={cn('ck-button ck-button-secondary', classNames?.closeButton)} onClick={onClose}>
        Close
      </button>
    </div>
  )
}
