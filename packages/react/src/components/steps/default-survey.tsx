import { useCallback, useRef } from 'react'
import type { ReasonButtonProps, SurveyStepProps } from '../../core/types'
import { cn } from '../../core/utils'

function DefaultReasonButton({ reason, isSelected, onSelect }: ReasonButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={() => onSelect(reason.id)}
      className={cn('ck-reason-button', isSelected && 'ck-reason-button--selected')}
    >
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
  onNext,
  classNames,
  components,
}: SurveyStepProps) {
  const ReasonButton = components?.ReasonButton ?? DefaultReasonButton
  const listRef = useRef<HTMLDivElement>(null)

  // Arrow key navigation within the radiogroup
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()

      const currentIdx = reasons.findIndex((r) => r.id === selectedReason)
      let nextIdx: number
      if (e.key === 'ArrowDown') {
        nextIdx = currentIdx < reasons.length - 1 ? currentIdx + 1 : 0
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : reasons.length - 1
      }
      onSelectReason(reasons[nextIdx].id)

      // Move focus to the newly selected button
      const buttons = listRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')
      buttons?.[nextIdx]?.focus()
    },
    [reasons, selectedReason, onSelectReason],
  )

  return (
    <div className={cn('ck-step ck-step-survey', classNames?.root)}>
      <div
        ref={listRef}
        className={cn('ck-reason-list', classNames?.reasonList)}
        role="radiogroup"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        {reasons.map((reason) => (
          <ReasonButton
            key={reason.id}
            reason={reason}
            isSelected={selectedReason === reason.id}
            onSelect={onSelectReason}
          />
        ))}
      </div>

      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.continueButton)}
        onClick={onNext}
        disabled={!selectedReason}
      >
        Continue
      </button>
    </div>
  )
}

export { DefaultReasonButton }
