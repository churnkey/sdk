import type { ProgressBarProps } from '../../core/types'
import { cn } from '../../core/utils'

export function DefaultProgressBar({ current, total, className }: ProgressBarProps) {
  if (total <= 1) return null

  const percent = total > 0 ? ((current + 1) / total) * 100 : 0

  return (
    <div className={cn('ck-progress', className)} role="progressbar" aria-valuenow={current + 1} aria-valuemax={total}>
      <div className="ck-progress-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
