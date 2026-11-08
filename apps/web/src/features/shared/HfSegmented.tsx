/**
 * 共享分段切换。
 *
 * 四处分段只有视觉类名不同：报表页移动分段、时间粒度、预算周期、记账 / 预算类型。
 * 结构、role="group"、aria-pressed、原生按钮键盘可达性沿用各使用点现状；
 * 预算编辑器的类型按钮原本没有 aria-pressed，通过 ariaPressed={false} 保持原样。
 */
import type { ReactNode } from 'react'

export interface HfSegmentedOption<T extends string> {
  id: T
  label: ReactNode
}

const VARIANT_CLASS: Record<
  'report' | 'granularity' | 'budget' | 'entry',
  { container: string; button: string }
> = {
  report: { container: 'mb-rp-seg', button: 'mb-rp-seg-btn' },
  granularity: { container: 'mb-rp-gran', button: 'mb-rp-gran-btn' },
  budget: { container: 'mb-bg-seg', button: 'mb-bg-seg-btn' },
  entry: { container: 'mb-entry-types', button: 'mb-entry-type' },
}

export function HfSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
  variant,
  ariaPressed = true,
}: {
  label: string
  value: T
  options: readonly HfSegmentedOption<T>[]
  onChange: (next: T) => void
  variant: 'report' | 'granularity' | 'budget' | 'entry'
  ariaPressed?: boolean
}) {
  const classes = VARIANT_CLASS[variant]
  return (
    <div className={classes.container} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            className={active ? `${classes.button} is-active` : classes.button}
            aria-pressed={ariaPressed ? active : undefined}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
