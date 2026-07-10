import { defaultMessages } from '../../core/messages'
import type { SuccessStepProps } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'
import { Checkmark } from './shared'

export function DefaultSuccess({ title, description, onClose, classNames, messages }: SuccessStepProps) {
  const m = messages ?? defaultMessages
  return (
    <div className={cn('ck-step ck-step-success', classNames?.root)}>
      <div className={cn('ck-success-icon', classNames?.icon)}>
        <Checkmark color="currentColor" size={26} />
      </div>

      <h2 className={cn('ck-step-title', classNames?.title)}>{title}</h2>
      {description && (
        <RichText as="div" html={description} className={cn('ck-step-description', classNames?.description)} />
      )}

      <div className="ck-success-actions">
        <button type="button" className={cn('ck-button ck-button-primary', classNames?.closeButton)} onClick={onClose}>
          {m.common.done}
        </button>
      </div>
    </div>
  )
}
