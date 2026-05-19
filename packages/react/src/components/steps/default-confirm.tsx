import { formatPeriodEnd } from '../../core/format'
import type { ConfirmStepProps } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'

export function DefaultConfirm({
  title,
  description,
  subscriptions,
  losses,
  lossesLabel,
  confirmLabel,
  goBackLabel,
  onConfirm,
  onGoBack,
  isProcessing,
  classNames,
}: ConfirmStepProps) {
  const hasLosses = Array.isArray(losses) && losses.length > 0
  const periodEnd = formatPeriodEnd(subscriptions)
  return (
    <div className={cn('ck-step ck-step-confirm', classNames?.root)}>
      <h2 className={cn('ck-step-title', classNames?.title)}>{title}</h2>
      {description && <RichText html={description} className={cn('ck-step-description', classNames?.description)} />}

      {hasLosses && (
        <div className={cn('ck-loss-block', classNames?.lossList)}>
          <div className={cn('ck-loss-label', classNames?.lossLabel)}>{lossesLabel ?? "You'll lose access to:"}</div>
          <ul className="ck-loss-list">
            {losses.map((item) => (
              <li key={item} className={cn('ck-loss-item', classNames?.lossItem)}>
                <span aria-hidden className={cn('ck-loss-bullet', classNames?.lossBullet)}>
                  ●
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {periodEnd && (
        <p className={cn('ck-period-end', classNames?.periodEndNotice)}>Your access continues until {periodEnd}.</p>
      )}

      <button
        type="button"
        className={cn('ck-button ck-button-danger', classNames?.confirmButton)}
        onClick={onConfirm}
        disabled={isProcessing}
      >
        {isProcessing ? 'Processing...' : confirmLabel}
      </button>
      <button type="button" className={cn('ck-button-link', classNames?.goBackButton)} onClick={onGoBack}>
        {goBackLabel}
      </button>
    </div>
  )
}
