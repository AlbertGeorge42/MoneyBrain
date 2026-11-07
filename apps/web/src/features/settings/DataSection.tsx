/**
 * 设置 · 数据与备份分区（导出 / 导入 / 回滚 / 危险区 / 账户期初）。
 *
 * 数据区的状态机（预览 → 导入 → 期初补录 → 回滚 / 清空）仍由页面统一编排：
 * 这些操作共享同一份账本与忙碌态，拆成独立状态会引入跨组件同步问题。
 */
import {
  AlertTriangle,
  Database,
  Download,
  FolderInput,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import type { Ledger } from '@/features/overview/model'
import type { ImportBackupResult, ImportBatch } from '@/services/api'
import { ImportIssues } from './ImportSheet'
import type { DataBusy } from './settingsData'

interface DataSectionProps {
  apiMode: boolean
  ledger: Ledger
  dataBusy: DataBusy
  backupReady: { filename: string; at: string } | null
  exportError: string | null
  lastImport: ImportBackupResult | null
  batches: ImportBatch[]
  batchError: string | null
  armed: string | null
  onArm: (key: string | null) => void
  onExport: () => void
  onImportSeed: () => void
  onOpenImportWizard: () => void
  onRefreshBatches: () => void
  onRollbackBatch: (batch: ImportBatch) => void
  openingError: string | null
  openingStepOpen: boolean
  onOpenOpening: (names: readonly string[]) => void
  onSeedRollbackConfirm: () => void
  onSeedClear: () => void
  onOpenClearSheet: () => void
}

export function DataSection({
  apiMode,
  ledger,
  dataBusy,
  backupReady,
  exportError,
  lastImport,
  batches,
  batchError,
  armed,
  onArm,
  onExport,
  onImportSeed,
  onOpenImportWizard,
  onRefreshBatches,
  onRollbackBatch,
  openingError,
  openingStepOpen,
  onOpenOpening,
  onSeedRollbackConfirm,
  onSeedClear,
  onOpenClearSheet,
}: DataSectionProps) {
  const unsetAccounts = ledger.accounts.filter((account) => !account.initialBalanceDate)
  // 同名的历史账户（如批量种子钱包）按「名称 + 期初日期」去重，避免同一状态重复刷屏。
  const setAccounts = [
    ...new Map(
      ledger.accounts
        .filter((account) => account.initialBalanceDate)
        .map((account) => [`${account.name}|${account.initialBalanceDate}`, account]),
    ).values(),
  ]

  const renderBatchList = () => {
    if (batchError) {
      return (
        <p className="mb-set-error" role="alert">
          {batchError}
          <HfButton className="mb-set-textbtn" onClick={onRefreshBatches}>
            重试
          </HfButton>
        </p>
      )
    }
    if (batches.length === 0) {
      return <p>还没有导入记录。导入成功后会在这里显示可撤销的批次。</p>
    }
    return (
      <ul className="mb-set-batch-list">
        {batches.map((batch) => {
          const armedBatch = armed === `import-${batch.id}`
          const busyBatch = dataBusy === `rollback:${batch.id}`
          return (
            <li className="mb-set-batch" key={batch.id}>
              <span className="mb-set-batch-name">{batch.filename}</span>
              <span className="mb-set-batch-meta">
                {new Date(batch.createdAt).toLocaleString('zh-CN', { hour12: false })} · 这批{' '}
                {batch.transactionCount} 笔
              </span>
              {batch.status === 'active' ? (
                <HfButton
                  className={armedBatch ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn'}
                  disabled={busyBatch}
                  onClick={() => {
                    if (busyBatch) return
                    if (!armedBatch) {
                      onArm(`import-${batch.id}`)
                      return
                    }
                    onRollbackBatch(batch)
                  }}
                >
                  {busyBatch ? '撤销中…' : armedBatch ? '确认撤销' : '撤销这批'}
                </HfButton>
              ) : (
                <span className="mb-set-batch-done">
                  已撤销 {batch.rolledBack?.transaction ?? 0} 笔
                </span>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="mb-set-data">
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Database size={18} />
          <h3>导出</h3>
        </div>
        {apiMode ? (
          <>
            <HfButton
              className="mb-set-btn"
              disabled={dataBusy === 'export'}
              onClick={onExport}
            >
              <Download size={16} />
              {dataBusy === 'export' ? '导出中…' : '导出账本 (.mbx)'}
            </HfButton>
            {backupReady && (
              <p>
                最近备份：{backupReady.filename}（
                {new Date(backupReady.at).toLocaleTimeString('zh-CN', { hour12: false })}）
              </p>
            )}
            {exportError && (
              <p className="mb-set-error" role="alert">
                {exportError}
                <HfButton className="mb-set-textbtn" onClick={onExport}>
                  重试
                </HfButton>
              </p>
            )}
          </>
        ) : (
          <HfButton className="mb-set-btn" onClick={onExport}>
            <Download size={16} />
            导出账本
          </HfButton>
        )}
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <FolderInput size={18} />
          <h3>导入</h3>
        </div>
        {apiMode ? (
          <>
            <HfButton className="mb-set-btn" onClick={onOpenImportWizard}>
              <FolderInput size={16} />
              打开导入向导
            </HfButton>
            {lastImport && (
              <>
                <p>
                  这批导入了 {lastImport.imported.transactions} 笔；批次 {lastImport.importId?.slice(0, 8)}
                  可在「回滚」撤销。
                </p>
                <ImportIssues summary={lastImport.summary} />
              </>
            )}
            <p>导入前会先解析并展示预览，确认后才写入；失败不会留下半截数据。</p>
          </>
        ) : (
          <HfButton className="mb-set-btn" onClick={onImportSeed}>
            <FolderInput size={16} />
            打开导入向导
          </HfButton>
        )}
      </section>
      <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <RotateCcw size={18} />
          <h3>回滚</h3>
        </div>
        {apiMode ? (
          renderBatchList()
        ) : (
          <>
            <p>还原到最近一次自动存点，回滚前会再存一个还原点。</p>
            <HfButton
              className={armed === 'rollback' ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn'}
              onClick={() => {
                if (armed === 'rollback') {
                  onSeedRollbackConfirm()
                  return
                }
                onArm('rollback')
              }}
            >
              {armed === 'rollback' ? '确认恢复' : '回滚到上一存点'}
            </HfButton>
          </>
        )}
      </section>
      <section className="mb-set-datacard is-danger">
        <div className="mb-set-datacard-head">
          <AlertTriangle size={18} />
          <h3>危险区</h3>
        </div>
        {apiMode ? (
          <>
            <p>
              清空前必须导出备份；清空后所有账户、分类、流水、预算与投资快照都会删除，
              回收站与审计记录一并清空。
            </p>
            <HfButton className="mb-set-btn is-danger" onClick={onOpenClearSheet}>
              清空账本
            </HfButton>
            {!backupReady && <p className="mb-set-warn">尚未导出备份，清空会被拦住。</p>}
          </>
        ) : (
          <>
            <p>清空后所有账户、分类与流水都会删除，仅保留导出文件可恢复。</p>
            <HfButton
              className={armed === 'clear' ? 'mb-set-btn is-danger is-armed' : 'mb-set-btn is-danger'}
              onClick={() => {
                if (armed === 'clear') {
                  onSeedClear()
                  return
                }
                onArm('clear')
              }}
            >
              {armed === 'clear' ? '确认清空账本' : '清空账本'}
            </HfButton>
          </>
        )}
      </section>
      {apiMode && <section className="mb-set-datacard">
        <div className="mb-set-datacard-head">
          <Wallet size={18} />
          <h3>账户期初</h3>
        </div>
        <p>期初余额不能由流水倒推；导入新建的账户需要补录「期初余额 + 期初日期」。</p>
        {openingError && !openingStepOpen && (
          <p className="mb-set-error" role="alert">
            {openingError}
          </p>
        )}
        {unsetAccounts.length > 0 ? (
          <>
            <HfButton
              className="mb-set-btn"
              onClick={() => onOpenOpening(unsetAccounts.map((account) => account.name))}
            >
              补录期初余额（{unsetAccounts.length} 个未设）
            </HfButton>
            <p className="mb-set-warn">
              未设期初（余额由流水推导，可能不准）：
              {unsetAccounts.map((account) => accountDisplayName(account, ledger.accounts)).join('、')}
            </p>
          </>
        ) : (
          <p>{lastImport ? '本批导入的新账户都已设置期初。' : '所有账户都已设置期初。'}</p>
        )}
        {setAccounts.length > 0 && (
          <p className="mb-set-hint">
            已设期初：
            {setAccounts
              .map(
                (account) =>
                  `${accountDisplayName(account, ledger.accounts)}（${account.initialBalanceDate}）`,
              )
              .join('、')}
          </p>
        )}
      </section>}
    </div>
  )
}
