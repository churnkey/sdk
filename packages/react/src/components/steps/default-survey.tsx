import { defaultMessages } from '../../core/messages'
import type { ReasonButtonProps, SurveyStepProps } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'
import { Checkmark } from './shared'

function DefaultReasonButton({ reason, index, isSelected, onSelect }: ReasonButtonProps) {
  const letter = String.fromCharCode(65 + index)

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={() => onSelect(reason.id)}
      className={cn('ck-reason-button', isSelected && 'ck-reason-button--selected')}
    >
      <span aria-hidden className="ck-reason-badge">
        {isSelected ? <Checkmark color="#fff" size={12} /> : letter}
      </span>
      <span className="ck-reason-label">{reason.label}</span>
    </button>
  )
}

export function DefaultSurvey({
  title,
  description,
  reasons,
  selectedReason,
  onSelectReason,
  followupResponse,
  onFollowupResponseChange,
  onNext,
  classNames,
  components,
  messages,
}: SurveyStepProps) {
  const m = messages ?? defaultMessages
  const ReasonButton = components?.ReasonButton ?? DefaultReasonButton
  const selected = reasons.find((r) => r.id === selectedReason)
  const showFollowup = selected?.freeform === true

  return (
    <div className={cn('ck-step ck-step-survey', classNames?.root)}>
      <h2 className={cn('ck-step-title', classNames?.title)}>{title}</h2>
      {description && (
        <RichText as="div" html={description} className={cn('ck-step-description', classNames?.description)} />
      )}

      <div className={cn('ck-reason-list', classNames?.reasonList)} role="radiogroup" aria-label={title}>
        {reasons.map((reason, i) => (
          <ReasonButton
            key={reason.id}
            reason={reason}
            index={i}
            isSelected={selectedReason === reason.id}
            onSelect={onSelectReason}
          />
        ))}
      </div>

      {showFollowup && (
        <textarea
          className={cn('ck-reason-followup', classNames?.followupInput)}
          placeholder={m.survey.followupPlaceholder}
          rows={3}
          value={followupResponse}
          onChange={(e) => onFollowupResponseChange(e.target.value)}
          aria-label={m.survey.followupAriaLabel}
        />
      )}

      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.continueButton)}
        onClick={onNext}
        disabled={!selectedReason}
      >
        {m.common.continue}
      </button>
    </div>
  )
}

export { DefaultReasonButton }
