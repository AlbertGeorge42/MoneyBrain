/**
 * 共享开关。
 *
 * 轨道开关（预算启停、自动备份）与按压式 Toggle（报表设置、流水统计范围）
 * 统一到一处。轨道开关沿用 role="switch" + aria-checked；配置 Toggle 原本是
 * aria-pressed 的按压按钮，不改成 switch，用 toggle 变体原样保留。
 */
import type { ReactNode } from 'react'
import './hfSwitch.css'

type HfSwitchVariant = 'budget' | 'settings' | 'toggle'

const TRACK_CLASS: Record<
  'budget',
  { button: string; track: string; thumb: string; text: string }
> = {
  budget: {
    button: 'mb-bg-switch',
    track: 'mb-bg-switch-track',
    thumb: 'mb-bg-switch-thumb',
    text: 'mb-bg-switch-state',
  },
}

export function HfSwitch({
  variant,
  checked,
  onChange,
  disabled,
  ariaLabel,
  text,
  stateText,
  reason,
}: {
  variant: HfSwitchVariant
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  /** 轨道开关的可见文案；toggle 变体里是主标签。 */
  text?: ReactNode
  /** 仅 toggle 变体：右侧状态文案（显示 / 隐藏）。 */
  stateText?: ReactNode
  /** 仅 toggle 变体：禁用原因。 */
  reason?: string
}) {
  if (variant === 'toggle') {
    return (
      <div className="mb-switch-toggle-wrap">
        <button
          type="button"
          className={checked ? 'mb-switch-toggle is-on' : 'mb-switch-toggle'}
          aria-pressed={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span>{text}</span>
          <span className="mb-switch-toggle-state">
            {stateText ?? (checked ? '显示' : '隐藏')}
          </span>
        </button>
        {disabled && reason && <p className="mb-rp-config-reason">{reason}</p>}
      </div>
    )
  }

  if (variant === 'settings') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        className={checked ? 'mb-set-switch is-on' : 'mb-set-switch'}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="mb-set-switch-thumb" aria-hidden="true" />
      </button>
    )
  }

  const classes = TRACK_CLASS[variant]
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={checked ? `${classes.button} is-on` : classes.button}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className={classes.track} aria-hidden="true">
        <span className={classes.thumb} />
      </span>
      <span className={classes.text}>{text}</span>
    </button>
  )
}
