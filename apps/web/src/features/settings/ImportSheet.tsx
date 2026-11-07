/**
 * 导入向导抽屉 + 可复用的导入问题清单。
 *
 * 预览 / 导入的忙碌态与错误仍由页面持有；本文件只做展示与回调，
 * `ImportIssues` 同时供数据区「最近一次导入」复用。
 */
import { X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import type { ImportFileSummary, ImportPreview } from '@/services/api'
import { formatCurrency } from '@/utils/format'
import { minor } from '@domain/index'

export function ImportIssues({ summary }: { summary: ImportFileSummary | undefined }) {
  if (!summary) return null
  const skippedRows = summary.skippedRows ?? []
  const autoFixedRows = summary.autoFixedRows ?? 0
  if (skippedRows.length === 0 && autoFixedRows === 0) return null
  return (
    <div className="mb-set-preview-issues" data-testid="import-issues">
      {autoFixedRows > 0 && (
        <p>已自动修正 {autoFixedRows} 行（金额浮点尾差已四舍五入到分）</p>
      )}
      {skippedRows.length > 0 && (
        <>
          <p>跳过 {skippedRows.length} 行（未写入账本）：</p>
          <ul>
            {skippedRows.map((row) => (
              <li key={`${row.rowNumber}-${row.reason}`}>
                第 {row.rowNumber} 行：{row.reason}
                {Object.keys(row.raw).length > 0 && (
                  <span className="mb-set-preview-issue-raw">
                    原值 {Object.entries(row.raw).map(([key, value]) => `${key}=${value}`).join('；')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ImportSummary({ value }: { value: ImportPreview }) {
  const summary = value.result.summary
  return (
    <div className="mb-set-preview" data-testid="import-preview">
      {summary ? (
        <>
          <div className="mb-set-preview-row">
            <span>期间跨度</span>
            <b>
              {summary.dateFrom && summary.dateTo
                ? `${summary.dateFrom} ~ ${summary.dateTo}`
                : '未识别到日期'}
            </b>
          </div>
          <div className="mb-set-preview-row">
            <span>文件笔数</span>
            <b>{summary.total} 笔</b>
          </div>
          <div className="mb-set-preview-row">
            <span>金额合计</span>
            <b>{formatCurrency(minor(summary.amountTotal))}</b>
          </div>
          <div className="mb-set-preview-row">
            <span>疑似重复</span>
            <b>{summary.duplicates} 笔（将跳过）</b>
          </div>
        </>
      ) : (
        <p>服务端未返回文件摘要，仅显示导入计数。</p>
      )}
      <div className="mb-set-preview-row">
        <span>将导入</span>
        <b>{value.result.imported.transactions} 笔</b>
      </div>
      <div className="mb-set-preview-row">
        <span>将跳过</span>
        <b>{value.result.skipped.transactions} 笔</b>
      </div>
      {summary && (
        <>
          <div className="mb-set-preview-note">
            <span>无法识别的账户（导入时新建）</span>
            <b>{summary.unknownAccounts.length ? summary.unknownAccounts.join('、') : '无'}</b>
          </div>
          <div className="mb-set-preview-note">
            <span>无法识别的分类（导入时新建）</span>
            <b>{summary.unknownCategories.length ? summary.unknownCategories.join('、') : '无'}</b>
          </div>
          <ImportIssues summary={summary} />
        </>
      )}
    </div>
  )
}

interface ImportSheetProps {
  device: DeviceMode
  opened: boolean
  previewing: boolean
  importing: boolean
  preview: ImportPreview | null
  error: string | null
  onClose: () => void
  onFileChange: (file: File | null) => void
  onPreview: () => void
  onConfirm: () => void
}

export function ImportSheet({
  device,
  opened,
  previewing,
  importing,
  preview,
  error,
  onClose,
  onFileChange,
  onPreview,
  onConfirm,
}: ImportSheetProps) {
  return (
    <HfSheet
      variant="settings"
      device={device}
      opened={opened}
      onClose={() => {
        if (importing || previewing) return
        onClose()
      }}
      desktopSize={460}
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">导入备份</h2>
        <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <label className="mb-set-field">
          <span className="mb-set-label">备份文件（.mbx / .zip / .csv / .json）</span>
          <input
            className="mb-set-input mb-set-file"
            type="file"
            accept=".mbx,.zip,.csv,.json"
            disabled={previewing || importing}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </label>

        {error && (
          <p className="mb-set-error" role="alert">
            {error}
          </p>
        )}

        {preview ? <ImportSummary value={preview} /> : (
          <p className="mb-set-hint">
            先解析预览：期间跨度、笔数、金额合计、无法识别的账户/分类与疑似重复都会在确认前显示。
          </p>
        )}
      </div>

      <div className="mb-set-sheet-actions">
        <HfButton className="mb-set-btn" disabled={importing} onClick={onClose}>
          取消
        </HfButton>
        {preview ? (
          <HfButton className="mb-set-btn is-primary" disabled={importing} onClick={onConfirm}>
            {importing ? '导入中…' : '确认导入'}
          </HfButton>
        ) : (
          <HfButton className="mb-set-btn is-primary" disabled={previewing} onClick={onPreview}>
            {previewing ? '解析中…' : '解析并预览'}
          </HfButton>
        )}
      </div>
    </HfSheet>
  )
}
