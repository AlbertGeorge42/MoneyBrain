import { Button } from '@mantine/core'
import { FolderInput, Plus, RotateCcw, Wallet } from 'lucide-react'
import type { DeviceMode } from './types'
import './states.css'

/**
 * 冷启动引导：总览与流水共用同一套组件，避免两页出现两套空状态文案与操作。
 */
export function ColdStartGuide({
  variant = 'overview',
  onPrimary,
  onImport,
}: {
  variant?: 'overview' | 'transactions'
  onPrimary: () => void
  onImport: () => void
}) {
  const isTransactions = variant === 'transactions'
  return (
    <section className="mb-coldstart" aria-labelledby="mb-coldstart-title">
      <div className="mb-coldstart-mark" aria-hidden="true">
        <Wallet size={30} strokeWidth={1.8} />
      </div>
      <h2 id="mb-coldstart-title" className="mb-coldstart-title">
        {isTransactions ? '还没有流水' : '从一个账户开始'}
      </h2>
      <p className="mb-coldstart-desc">
        {isTransactions
          ? '账本已经建好，记下第一笔收支后，这里会按日期自动归档。'
          : '先建一个账户，或导入现有账单。所有数据只留在本机，不上传任何服务器。'}
      </p>
      <ol className="mb-coldstart-steps">
        <li>
          <span className="mb-coldstart-step">1</span>
          建立现金、储蓄或投资账户
        </li>
        <li>
          <span className="mb-coldstart-step">2</span>
          记一笔，或导入银行 / 支付宝账单
        </li>
        <li>
          <span className="mb-coldstart-step">3</span>
          总览会自动生成收支与净值走势
        </li>
      </ol>
      <div className="mb-coldstart-actions">
        <Button className="mb-primary-btn" leftSection={<Plus size={16} />} onClick={onPrimary}>
          创建账户
        </Button>
        <Button className="mb-secondary-btn" variant="default" leftSection={<FolderInput size={16} />} onClick={onImport}>
          导入账单
        </Button>
      </div>
      <p className="mb-coldstart-note">你的数据只在本机；随时可完整导出。</p>
    </section>
  )
}

export function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mb-errorpanel" role="alert">
      <div className="mb-errorpanel-mark" aria-hidden="true">
        !
      </div>
      <h2 className="mb-errorpanel-title">数据没取出来</h2>
      <p className="mb-errorpanel-desc">本地数据库响应超时。你的数据没有丢失——这是展示层的问题。</p>
      <div className="mb-errorpanel-actions">
        <Button className="mb-primary-btn" leftSection={<RotateCcw size={16} />} onClick={onRetry}>
          重试
        </Button>
        <Button className="mb-secondary-btn" variant="default">
          打开诊断
        </Button>
      </div>
      <p className="mb-errorpanel-code">ERR_LOCAL_DB_TIMEOUT · 2.4s</p>
    </section>
  )
}

export function LoadingSkeleton({
  device,
  variant = 'overview',
}: {
  device: DeviceMode
  variant?: 'overview' | 'transactions' | 'reports'
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
  if (variant === 'transactions') {
    return (
      <div className="mb-skeleton-page" role="status" aria-busy="true" aria-label="正在加载流水">
        <div className="mb-skeleton mb-skeleton-toolbar" />
        <div className="mb-card mb-skeleton-list">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="mb-skeleton mb-skeleton-line" />
          ))}
        </div>
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
