import type { FeedbackStepProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultFeedback({
  title,
  description,
  placeholder,
  required,
  minLength,
  value,
  onChange,
  onSubmit,
  classNames,
}: FeedbackStepProps) {
  const isValid = !required || value.length >= minLength

  return (
    <div className={cn('ck-step ck-step-feedback', classNames?.root)}>
      <textarea
        className={cn('ck-textarea', classNames?.textarea)}
        placeholder={placeholder ?? 'Your feedback helps us improve...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />

      {minLength > 0 && value.length > 0 && value.length < minLength && (
        <p className={cn('ck-character-count', classNames?.characterCount)}>
          {minLength - value.length} more character{minLength - value.length === 1 ? '' : 's'} needed
        </p>
      )}

      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.submitButton)}
        onClick={onSubmit}
        disabled={!isValid}
      >
        Continue
      </button>
    </div>
  )
}
