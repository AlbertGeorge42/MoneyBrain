/**
 * 设置页（HF 批次 4）
 *
 * 结构以 concept-design「设置信息架构」为准：
 * - PC：左导航 + 右内容，同一时间只显示一个分区；
 * - 移动：入口列表 → 全屏二级页（页头 ‹ 返回）；
 * - 分区渲染在 Section 组件内，页面只持有跨分区状态与写操作；
 * - 配置行统一模板：⠿ 占位 + 图标 + 名称（摘要）+ 行尾 ⋯ 菜单。
 */
import { useEffect, useState } from 'react'
import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { useToast, type ToastOptions } from '@/features/shared/toastContext'
import { HfButton } from '@/features/shared/HfButton'
import { ChevronLeft, Plus, Wallet } from 'lucide-react'
import type { ThemeMode } from '@/features/shared/types'
import { fromMajor } from '@domain/index'
import { downloadBlob, todayFilename } from '@/utils/download'
import { accountApi, dataApi } from '@/services/api'
import type {
  AutoBackupConfig,
  ImportBackupResult,
  ImportBatch,
  ImportPreview,
} from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { unwrapApiData } from '@/services/apiResult'
import { useLedger } from '@/features/overview/ledgerStore'
import { todayLocal } from '@/features/overview/apiLedger'
import type { TxType } from '@/features/overview/model'
import { RecycleBinCountProbe } from './RecycleBinSection'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import {
  readDisplaySettings,
  writeDisplaySettings,
  type DisplaySettings,
} from '@/features/transactions/displaySettings'
import {
  INVESTMENT_TYPES,
  accountGroupCount,
  sectionMeta,
  type ActivityGroupId,
  type InvestmentTypeRow,
  type SectionId,
} from './settingsModel'
import { LedgerConfigSheets } from '@/features/ledger-config/LedgerConfigSheets'
import { useLedgerConfigController } from '@/features/ledger-config/useLedgerConfigController'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { CashflowSection, type CashflowTab } from './CashflowSection'
import { InvestSection } from './InvestSection'
import { AppearanceSection } from './AppearanceSection'
import { BackupSection } from './BackupSection'
import { DisplaySection } from './DisplaySection'
import { DataSection } from './DataSection'
import { TrashSection } from './TrashSection'
import { SettingsDesktopNav, SettingsMobileList } from './SettingsNav'
import { ImportSheet } from './ImportSheet'
import { OpeningSheet } from './OpeningSheet'
import { ClearSheet } from './ClearSheet'
import {
  CLEAR_WORD,
  fetchAccountSnapshots,
  netSnapshotOf,
  type DataBusy,
  type OpeningResult,
  type OpeningStep,
  type OpeningValues,
} from './settingsData'
import '@/features/reports/reports.css'
import './settings.css'

interface SettingsPageProps {
  device: DeviceMode
  dataState: DataState
  onRetry: () => void
  onImport: () => void
}

function countByType(categories: readonly { type: TxType }[], type: TxType): number {
  return categories.filter((category) => category.type === type).length
}

