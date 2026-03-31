import type { ConfirmStepProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultConfirm({
  title,
  description,
  confirmLabel,
  goBackLabel,
  periodEnd,
  onConfirm,
  onGoBack,
  isProcessing,
  classNames,
}: ConfirmStepProps) {
  return (
    <div className={cn('ck-step ck-step-confirm', classNames?.root)}>
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
