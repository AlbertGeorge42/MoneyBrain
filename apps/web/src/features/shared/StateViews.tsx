import { Button } from '@mantine/core'
import { Check, FolderInput, Plus, RotateCcw, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from './Card'
import { readReportsVisited } from './onboardingState'
import type { DeviceMode } from './types'
import './states.css'

export interface OnboardingStep {
  id: 'account' | 'entry' | 'report'
  title: string
  desc: string
  /** 已完成的步骤不再给动作，只作为进度记录。 */
  done: boolean
}

/**
 * 冷启动引导：把上手拆成可执行的三步，每步都有真实动作与完成判定。
 *
 * 步骤完成度全部从账本派生（有没有账户、有没有流水、报表看没看过），
 * 不另存一份进度：账本变了，引导自然跟着变。
 * 总览与流水共用这一份组件，避免两页出现两套空状态文案与操作。
 */
export function ColdStartGuide({
  variant = 'overview',
  hasAccount,
  hasEntry,
  onCreateAccount,
  onRecord,
  onImport,
  onOpenReports,
}: {
  variant?: 'overview' | 'transactions'
  /** 账本里已经有账户。 */
  hasAccount: boolean
  /** 账本里已经有流水。 */
  hasEntry: boolean
  onCreateAccount: () => void
  /** 记一笔：打开快速记账。 */
  onRecord: () => void
  onImport: () => void
  /** 打开报表页。 */
  onOpenReports: () => void
}) {
  const [reportsVisited, setReportsVisited] = useState(false)
  useEffect(() => setReportsVisited(readReportsVisited()), [])

  const steps: OnboardingStep[] = [
    {
      id: 'account',
      title: '建立现金、储蓄或投资账户',
      desc: '账户是记账的落点：先有一个账户，才有一笔笔流水。',
      done: hasAccount,
    },
    {
      id: 'entry',
      title: '记一笔，或导入银行 / 支付宝账单',
      desc: '导入适合已有账单；手动记适合刚开始。两种都只写本机。',
      done: hasEntry,
    },
    {
      id: 'report',
      title: '总览会自动生成收支与净值走势',
      desc: '有了流水，报表与预算才有数可算。',
      done: reportsVisited,
    },
  ]

  // 当前步：第一个没完成的。全部完成时停在最后一步（不再有下一步动作）。
  const current = steps.find((step) => !step.done)
  const currentIndex = current ? steps.indexOf(current) : steps.length - 1
  const allDone = steps.every((step) => step.done)

  const isTransactions = variant === 'transactions'
  const title = allDone
    ? '账本已经跑起来了'
    : isTransactions
      ? '还没有流水'
      : '从一个账户开始'
  const desc = allDone
    ? '账户、流水与报表都已就绪。日常记账从「记一笔」开始。'
    : isTransactions
      ? '账本已经建好，记下第一笔收支后，这里会按日期自动归档。'
      : '先建一个账户，或导入现有账单。所有数据只留在本机，不上传任何服务器。'

  return (
    <Card variant="state" aria-labelledby="mb-coldstart-title">
      <div className="mb-coldstart-mark" aria-hidden="true">
        <Wallet size={30} strokeWidth={1.8} />
      </div>
      <h2 id="mb-coldstart-title" className="mb-coldstart-title">
        {title}
      </h2>
      <p className="mb-coldstart-desc">{desc}</p>

      <ol className="mb-coldstart-steps">
        {steps.map((step, index) => {
          const state = step.done ? 'is-done' : index === currentIndex ? 'is-current' : ''
          return (
            <li
              key={step.id}
              className={state}
              aria-current={state === 'is-current' ? 'step' : undefined}
            >
              <span className="mb-coldstart-step" aria-hidden="true">
                {step.done ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className="mb-coldstart-step-body">
                <span className="mb-coldstart-step-title">{step.title}</span>
                <span className="mb-coldstart-step-desc">{step.desc}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="mb-coldstart-actions">
        {/* 只给当前步一个主动作：下一步该做什么，这里就是什么。 */}
        {current?.id === 'account' && (
          <Button className="mb-primary-btn" leftSection={<Plus size={16} />} onClick={onCreateAccount}>
            创建账户
          </Button>
        )}
        {current?.id === 'entry' && (
          <Button className="mb-primary-btn" leftSection={<Plus size={16} />} onClick={onRecord}>
            记一笔
          </Button>
        )}
        {current?.id === 'report' && (
          <Button
            className="mb-primary-btn"
            leftSection={<FolderInput size={16} />}
            onClick={onOpenReports}
          >
            查看报表
          </Button>
        )}
        {/* 导入是并行的第二条路：任何一步都能用它代替手动操作。 */}
        {current?.id !== 'entry' && (
          <Button
            className="mb-secondary-btn"
            variant="default"
            leftSection={<FolderInput size={16} />}
            onClick={onImport}
          >
            导入账单
          </Button>
        )}
      </div>
    </Card>
  )
}

export function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <Card variant="state" tone="danger" role="alert">
      <div className="mb-errorpanel-mark" aria-hidden="true">
        !
      </div>
      <h2 className="mb-errorpanel-title">数据没取出来</h2>
      <p className="mb-errorpanel-desc">本地数据库响应超时。你的数据没有丢失——这是展示层的问题。</p>
      <div className="mb-errorpanel-actions">
        <Button className="mb-primary-btn" leftSection={<RotateCcw size={16} />} onClick={onRetry}>
          重试
        </Button>
      </div>
    </Card>
  )
}

export function LoadingSkeleton({
  device,
  variant = 'overview',
}: {
  device: DeviceMode
  variant?: 'overview' | 'transactions' | 'reports' | 'settings'
}) {
  const mobile = device === 'mobile'
  if (variant === 'reports') {
    return (
      <div className="mb-skeleton-page" role="status" aria-busy="true" aria-label="正在加载报表">
        <div className="mb-skeleton mb-skeleton-toolbar" />
        <div className={mobile ? 'mb-skeleton mb-skeleton-hero is-mobile' : 'mb-skeleton mb-skeleton-metrics'} />
        <div className={mobile ? 'mb-skeleton mb-skeleton-chart' : 'mb-skeleton mb-skeleton-chart is-wide'} />
        <div className="mb-skeleton-row">
          <div className="mb-skeleton mb-skeleton-card" />
          <div className="mb-skeleton mb-skeleton-card" />
        </div>
        <span className="mb-visually-hidden">正在加载报表数据</span>
      </div>
    )
  }
  if (variant === 'settings') {
    return (
      <div className="mb-skeleton-page" role="status" aria-busy="true" aria-label="正在加载设置">
        <div className="mb-skeleton mb-skeleton-toolbar" />
        <div className={mobile ? '' : 'mb-set-skeleton'}>
          {!mobile && <div className="mb-skeleton mb-skeleton-nav" />}
          <div className="mb-skeleton mb-skeleton-settings-list" />
        </div>
        <span className="mb-visually-hidden">正在加载设置</span>
      </div>
    )
  }
  if (variant === 'transactions') {
    return (
      <div className="mb-skeleton-page" role="status" aria-busy="true" aria-label="正在加载流水">
        <div className="mb-skeleton mb-skeleton-toolbar" />
        <Card as="div" className="mb-skeleton-list">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="mb-skeleton mb-skeleton-line" />
          ))}
        </Card>
        <span className="mb-visually-hidden">正在加载流水数据</span>
      </div>
    )
  }

  return (
    <div className="mb-skeleton-page" role="status" aria-busy="true" aria-label="正在加载总览">
      <div className={mobile ? 'mb-skeleton mb-skeleton-hero is-mobile' : 'mb-skeleton mb-skeleton-hero'} />
      {mobile ? (
        <>
          <div className="mb-skeleton-row">
            <div className="mb-skeleton mb-skeleton-snap" />
            <div className="mb-skeleton mb-skeleton-snap" />
          </div>
          <div className="mb-skeleton mb-skeleton-entry" />
          <div className="mb-skeleton mb-skeleton-chart" />
          <div className="mb-skeleton mb-skeleton-card" />
        </>
      ) : (
        <>
          <div className="mb-skeleton mb-skeleton-entry" />
          <div className="mb-skeleton-mid">
            <div className="mb-skeleton mb-skeleton-card is-tall" />
            <div className="mb-skeleton mb-skeleton-card is-tall" />
          </div>
          <div className="mb-skeleton mb-skeleton-chart" />
        </>
      )}
      <span className="mb-visually-hidden">正在加载总览数据</span>
    </div>
  )
}
