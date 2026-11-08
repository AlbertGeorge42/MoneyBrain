/**
 * 设置 · 自动备份分区。
 *
 * 设置读写仍由页面的 backupConfig / backup* 状态承担；
 * 本组件只渲染表单与执行结果的只读状态（后端派生字段不假装可编辑）。
 */
import { HardDriveDownload } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSwitch } from '@/features/shared/HfSwitch'
import type { AutoBackupConfig } from '@/services/api'

interface BackupSectionProps {
  apiMode: boolean
  config: AutoBackupConfig | null
  loading: boolean
  error: string | null
  enabled: boolean | null
  directory: string | null
  intervalHours: string | null
  keepCount: string | null
  saving: boolean
  onEnabledChange: (enabled: boolean) => void
  onDirectoryChange: (directory: string) => void
  onIntervalHoursChange: (hours: string) => void
  onKeepCountChange: (count: string) => void
  onSave: () => void
  onReload: () => void
}

export function BackupSection({
  apiMode,
  config,
  loading,
  error,
  enabled,
  directory,
  intervalHours,
  keepCount,
  saving,
  onEnabledChange,
  onDirectoryChange,
  onIntervalHoursChange,
  onKeepCountChange,
  onSave,
  onReload,
}: BackupSectionProps) {
  const head = (
    <div className="mb-set-datacard-head">
      <HardDriveDownload size={18} />
      <h3>自动备份</h3>
    </div>
  )

  if (!apiMode) {
    return (
      <section className="mb-set-datacard">
        {head}
        <p>自动备份设置需要连接真实后端；当前为演示数据源，无法读取或保存。</p>
      </section>
    )
  }

  if (!config) {
    return (
      <section className="mb-set-datacard">
        {head}
        {error ? (
          <p className="mb-set-error" role="alert">
            {error}
            <HfButton className="mb-set-textbtn" onClick={onReload}>
              重试
            </HfButton>
          </p>
        ) : (
          <p>{loading ? '正在读取自动备份配置…' : '尚未读取到自动备份配置。'}</p>
        )}
      </section>
    )
  }

  const effectiveEnabled = enabled ?? config.enabled
  const effectiveDirectory = directory ?? config.directory
  const effectiveIntervalHours = intervalHours ?? String(config.intervalHours)
  const effectiveKeepCount = keepCount ?? String(config.keepCount)
  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('zh-CN', { hour12: false })

  return (
    <div className="mb-set-data">
      <section className="mb-set-datacard">
        {head}
        <div className="mb-set-capability-row">
          <div className="mb-set-capability-copy">
            <span className="mb-set-name">开启自动备份</span>
            <span className="mb-set-meta">
              {effectiveEnabled
                ? `已开启 · 距上次成功超过 ${effectiveIntervalHours} 小时时执行`
                : '未开启'}
            </span>
          </div>
          <HfSwitch
            variant="settings"
            checked={effectiveEnabled}
            onChange={onEnabledChange}
            ariaLabel="开启自动备份"
          />
        </div>
        <label className="mb-set-field">
          <span className="mb-set-label">备份目录（绝对路径）</span>
          <input
            className="mb-set-input"
            value={effectiveDirectory}
            placeholder={config.defaultDirectory}
            onChange={(event) => onDirectoryChange(event.target.value)}
          />
        </label>
        <label className="mb-set-field">
          <span className="mb-set-label">备份间隔（小时）</span>
          <input
            className="mb-set-input"
            type="number"
            min={1}
            step={1}
            value={effectiveIntervalHours}
            onChange={(event) => onIntervalHoursChange(event.target.value)}
          />
        </label>
        <label className="mb-set-field">
          <span className="mb-set-label">保留份数（份）</span>
          <input
            className="mb-set-input"
            type="number"
            min={1}
            step={1}
            value={effectiveKeepCount}
            onChange={(event) => onKeepCountChange(event.target.value)}
          />
        </label>
        <HfButton className="mb-set-btn is-primary" disabled={saving} onClick={onSave}>
          {saving ? '保存中…' : '保存设置'}
        </HfButton>
        {error && (
          <p className="mb-set-error" role="alert">
            {error}
          </p>
        )}
        <div className="mb-set-backup-meta">
          {config.lastRunAt ? (
            <span>上次自动备份：{formatDateTime(config.lastRunAt)}</span>
          ) : (
            <span>还没有自动备份过。</span>
          )}
          <span>
            {config.nextWindowAt
              ? `预计下次备份：${formatDateTime(config.nextWindowAt)} 后的第一个空闲窗口`
              : '开启后将在系统空闲时执行首次备份'}
          </span>
          <span>目录内现有备份 {config.backupCount} 份。</span>
        </div>
        {config.lastRunError && (
          <p className="mb-set-error" role="alert">
            上次自动备份失败：{config.lastRunError}
          </p>
        )}
      </section>
    </div>
  )
}
