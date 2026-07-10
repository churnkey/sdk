import { defaultMessages } from '../../core/messages'
import type { ConfirmStepProps } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'

export function DefaultConfirm({
  title,
  description,
  losses,
  lossesLabel,
  confirmLabel,
  goBackLabel,
  periodEndNotice,
  onConfirm,
  onGoBack,
  isProcessing,
  classNames,
  messages,
}: ConfirmStepProps) {
  const m = messages ?? defaultMessages
  const hasLosses = Array.isArray(losses) && losses.length > 0
  return (
    <div className={cn('ck-step ck-step-confirm', classNames?.root)}>
      <h2 className={cn('ck-step-title', classNames?.title)}>{title}</h2>
      {description && (
        <RichText as="div" html={description} className={cn('ck-step-description', classNames?.description)} />
      )}

      {hasLosses && (
        <div className={cn('ck-loss-block', classNames?.lossList)}>
          <div className={cn('ck-loss-label', classNames?.lossLabel)}>{lossesLabel ?? m.confirm.lossesLabel}</div>
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

      {periodEndNotice && <p className={cn('ck-period-end', classNames?.periodEndNotice)}>{periodEndNotice}</p>}

      <button
        type="button"
        className={cn('ck-button ck-button-danger', classNames?.confirmButton)}
        onClick={onConfirm}
        disabled={isProcessing}
      >
        {isProcessing ? m.common.processing : confirmLabel}
      </button>
      <button type="button" className={cn('ck-button-link', classNames?.goBackButton)} onClick={onGoBack}>
        {goBackLabel}
      </button>
    </div>
  )
}
