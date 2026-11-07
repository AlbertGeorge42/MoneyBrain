/**
 * 设置 · 自动备份分区。
 *
 * 设置读写仍由页面的 backupConfig / backupEnabled / backupDirectory 状态承担；
 * 本组件只渲染表单与只读的固定策略说明（后端未提供的字段不假装可保存）。
 */
import { Database, HardDriveDownload } from 'lucide-react'
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
  saving: boolean
  onEnabledChange: (enabled: boolean) => void
  onDirectoryChange: (directory: string) => void
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
  saving,
  onEnabledChange,
  onDirectoryChange,
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
              {effectiveEnabled ? '已开启 · 距上次成功超过 24 小时时执行' : '未开启'}
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

      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Database size={18} />
          <h3>频率与保留份数</h3>
        </div>
        <p>以下两项后端接口尚未提供字段，前端只读展示当前固定策略，不会假装保存成功。</p>
        <div className="mb-set-capability-row is-disabled">
          <span className="mb-set-name">备份频率</span>
          <select className="mb-set-input mb-set-capability-control" disabled defaultValue="daily">
            <option value="daily">每天</option>
          </select>
          <span className="mb-set-gap-tag">后端未提供</span>
        </div>
        <div className="mb-set-capability-row is-disabled">
          <span className="mb-set-name">保留份数</span>
          <input
            className="mb-set-input mb-set-capability-control"
            type="number"
            disabled
            defaultValue={7}
          />
          <span className="mb-set-gap-tag">后端未提供</span>
        </div>
        <p>服务端当前固定：距上次成功 ≥ 24 小时的空闲窗口执行，目录内保留最近 7 份。</p>
      </section>
    </div>
  )
}
