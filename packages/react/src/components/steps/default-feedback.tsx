import { useState } from 'react'
import { defaultMessages, formatMessage } from '../../core/messages'
import type { FeedbackStepProps } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'

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
  messages,
}: FeedbackStepProps) {
  const m = messages ?? defaultMessages
  const [focused, setFocused] = useState(false)
  const hasMin = minLength > 0
  const isUnderMin = hasMin && value.length > 0 && value.length < minLength
  const isValid = !required || value.length >= minLength
  const placeholderText =
    placeholder ?? (hasMin ? formatMessage(m.feedback.placeholderWithMin, { minLength }) : m.feedback.placeholder)

  return (
    <div className={cn('ck-step ck-step-feedback', classNames?.root)}>
      <h2 className={cn('ck-step-title', classNames?.title)}>{title}</h2>
      {description && (
        <RichText as="div" html={description} className={cn('ck-step-description', classNames?.description)} />
      )}

      <div
        className={cn(
          'ck-feedback-field',
          focused && 'ck-feedback-field--focused',
          isUnderMin && 'ck-feedback-field--invalid',
        )}
      >
        <textarea
          className={cn('ck-textarea', classNames?.textarea)}
          placeholder={placeholderText}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={3}
        />
        {hasMin && (
          <div
            className={cn(
              'ck-character-count',
              isUnderMin && 'ck-character-count--invalid',
              classNames?.characterCount,
            )}
          >
            {value.length} / {minLength}
          </div>
        )}
      </div>

      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.submitButton)}
        onClick={onSubmit}
        disabled={!isValid}
      >
        {m.common.continue}
      </button>
    </div>
  )
}