export function SettingsPage({ device, dataState, onRetry, onImport }: SettingsPageProps) {
  const { ledger, dataMode, replaceLedger } = useLedger()
  const apiMode = dataMode === 'api'
  const [trashCount, setTrashCount] = useState(0)
  const [active, setActive] = useState<SectionId>('accounts')
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [cashTab, setCashTab] = useState<CashflowTab>('asset')
  const [armed, setArmed] = useState<string | null>(null)
  const { notify: pushToast } = useToast()
  const notify = (message: string, options?: ToastOptions) => {
    pushToast(message, options)
  }
  const [display, setDisplay] = useState<DisplaySettings>(readDisplaySettings)
  const [activity, setActivity] = useState<Record<string, ActivityGroupId>>({})
  const [investRows, setInvestRows] = useState<readonly InvestmentTypeRow[]>(INVESTMENT_TYPES)
  const config = useLedgerConfigController({
    notify,
    onSaveInvest: (id, value) => {
      setInvestRows((rows) =>
        rows.map((row) => (row.id === id ? { ...row, target: value.target } : row)),
      )
      notify('目标占比已更新')
    },
    onMoveActivity: (categoryId, group) => {
      setActivity((current) => ({ ...current, [categoryId]: group }))
    },
  })

  /* ===== 外观主题：直接读写 Mantine 的 colorScheme（light / dark / auto） ===== */
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const currentTheme = useComputedColorScheme('light')
  const themeMode: ThemeMode = colorScheme === 'auto' ? 'system' : colorScheme

  /* ===== 自动备份：真实读写 GET/PUT /data/auto-backup ===== */
  const [backupConfig, setBackupConfig] = useState<AutoBackupConfig | null>(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupEnabled, setBackupEnabled] = useState<boolean | null>(null)
  const [backupDirectory, setBackupDirectory] = useState<string | null>(null)
  const [backupIntervalHours, setBackupIntervalHours] = useState<string | null>(null)
  const [backupKeepCount, setBackupKeepCount] = useState<string | null>(null)
  const [backupSaving, setBackupSaving] = useState(false)
  const [backupReloadKey, setBackupReloadKey] = useState(0)

  /* ===== 数据：导入 / 导出 / 回滚 / 清空 ===== */
  const [dataBusy, setDataBusy] = useState<DataBusy>(null)
  const [backupReady, setBackupReady] = useState<{ filename: string; at: string } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<ImportBackupResult | null>(null)
  /** 导入后创建的新账户：补录期初余额（可跳过，跳过即标注余额由流水推导）。 */
  const [openingStep, setOpeningStep] = useState<OpeningStep | null>(null)
  const [openingValues, setOpeningValues] = useState<OpeningValues>({})
  const [openingResult, setOpeningResult] = useState<OpeningResult | null>(null)
  const [openingError, setOpeningError] = useState<string | null>(null)
  const [openingSaving, setOpeningSaving] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [batchError, setBatchError] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearWord, setClearWord] = useState('')
  const [clearError, setClearError] = useState<string | null>(null)

  const refreshImportBatches = async () => {
    try {
      const response = await dataApi.listImportBatches()
      setBatches(unwrapApiData(response))
      setBatchError(null)
    } catch (error) {
      setBatchError(getApiErrorMessage(error, '读取导入记录失败，请重试'))
    }
  }

  useEffect(() => {
    if (!apiMode) return
    if (active !== 'data' && openSection !== 'data') return
    let cancelled = false
    void (async () => {
      try {
        const response = await dataApi.listImportBatches()
        if (!cancelled) {
          setBatches(unwrapApiData(response))
          setBatchError(null)
        }
      } catch (error) {
        if (!cancelled) setBatchError(getApiErrorMessage(error, '读取导入记录失败，请重试'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiMode, active, openSection, lastImport])

  useEffect(() => {
    if (!apiMode) return
    if (active !== 'backup' && openSection !== 'backup') return
    let cancelled = false
    setBackupLoading(true)
    void (async () => {
      try {
        const response = await dataApi.getAutoBackup()
        if (cancelled) return
        setBackupConfig(unwrapApiData(response))
        setBackupError(null)
      } catch (error) {
        if (!cancelled) setBackupError(getApiErrorMessage(error, '读取自动备份配置失败，请重试'))
      } finally {
        if (!cancelled) setBackupLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiMode, active, openSection, backupReloadKey])

  const saveAutoBackup = async () => {
    if (!backupConfig) return
    const enabled = backupEnabled ?? backupConfig.enabled
    const directory = (backupDirectory ?? backupConfig.directory).trim()
    const intervalHours = Number(backupIntervalHours ?? backupConfig.intervalHours)
    const keepCount = Number(backupKeepCount ?? backupConfig.keepCount)
    setBackupSaving(true)
    setBackupError(null)
    try {
      await dataApi.updateAutoBackup({ enabled, directory, intervalHours, keepCount })
      // PUT 只回写配置本体；再读一次拿回 nextWindowAt / backupCount 等派生状态。
      const response = await dataApi.getAutoBackup()
      setBackupConfig(unwrapApiData(response))
      setBackupEnabled(null)
      setBackupDirectory(null)
      setBackupIntervalHours(null)
      setBackupKeepCount(null)
      notify('自动备份设置已保存')
    } catch (error) {
      setBackupError(getApiErrorMessage(error, '保存自动备份设置失败'))
    } finally {
      setBackupSaving(false)
    }
  }
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(null), 3000)
    return () => window.clearTimeout(timer)
  }, [armed])

  const resetTransient = config.resetTransient
  useEffect(() => {
    resetTransient()
    setArmed(null)
  }, [active, openSection, resetTransient])

  useEffect(() => {
    writeDisplaySettings(display)
  }, [display])

  const exportLedger = () => {
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'moneybrain-ledger.json'
    link.click()
    URL.revokeObjectURL(url)
    notify('已导出当前账本 JSON')
  }

  const clearLedger = () => {
    replaceLedger({ accounts: [], categories: [], budgets: [], transactions: [] })
    notify('账本已清空')
    setArmed(null)
  }

  /** API 模式：后端导出加密容器 `.mbx`，成功后才允许清空。 */
  const exportApiLedger = async () => {
    if (dataBusy) return
    setDataBusy('export')
    setExportError(null)
    try {
      const response = await dataApi.exportFull()
      const disposition = String(response.headers['content-disposition'] ?? '')
      const matched = /filename="?([^";]+)"?/i.exec(disposition)
      const filename = matched?.[1] ?? todayFilename('moneybrain-backup', 'mbx')
      await downloadBlob(response.data, filename)
      setBackupReady({ filename, at: new Date().toISOString() })
      notify(`已导出备份 ${filename}`)
    } catch (error) {
      setExportError(getApiErrorMessage(error, '导出失败，请重试'))
    } finally {
      setDataBusy(null)
    }
  }

  const runImportPreview = async () => {
    if (!importFile) {
      setPreviewError('请选择要导入的备份文件')
      return
    }
    if (dataBusy) return
    setDataBusy('preview')
    setPreviewError(null)
    setPreview(null)
    try {
      const response = await dataApi.previewImport(importFile, { mode: 'merge' })
      setPreview(unwrapApiData(response))
    } catch (error) {
      setPreviewError(getApiErrorMessage(error, '解析失败，请检查文件后重试'))
    } finally {
      setDataBusy(null)
    }
  }

  const confirmImport = async () => {
    if (!importFile || !preview || dataBusy) return
    setDataBusy('import')
    setPreviewError(null)
    try {
      const response = await dataApi.importBackup(importFile, { mode: 'merge' })
      const result = unwrapApiData(response)
      setLastImport(result)
      setImportOpen(false)
      setImportFile(null)
      setPreview(null)
      notify(`这批导入了 ${result.imported.transactions} 笔`)
      onRetry()
      await refreshImportBatches()
      // 新账户的期初不能由流水倒推：导入完成后立刻进入补录步骤（可跳过）。
      const created = result.summary?.unknownAccounts ?? []
      if (created.length > 0) await openOpeningStep(created)
    } catch (error) {
      setPreviewError(getApiErrorMessage(error, '导入失败，数据没有写入，可重试'))
    } finally {
      setDataBusy(null)
    }
  }

  /** 导入收尾：列出本批新建的账户，逐个填期初余额与日期。 */
  const openOpeningStep = async (names: readonly string[]) => {
    setOpeningResult(null)
    setOpeningError(null)
    try {
      const rows = await fetchAccountSnapshots()
      const targets = rows.filter((row) => names.includes(row.name))
      if (targets.length === 0) {
        notify('这批没有新建账户，无需补录期初')
        return
      }
      setOpeningValues(
        Object.fromEntries(
          targets.map((row) => [
            row.id,
            {
              // 未设期初的账户留空：留空 = 跳过，不会把 0 元写成「已设期初」。
              amount: row.initialBalance !== 0 ? String(row.initialBalance / 100) : '',
              date: row.initialBalanceDate ?? todayLocal(),
            },
          ]),
        ),
      )
      setOpeningStep({ accounts: targets, before: netSnapshotOf(rows) })
    } catch (error) {
      setOpeningError(getApiErrorMessage(error, '读取新账户失败，可稍后从「账户期初补录」重试'))
      notify(getApiErrorMessage(error, '读取新账户失败'))
    }
  }

  const saveOpeningStep = async () => {
    if (!openingStep || openingSaving) return
    setOpeningSaving(true)
    setOpeningError(null)
    try {
      for (const account of openingStep.accounts) {
        const value = openingValues[account.id]
        // 留空表示跳过该账户，不写期初日期，页面继续标注「未设期初」。
        if (!value || value.amount.trim() === '') continue
        const amount = Number(value.amount)
        if (!Number.isFinite(amount)) throw new Error(`「${account.name}」的期初余额格式不正确`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
          throw new Error(`「${account.name}」的期初余额日期格式不正确`)
        }
        await accountApi
          .update(account.id, {
            initialBalance: fromMajor(amount),
            initialBalanceDate: value.date,
          })
          .then(unwrapApiData)
      }
      const rows = await fetchAccountSnapshots()
      setOpeningResult({ before: openingStep.before, after: netSnapshotOf(rows) })
      setOpeningStep({
        accounts: rows.filter((row) => openingStep.accounts.some((item) => item.id === row.id)),
        before: openingStep.before,
      })
      notify('期初余额已保存，资产负债与净资产已按新期初重算')
      onRetry()
    } catch (error) {
      setOpeningError(getApiErrorMessage(error, '保存失败，请检查后重试'))
    } finally {
      setOpeningSaving(false)
    }
  }

  const closeOpeningStep = () => {
    setOpeningStep(null)
    setOpeningResult(null)
    setOpeningValues({})
    setOpeningError(null)
  }

  const skipOpeningStep = () => {
    closeOpeningStep()
    notify('已跳过期初补录：这些账户的余额由流水推导，可能不准')
  }

  const rollbackImport = async (batch: ImportBatch) => {
    if (dataBusy) return
    setDataBusy(`rollback:${batch.id}`)
    setBatchError(null)
    try {
      const response = await dataApi.rollbackImportBatch(batch.id)
      const result = unwrapApiData(response)
      notify(`已撤销 ${result.removedTransactions} 笔`)
      await refreshImportBatches()
      onRetry()
    } catch (error) {
      setBatchError(getApiErrorMessage(error, '撤销失败，请重试'))
    } finally {
      setDataBusy(null)
      setArmed(null)
    }
  }

  const openClearSheet = () => {
    setClearOpen(true)
    setClearWord('')
    setClearError(null)
    setArmed(null)
  }

  const confirmClearLedger = async () => {
    if (dataBusy) return
    if (!backupReady) {
      setClearError('请先导出备份：备份成功后才会继续清空')
      return
    }
    if (clearWord.trim() !== CLEAR_WORD) {
      setClearError(`请输入「${CLEAR_WORD}」以确认`)
      return
    }
    setDataBusy('clear')
    setClearError(null)
    try {
      await dataApi.clearAll()
      replaceLedger({ accounts: [], categories: [], budgets: [], transactions: [] })
      setClearOpen(false)
      setClearWord('')
      setBackupReady(null)
      notify('账本已清空，可用刚导出的备份恢复')
      onRetry()
    } catch (error) {
      setClearError(getApiErrorMessage(error, '清空失败，数据没有变化，可重试'))
    } finally {
      setDataBusy(null)
    }
  }

  /* ===== 分区内容 ===== */

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'accounts':
        return (
          <AccountsSection
            device={device}
            ledger={ledger}
            assetGroups={config.assetGroups}
            liabilityGroups={config.liabilityGroups}
            tab={config.accountTab}
            onTabChange={config.setAccountTab}
            showEmptyGroups={config.showEmptyGroups}
            onShowEmptyGroupsChange={config.setShowEmptyGroups}
            collapsed={config.collapsed}
            onToggleCollapsed={config.toggleCollapsed}
            onSetGroupsCollapsed={config.setGroupsCollapsed}
            onOpenEditor={config.setEditor}
            onRetry={onRetry}
          />
        )
      case 'categories':
        return (
          <CategoriesSection
            ledger={ledger}
            rows={config.rowsByType[config.categoryTab]}
            tab={config.categoryTab}
            onTabChange={config.setCategoryTab}
            collapsed={config.collapsed}
            onToggleCollapsed={config.toggleCollapsed}
            menuOpen={config.menuOpen}
            onMenuOpen={config.setMenuOpen}
            confirming={config.confirming}
            onConfirm={config.setConfirming}
            onOpenEditor={config.setEditor}
            onOpenMover={config.setMover}
            onReorder={(id, direction) => void config.moveCategoryOrder(id, direction)}
            onDelete={(row, type) => void config.deleteCategory(row, type)}
          />
        )
      case 'cashflow':
        return (
          <CashflowSection
            ledger={ledger}
            rows={cashTab === 'asset' ? [] : config.rowsByType[cashTab]}
            tab={cashTab}
            onTabChange={setCashTab}
            activity={activity}
            collapsed={config.collapsed}
            onToggleCollapsed={config.toggleCollapsed}
            menuOpen={config.menuOpen}
            onMenuOpen={config.setMenuOpen}
            confirming={config.confirming}
            onConfirm={config.setConfirming}
            onOpenMover={config.setMover}
          />
        )
      case 'invest':
        return (
          <InvestSection
            rows={investRows}
            menuOpen={config.menuOpen}
            onMenuOpen={config.setMenuOpen}
            confirming={config.confirming}
            onConfirm={config.setConfirming}
            onOpenEditor={config.setEditor}
          />
        )
      case 'appearance':
        return (
          <AppearanceSection
            themeMode={themeMode}
            currentTheme={currentTheme}
            onThemeChange={(mode) => setColorScheme(mode === 'system' ? 'auto' : mode)}
          />
        )
      case 'backup':
        return (
          <BackupSection
            apiMode={apiMode}
            config={backupConfig}
            loading={backupLoading}
            error={backupError}
            enabled={backupEnabled}
            directory={backupDirectory}
            intervalHours={backupIntervalHours}
            keepCount={backupKeepCount}
            saving={backupSaving}
            onEnabledChange={setBackupEnabled}
            onDirectoryChange={setBackupDirectory}
            onIntervalHoursChange={setBackupIntervalHours}
            onKeepCountChange={setBackupKeepCount}
            onSave={() => void saveAutoBackup()}
            onReload={() => setBackupReloadKey((key) => key + 1)}
          />
        )
      case 'display':
        return (
          <DisplaySection
            display={display}
            onChange={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
          />
        )
      case 'data':
        return (
          <DataSection
            apiMode={apiMode}
            ledger={ledger}
            dataBusy={dataBusy}
            backupReady={backupReady}
            exportError={exportError}
            lastImport={lastImport}
            batches={batches}
            batchError={batchError}
            armed={armed}
            onArm={setArmed}
            onExport={() => void (apiMode ? exportApiLedger() : exportLedger())}
            onImportSeed={onImport}
            onOpenImportWizard={() => {
              setImportOpen(true)
              setPreview(null)
              setPreviewError(null)
            }}
            onRefreshBatches={() => void refreshImportBatches()}
            onRollbackBatch={(batch) => void rollbackImport(batch)}
            openingError={openingError}
            openingStepOpen={Boolean(openingStep)}
            onOpenOpening={(names) => void openOpeningStep(names)}
            onSeedRollbackConfirm={() => {
              setArmed(null)
              notify('已恢复到上一存点')
            }}
            onSeedClear={clearLedger}
            onOpenClearSheet={openClearSheet}
          />
        )
      case 'trash':
        return <TrashSection apiMode={apiMode} ledger={ledger} />
      default:
        return null
    }
  }

  /* ===== 导航 ===== */

  const summaries: Record<SectionId, string> = {
    accounts: `资产 ${config.assetGroups.reduce((sum, group) => sum + accountGroupCount(group), 0)} · 负债 ${config.liabilityGroups.reduce((sum, group) => sum + accountGroupCount(group), 0)}`,
    categories: `收入 ${countByType(ledger.categories, 'income')} · 支出 ${countByType(ledger.categories, 'expense')}`,
    cashflow: '3 组标记 · 4 类活动',
    invest: `${investRows.length} 类资产`,
    appearance: themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色',
    backup: apiMode ? (backupConfig?.enabled ? '已开启' : '未开启') : '需真实后端',
    display: '列显隐 · 排序',
    data: '导入 · 导出 · 回滚',
    trash: apiMode ? `${trashCount} 条可恢复` : '0 条可恢复',
  }

  if (dataState === 'loading') {
    return <LoadingSkeleton device={device} variant="settings" />
  }
  if (dataState === 'error') {
    return <ErrorPanel onRetry={onRetry} />
  }

  const empty = dataState === 'empty'

  const body = empty ? (
    <section className="mb-set-empty">
      <div className="mb-set-empty-mark" aria-hidden="true">
        <Wallet size={28} />
      </div>
      <h2>还没有账户</h2>
      <p>账本为空时设置也可以先配好：从第一个账户开始，分类与现金流标记随后补齐。</p>
      <HfButton
        className="mb-set-btn is-primary"
        onClick={() => config.setEditor({ kind: 'account', mode: 'create', preset: 'deposit' })}
      >
        <Plus size={16} />
        新增账户
      </HfButton>
    </section>
  ) : device === 'desktop' ? (
    <>
      <header className="mb-set-head">
        <h1 className="mb-set-title">设置</h1>
      </header>
      <div className="mb-set-layout">
        <SettingsDesktopNav
          active={active}
          onSelect={setActive}
          apiMode={apiMode}
          trashCount={trashCount}
        />
        <section className="mb-set-panel" aria-labelledby="mb-set-panel-title">
          <div className="mb-set-panel-head">
            <h2 id="mb-set-panel-title" className="mb-set-panel-title">
              {sectionMeta(active).label}
            </h2>
          </div>
          {renderSection(active)}
        </section>
      </div>
    </>
  ) : (
    <>
      <SettingsMobileList onOpen={setOpenSection} summaries={summaries} />
      {openSection && (
        <div className="mb-set-overlay" role="dialog" aria-label={sectionMeta(openSection).label}>
          <header className="mb-set-overlay-head">
            <HfButton
              className="mb-set-back"
              onClick={() => setOpenSection(null)}
            >
              <ChevronLeft size={18} />
              返回
            </HfButton>
            <h2 className="mb-set-overlay-title">{sectionMeta(openSection).label}</h2>
            <span className="mb-set-back-space" aria-hidden="true" />
          </header>
          <div className="mb-set-overlay-body">{renderSection(openSection)}</div>
        </div>
      )}
    </>
  )

  return (
    <div className="mb-set-page" data-device={device}>
      {apiMode && <RecycleBinCountProbe ledger={ledger} onCount={setTrashCount} />}
      {body}
      <LedgerConfigSheets
        controller={config}
        device={device}
        ledger={ledger}
        investRows={investRows}
      />
      {apiMode && (
        <ImportSheet
          device={device}
          opened={importOpen}
          previewing={dataBusy === 'preview'}
          importing={dataBusy === 'import'}
          preview={preview}
          error={previewError}
          onClose={() => setImportOpen(false)}
          onFileChange={(file) => {
            setImportFile(file)
            setPreview(null)
            setPreviewError(null)
          }}
          onPreview={() => void runImportPreview()}
          onConfirm={() => void confirmImport()}
        />
      )}
      {apiMode && openingStep && (
        <OpeningSheet
          device={device}
          ledger={ledger}
          step={openingStep}
          values={openingValues}
          result={openingResult}
          error={openingError}
          saving={openingSaving}
          onValuesChange={setOpeningValues}
          onSkip={skipOpeningStep}
          onDone={closeOpeningStep}
          onSave={() => void saveOpeningStep()}
        />
      )}
      {apiMode && (
        <ClearSheet
          device={device}
          opened={clearOpen}
          exporting={dataBusy === 'export'}
          clearing={dataBusy === 'clear'}
          backupReady={backupReady}
          exportError={exportError}
          clearWord={clearWord}
          error={clearError}
          onClose={() => setClearOpen(false)}
          onExport={() => void exportApiLedger()}
          onWordChange={(word) => {
            setClearWord(word)
            setClearError(null)
          }}
          onConfirm={() => void confirmClearLedger()}
        />
      )}
    </div>
  )
}
