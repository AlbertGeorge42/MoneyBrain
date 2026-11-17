/**
 * 清空账本抽屉。
 *
 * 必须先成功导出备份才允许确认；确认文字逐字校验，禁用原因紧贴确认按钮上方。
 */
import { X } from 'lucide-react'
import { Button } from '@/features/shared/Button'
import { IconButton } from '@/features/shared/IconButton'
import { FieldLabel } from '@/features/shared/FieldLabel'
import { Sheet } from '@/features/shared/Sheet'
import type { DeviceMode } from '@/features/shared/types'
import { CLEAR_WORD } from './settingsData'

interface ClearSheetProps {
  device: DeviceMode
  opened: boolean
  exporting: boolean
  clearing: boolean
  backupReady: { filename: string; at: string } | null
  exportError: string | null
  clearWord: string
  error: string | null
  onClose: () => void
  onExport: () => void
  onWordChange: (word: string) => void
  onConfirm: () => void
}

export function ClearSheet({
  device,
  opened,
  exporting,
  clearing,
  backupReady,
  exportError,
  clearWord,
  error,
  onClose,
  onExport,
  onWordChange,
  onConfirm,
}: ClearSheetProps) {
  return (
    <Sheet
      variant="settings"
      device={device}
      opened={opened}
      onClose={() => {
        if (clearing) return
        onClose()
      }}
      desktopSize={460}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">清空账本</h2>
        <IconButton size="sm" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="mb-set-sheet-body">
        <p className="mb-set-danger-note">
          清空会删除所有账户、分类、流水、预算与投资快照，且不可恢复。回收站与审计记录会一并清空。
        </p>

        <div className={backupReady ? 'mb-set-backup-state is-ready' : 'mb-set-backup-state is-blocked'}>
          <span>
            {backupReady
              ? `已备份：${backupReady.filename}（${new Date(backupReady.at).toLocaleTimeString('zh-CN', { hour12: false })}）`
              : '备份文件 (.mbx)'}
          </span>
          <Button
            variant="link"
            boxed
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? '导出中…' : backupReady ? '重新导出' : '先导出备份 (.mbx)'}
          </Button>
        </div>
        {exportError && (
          <p className="mb-set-error" role="alert">
            {exportError}
          </p>
        )}

        <label className="mb-set-field">
          <FieldLabel>输入「{CLEAR_WORD}」确认</FieldLabel>
          <input
            className="mb-shared-input mb-shared-input--lg"
            value={clearWord}
            placeholder={CLEAR_WORD}
            onChange={(event) => onWordChange(event.target.value)}
          />
        </label>

        {error && (
          <p className="mb-set-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* 禁用原因紧贴确认按钮上方：不要把理由埋在表单中部。 */}
      {!backupReady && (
        <p className="mb-set-clear-gate" id="mb-set-clear-reason">
          尚未导出备份：必须先导出备份才能继续
        </p>
      )}
      <div className="mb-set-sheet-actions">
        <Button variant="secondary" disabled={clearing} onClick={onClose}>
          取消
        </Button>
        <Button
          variant="danger"
          disabled={!backupReady || clearing}
          aria-describedby={!backupReady ? 'mb-set-clear-reason' : undefined}
          onClick={onConfirm}
        >
          {clearing ? '清空中…' : '确认清空'}
        </Button>
      </div>
    </Sheet>
  )
}
