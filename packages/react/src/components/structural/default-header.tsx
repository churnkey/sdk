import type { HeaderProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultHeader({ title, description, onClose, className }: HeaderProps) {
  return (
    <div className={cn('ck-header', className)}>
      <div className="ck-header-content">
        {title && (
          <h2 id="ck-dialog-title" className="ck-header-title">
            {title}
          </h2>
        )}
        {description && <p className="ck-header-description">{description}</p>}
      </div>
      <button type="button" className="ck-header-close" onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
