/**
 * 报表页（HF 批次 3）
 *
 * 四视图共用一条时间条与一套指标条：资产负债看时点，收支 / 现金流 / 投资看期间。
 * PC 双列表格、移动卡片行；结构以 concept-design 的报表章节为准，视觉只用 design-tokens。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FolderInput, Info, ScanLine } from 'lucide-react'
import { Drawer } from '@mantine/core'
import { useLedger } from '@/features/overview/ledgerStore'
import { TODAY } from '@/features/overview/model'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { formatPercent } from '@/utils/format'
import {
  AllocationBars,
  CashFlowBars,
  ChartCard,
  CompositionBars,
  ReportBarChart,
  ReportLineChart,
} from './charts'
import { MetricStrip, ReportCardList, ReportTable, type CardRow, type ReportRow } from './ReportTable'
import {
  buildDrill,
  currency,
  deriveBalanceReport,
  deriveCashReport,
  deriveFlowReport,
  deriveInvestmentReport,
  signedCurrency,
  type BalanceReport,
  type CashReport,
  type DrillData,
  type FlowTreeNode,
  type FlowReport,
  type InvestmentReport,
} from './reportsModel'
import {
  formatRangeLabel,
  monthEnd,
  monthStart,
  type ReportTab,
  type ReportTime,
} from './reportsTime'
import { TimeBar } from './TimeBar'
import './reports.css'

const TABS: readonly { id: ReportTab; label: string }[] = [
  { id: 'balance', label: '资产负债' },
  { id: 'flow', label: '收支明细' },
  { id: 'cash', label: '现金流' },
  { id: 'invest', label: '投资分析' },
]

const SETTINGS_COPY: Record<ReportTab, string> = {
  balance: '账户性质与负债口径',
  flow: '分类归并、退款与调整的收支口径',
  cash: '现金流分组映射（经营 / 投资 / 筹资）',
  invest: '投资账户与资产类别映射',
}

interface ToastState {
  message: string
}

interface DrillState {
  rootId: string
  kind: 'income' | 'expense'
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="mb-rp-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? 'mb-rp-seg-btn is-active' : 'mb-rp-seg-btn'}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PageHead({
  device,
  tab,
  onTab,
}: {
  device: DeviceMode
  tab: ReportTab
  onTab: (next: ReportTab) => void
}) {
  if (device === 'mobile') {
    return (
      <div className="mb-rp-mobile-head">
        <p className="mb-rp-page-meta">余额看时点 · 发生额看期间 · 数据截至 {TODAY.slice(5)}</p>
        <div className="mb-rp-tabs is-mobile" role="tablist" aria-label="报表视图">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tab}
              className={item.id === tab ? 'mb-rp-tab is-active' : 'mb-rp-tab'}
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-rp-page-head">
      <div className="mb-rp-page-copy">
        <h1 className="mb-rp-page-title">报表</h1>
        <p className="mb-rp-page-desc">余额看时点，发生额看期间；下钻只看当期口径。</p>
      </div>
      <div className="mb-rp-tabs" role="tablist" aria-label="报表视图">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === tab}
            className={item.id === tab ? 'mb-rp-tab is-active' : 'mb-rp-tab'}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ReportsEmpty({ onImport }: { onImport: () => void }) {
  return (
    <section className="mb-rp-card mb-rp-empty">
      <div className="mb-rp-empty-mark" aria-hidden="true">
        <ScanLine size={28} strokeWidth={1.8} />
      </div>
      <h2 className="mb-rp-empty-title">还没有可分析的流水</h2>
      <p className="mb-rp-empty-desc">
        报表从账本里取数：先记一笔收支，或导入银行 / 支付宝账单，四张报表会自动生成。
      </p>
      <button type="button" className="mb-rp-btn is-primary" onClick={onImport}>
        <FolderInput size={16} />
        导入账单
      </button>
      <p className="mb-rp-empty-note">数据只留在本机；报表不会写回账本。</p>
    </section>
  )
}

function chartGrid(device: DeviceMode, charts: ReactNode) {
  if (device === 'mobile') return <div className="mb-rp-chart-scroll">{charts}</div>
  return <div className="mb-rp-chart-grid">{charts}</div>
}

function signedPercent(value: number): string {
  return formatPercent(value, 1)
}

function flattenFlowRows(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  onOpen: (node: FlowTreeNode) => void,
): ReportRow[] {
  const rows: ReportRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      cells: [
        node.name,
        `${node.count} 笔`,
        currency(node.amount),
        formatPercent(node.share, 1, false),
      ],
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: [child.name, `${child.count} 笔`, currency(child.amount), formatPercent(child.share, 1, false)],
          onOpen: () => onOpen(child),
        })
      }
    }
  }
  return rows
}

export function ReportsPage({
  device,
  dataState,
  settingsOpen,
  onSettingsToggle,
  onRetry,
  onImport,
  onViewFlow,
}: {
  device: DeviceMode
  dataState: DataState
  settingsOpen: boolean
  onSettingsToggle: () => void
  onRetry: () => void
  onImport: () => void
  onViewFlow: (categoryId: string) => void
}) {
  const { ledger } = useLedger()
  const [tab, setTab] = useState<ReportTab>('balance')
  const [time, setTime] = useState<ReportTime>({
    gran: 'month',
    point: monthEnd(TODAY),
    from: monthStart(TODAY),
    to: TODAY,
    preset: 'thisMonth',
  })
  const [toast, setToast] = useState<ToastState | null>(null)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [foldedFlow, setFoldedFlow] = useState<Record<string, boolean>>({})
  const [foldedCash, setFoldedCash] = useState<Record<string, boolean>>({})
  const [flowSide, setFlowSide] = useState<'income' | 'expense'>('expense')
  const [cashSide, setCashSide] = useState<'in' | 'out'>('in')
  const [balanceSide, setBalanceSide] = useState<'assets' | 'liabilities'>('assets')
  const [investPane, setInvestPane] = useState<'allocation' | 'period' | 'accounts' | 'snapshots'>('allocation')

  const balance = useMemo(() => deriveBalanceReport(ledger, time.point), [ledger, time.point])
  const flow = useMemo(
    () => deriveFlowReport(ledger, time.from, time.to, time.gran),
    [ledger, time.from, time.to, time.gran],
  )
  const cash = useMemo(() => deriveCashReport(ledger, time.from, time.to), [ledger, time.from, time.to])
  const invest = useMemo(() => deriveInvestmentReport(ledger), [ledger])
  const drillData = useMemo<DrillData | null>(
    () => (drill ? buildDrill(ledger, drill.rootId, drill.kind, time.from, time.to) : null),
    [drill, ledger, time.from, time.to],
  )

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setDrill(null)
    setFoldedFlow({})
    setFoldedCash({})
  }, [tab, time.from, time.to, time.point])

  const notify = (message: string) => setToast({ message })
  const toggleFlowFold = (id: string) =>
    setFoldedFlow((current) => ({ ...current, [id]: current[id] === false }))
  const toggleCashFold = (id: string) =>
    setFoldedCash((current) => ({ ...current, [id]: current[id] === false }))

  const pageState =
    dataState === 'loading' ? (
      <LoadingSkeleton device={device} variant="reports" />
    ) : dataState === 'error' ? (
      <ErrorPanel onRetry={onRetry} />
    ) : dataState === 'empty' ? (
      <ReportsEmpty onImport={onImport} />
    ) : null

  const content = (
    <>
      <PageHead device={device} tab={tab} onTab={(next) => setTab(next)} />
      {pageState ?? (
        <>
          <TimeBar
            device={device}
            tab={tab}
            time={time}
            onChange={setTime}
            onToast={notify}
            onOpenSettings={onSettingsToggle}
          />
          {tab === 'balance' && (
            <BalanceView device={device} report={balance} side={balanceSide} onSide={setBalanceSide} />
          )}
          {tab === 'flow' && (
            <FlowView
              device={device}
              report={flow}
              time={time}
              side={flowSide}
              onSide={setFlowSide}
              folded={foldedFlow}
              onFold={toggleFlowFold}
              onDrill={(node, kind) => setDrill({ rootId: node.id, kind })}
            />
          )}
          {tab === 'cash' && (
            <CashView
              device={device}
              report={cash}
              side={cashSide}
              onSide={setCashSide}
              folded={foldedCash}
              onFold={toggleCashFold}
            />
          )}
          {tab === 'invest' && (
            <InvestView device={device} report={invest} pane={investPane} onPane={setInvestPane} />
          )}
        </>
      )}
    </>
  )

  return (
    <div className="mb-rp-page" data-device={device}>
      {content}

      <DrillDrawer
        device={device}
        data={drillData}
        onClose={() => setDrill(null)}
        onViewFlow={() => {
          if (!drill) return
          notify('已切到流水页；分类筛选联动随流水筛选入口一起接入')
          onViewFlow(drill.rootId)
          setDrill(null)
        }}
      />

      <Drawer
        opened={settingsOpen}
        onClose={onSettingsToggle}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? 'auto' : 420}
        withinPortal={false}
        title="报表设置"
        classNames={{
          content: 'mb-rp-sheet',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        <div className="mb-rp-settings">
          {TABS.map((item) => (
            <div className="mb-rp-settings-row" key={item.id}>
              <div>
                <p className="mb-rp-settings-title">{item.label}</p>
                <p className="mb-rp-settings-desc">{SETTINGS_COPY[item.id]}</p>
              </div>
              <button type="button" className="mb-rp-btn is-ghost" onClick={() => notify(`${item.label}配置将在设置批次接入`)}>
                配置
              </button>
            </div>
          ))}
          <p className="mb-rp-settings-note">
            报表设置只影响展示口径，不改写账本。账户映射与分类归并的完整面板随设置页交付。
          </p>
        </div>
      </Drawer>

      {toast && (
        <div className="mb-rp-toast" role="status">
          {toast.message}
        </div>
      )}
    </div>
  )
}

function BalanceView({
  device,
  report,
  side,
  onSide,
}: {
  device: DeviceMode
  report: BalanceReport
  side: 'assets' | 'liabilities'
  onSide: (next: 'assets' | 'liabilities') => void
}) {
  const assetRows: ReportRow[] = report.assets.map((row) => ({
    id: row.id,
    cells: [row.name, row.kind, currency(row.amount)],
  }))
  const liabilityRows: ReportRow[] = [
    ...report.liabilities.map((row) => ({
      id: row.id,
      cells: [row.name, row.kind, currency(row.amount)],
    })),
    { id: 'equity', cells: ['所有者权益', '净资产', currency(report.equity)], tone: 'income' as const },
  ]

  const balanceMinRows = Math.max(assetRows.length, liabilityRows.length)

  const assetCards: CardRow[] = report.assets.map((row) => ({
    id: row.id,
    label: row.name,
    meta: row.kind,
    amount: currency(row.amount),
    barTone: 'accent',
    share: report.assetTotal === 0 ? 0 : (row.amount / report.assetTotal) * 100,
  }))
  const liabilityCards: CardRow[] = [
    ...report.liabilities.map((row) => ({
      id: row.id,
      label: row.name,
      meta: row.kind,
      amount: currency(row.amount),
      tone: 'expense' as const,
      barTone: 'expense' as const,
      share: report.equityTotal === 0 ? 0 : (row.amount / report.equityTotal) * 100,
    })),
    {
      id: 'equity',
      label: '所有者权益',
      meta: '净资产',
      amount: currency(report.equity),
      tone: 'income' as const,
      barTone: 'income' as const,
      share: report.equityTotal === 0 ? 0 : (report.equity / report.equityTotal) * 100,
    },
  ]

  const composition = (
    <ChartCard title="资产构成" desc="按账户性质 · 占比相对总资产">
      {report.composition.length === 0 ? (
        <p className="mb-rp-empty-line">暂无资产账户</p>
      ) : (
        <div className="mb-rp-compare-side">
          {report.composition.map((row, index) => (
            <div className="mb-rp-compare-row" key={row.id}>
              <div className="mb-rp-compare-row-head">
                <span className="mb-rp-compare-name">{row.name}</span>
                <span className="mb-rp-compare-amount">
                  {currency(row.amount)} · {formatPercent(row.share, 1, false)}
                </span>
              </div>
              <progress
                className={`mb-rp-progress is-accent is-cat-${(index % 6) + 1}`}
                value={row.share}
                max={100}
                aria-label={`${row.name}占总资产 ${row.share.toFixed(1)}%`}
              />
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  )

  const trend = (
    <ReportLineChart
      device={device}
      title="净值走势"
      desc="近 12 个月 · 末点随当前净资产"
      points={report.trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="净资产月度走势"
    />
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(device, <>{composition}{trend}</>)}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="资产"
            desc="按当前余额快照"
            ariaLabel="资产明细"
            columns={[{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]}
            rows={assetRows}
            minRows={balanceMinRows}
            total={['合计', '', currency(report.assetTotal)]}
            note="金额为当前账户余额；信用卡等负余额计入负债。"
          />
          <ReportTable
            device={device}
            title="负债与权益"
            desc="资产 = 负债 + 所有者权益"
            ariaLabel="负债与权益明细"
            columns={[{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]}
            rows={liabilityRows}
            minRows={balanceMinRows}
            total={['合计', '', currency(report.equityTotal)]}
            note={`恒等式校验：${currency(report.assetTotal)} = ${currency(report.liabilityTotal)} + ${currency(report.equity)}`}
          />
        </div>
      ) : (
        <>
          <Segmented
            label="资产负债分段"
            value={side}
            options={[
              { id: 'assets', label: '资产' },
              { id: 'liabilities', label: '负债与权益' },
            ]}
            onChange={onSide}
          />
          {side === 'assets' ? (
            <ReportCardList
              device={device}
              title="资产"
              desc={`总资产 ${currency(report.assetTotal)}`}
              rows={assetCards}
              total={{ label: '合计', value: currency(report.assetTotal) }}
              note="金额为当前账户余额；信用卡等负余额计入负债。"
            />
          ) : (
            <ReportCardList
              device={device}
              title="负债与权益"
              desc={`负债 ${currency(report.liabilityTotal)} · 权益 ${currency(report.equity)}`}
              rows={liabilityCards}
              total={{ label: '合计', value: currency(report.equityTotal) }}
              note={`资产 = 负债 + 所有者权益（${currency(report.assetTotal)}）`}
            />
          )}
        </>
      )}
      <p className="mb-rp-footnote">
        <Info size={13} /> 余额按当前账户快照回放到 {report.point}；历史余额由交易逆推，不写回账本。
      </p>
    </>
  )
}

function FlowView({
  device,
  report,
  time,
  side,
  onSide,
  folded,
  onFold,
  onDrill,
}: {
  device: DeviceMode
  report: FlowReport
  time: ReportTime
  side: 'income' | 'expense'
  onSide: (next: 'income' | 'expense') => void
  folded: Record<string, boolean>
  onFold: (id: string) => void
  onDrill: (node: FlowTreeNode, kind: 'income' | 'expense') => void
}) {
  const incomeRows = flattenFlowRows(report.incomeTrees, folded, onFold, (node) =>
    onDrill(node, 'income'),
  )
  const expenseRows = flattenFlowRows(report.expenseTrees, folded, onFold, (node) => onDrill(node, 'expense'))
  const incomeCards: CardRow[] = flattenCards(report.incomeTrees, folded, onFold, 'income', (node) =>
    onDrill(node, 'income'),
  )
  const expenseCards: CardRow[] = flattenCards(report.expenseTrees, folded, onFold, 'expense', (node) =>
    onDrill(node, 'expense'),
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(
        device,
        <>
          <ReportBarChart
            device={device}
            title="收支走势"
            desc={`按${time.gran === 'day' ? '日' : time.gran === 'month' ? '月' : '年'}聚合 · 收支分柱`}
            series={report.series}
            ariaLabel="本期收支走势"
          />
          <CompositionBars
            incomeTrees={report.incomeTrees}
            expenseTrees={report.expenseTrees}
            incomeTotal={report.income}
            expenseTotal={report.expense}
          />
        </>,
      )}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="收入构成"
            desc={`合计 ${currency(report.income)} · 含退款`}
            ariaLabel="收入构成"
            variant="c4"
            columns={[
              { label: '分类' },
              { label: '笔数' },
              { label: '金额', align: 'num' },
              { label: '占比', align: 'num' },
            ]}
            rows={incomeRows}
            minRows={Math.max(incomeRows.length, expenseRows.length)}
            total={['合计', '', currency(report.income), '100.0%']}
            note="点击一级分类可下钻；子分类金额已计入父级，占比相对合计。"
          />
          <ReportTable
            device={device}
            title="支出构成"
            desc={`合计 ${currency(report.expense)} · 含负向调整`}
            ariaLabel="支出构成"
            variant="c4"
            columns={[
              { label: '分类' },
              { label: '笔数' },
              { label: '金额', align: 'num' },
              { label: '占比', align: 'num' },
            ]}
            rows={expenseRows}
            minRows={Math.max(incomeRows.length, expenseRows.length)}
            total={['合计', '', currency(report.expense), '100.0%']}
            note="点击一级分类可下钻；子分类金额已计入父级，占比相对合计。"
          />
        </div>
      ) : (
        <>
          <Segmented
            label="收支分段"
            value={side}
            options={[
              { id: 'expense', label: '支出' },
              { id: 'income', label: '收入' },
            ]}
            onChange={onSide}
          />
          <ReportCardList
            device={device}
            title={side === 'expense' ? '支出构成' : '收入构成'}
            desc={side === 'expense' ? `合计 ${currency(report.expense)} · 含负向调整` : `合计 ${currency(report.income)} · 含退款`}
            rows={side === 'expense' ? expenseCards : incomeCards}
            total={{
              label: '合计',
              value: currency(side === 'expense' ? report.expense : report.income),
            }}
            note="点击一级分类可下钻；子分类金额已计入父级，占比相对合计。"
          />
        </>
      )}
      <p className="mb-rp-footnote">
        <Info size={13} /> 期间 {formatRangeLabel(time)}；转账不计入收支，退款冲减收入口径。
      </p>
    </>
  )
}

function flattenCards(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  tone: 'income' | 'expense',
  onOpen: (node: FlowTreeNode) => void,
): CardRow[] {
  const rows: CardRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      label: node.name,
      meta: `${node.count} 笔 · ${formatPercent(node.share, 1, false)}`,
      amount: `${tone === 'income' ? '+' : '−'}${currency(node.amount)}`,
      tone,
      share: node.share,
      barTone: tone,
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          label: child.name,
          meta: `${child.count} 笔 · ${formatPercent(child.share, 1, false)}`,
          amount: `${tone === 'income' ? '+' : '−'}${currency(child.amount)}`,
          tone,
          share: child.share,
          barTone: tone,
        })
      }
    }
  }
  return rows
}

function CashView({
  device,
  report,
  side,
  onSide,
  folded,
  onFold,
}: {
  device: DeviceMode
  report: CashReport
  side: 'in' | 'out'
  onSide: (next: 'in' | 'out') => void
  folded: Record<string, boolean>
  onFold: (id: string) => void
}) {
  const groups = side === 'in' ? report.inflowGroups : report.outflowGroups
  const cards: CardRow[] = []
  for (const group of groups) {
    const expanded = folded[group.key] !== false
    cards.push({
      id: group.key,
      label: group.name,
      meta: `${group.count} 笔`,
      amount: currency(group.total),
      tone: side === 'in' ? 'income' : 'expense',
      fold: group.children.length > 0 ? { expanded, onToggle: () => onFold(group.key) } : undefined,
    })
    if (expanded) {
      for (const child of group.children) {
        cards.push({
          id: child.id,
          level: 1,
          label: child.label,
          meta: child.account,
          amount: currency(child.amount),
          tone: side === 'in' ? 'income' : 'expense',
        })
      }
    }
  }

  const inflowRows = rowsFor(report.inflowGroups, folded, onFold)
  const outflowRows = rowsFor(report.outflowGroups, folded, onFold)
  const cashMinRows = Math.max(inflowRows.length, outflowRows.length)

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} flat />
      <CashFlowBars
        inflowGroups={report.inflowGroups}
        outflowGroups={report.outflowGroups}
        inflowTotal={report.inflowTotal}
        outflowTotal={report.outflowTotal}
      />
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="流入"
            desc={`合计 ${currency(report.inflowTotal)} · 收入 + 退款`}
            ariaLabel="现金流入"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={inflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(report.inflowTotal)]}
            note="经营 = 工资 / 红包 / 退款 − 日常支出；投资 = 理财收益；账户间转账单列。"
          />
          <ReportTable
            device={device}
            title="流出"
            desc={`合计 ${currency(report.outflowTotal)} · 支出 + 转账`}
            ariaLabel="现金流出"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={outflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(report.outflowTotal)]}
            note="转账只影响账户间分布，不计入经营 / 投资 / 筹资净额。"
          />
        </div>
      ) : (
        <>
          <Segmented
            label="现金流分段"
            value={side}
            options={[
              { id: 'in', label: '流入' },
              { id: 'out', label: '流出' },
            ]}
            onChange={onSide}
          />
          <ReportCardList
            device={device}
            title={side === 'in' ? '流入' : '流出'}
            desc={side === 'in' ? `合计 ${currency(report.inflowTotal)}` : `合计 ${currency(report.outflowTotal)}`}
            rows={cards}
            total={{ label: '合计', value: currency(side === 'in' ? report.inflowTotal : report.outflowTotal) }}
            note="转账单列；现金流净额只统计经营 / 投资 / 筹资。"
          />
        </>
      )}
      <p className="mb-rp-footnote">
        <Info size={13} /> 期末现金总量取当前现金等价账户余额；本期净额 = 流入 − 流出。
      </p>
    </>
  )
}

function rowsFor(
  groups: CashReport['inflowGroups'],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
): ReportRow[] {
  const rows: ReportRow[] = []
  for (const group of groups) {
    const expanded = folded[group.key] !== false
    rows.push({
      id: group.key,
      cells: [group.name, `${group.count} 笔`, currency(group.total)],
      fold: group.children.length > 0 ? { expanded, onToggle: () => onFold(group.key) } : undefined,
    })
    if (expanded) {
      for (const child of group.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: [child.label, child.account, currency(child.amount)],
          tone: child.tone,
        })
      }
    }
  }
  return rows
}

function InvestView({
  device,
  report,
  pane,
  onPane,
}: {
  device: DeviceMode
  report: InvestmentReport
  pane: 'allocation' | 'period' | 'accounts' | 'snapshots'
  onPane: (next: 'allocation' | 'period' | 'accounts' | 'snapshots') => void
}) {
  const allocationRows: ReportRow[] = report.allocation.map((row) => ({
    id: row.id,
    cells: [
      row.name,
      currency(row.current),
      formatPercent(row.ratio, 1, false),
      formatPercent(row.target, 1, false),
      signedPercent(row.deviation),
      signedCurrency(row.rebalance),
    ],
  }))
  const accountRows: ReportRow[] = []
  for (const account of report.accountRows) {
    accountRows.push({
      id: account.id,
      cells: [account.name, currency(account.total), '100.0%'],
    })
    for (const child of account.children) {
      accountRows.push({
        id: child.id,
        level: 1,
        cells: [child.name, currency(child.amount), formatPercent(child.share, 1, false)],
      })
    }
  }
  const snapshotRows: ReportRow[] = report.snapshots.map((snapshot) => ({
    id: snapshot.date,
    cells: [
      snapshot.date,
      currency(snapshot.total),
      snapshot.periodReturn === null ? '—' : formatPercent(snapshot.periodReturn, 2),
      signedCurrency(snapshot.net),
    ],
  }))
  const periodRows: ReportRow[] = report.periodRows.map((row) => ({
    id: row.label,
    cells: [row.label, row.value],
  }))

  const allocationTable = (
    <ReportTable
      device={device}
      title="资产分布"
      desc={`总市值 ${currency(report.total)} · 当前 / 目标`}
      ariaLabel="投资资产分布"
      variant="c6"
      columns={[
        { label: '资产类别' },
        { label: '市值', align: 'num' },
        { label: '当前', align: 'num' },
        { label: '目标', align: 'num' },
        { label: '偏差', align: 'num' },
        { label: '再平衡', align: 'num' },
      ]}
      rows={allocationRows}
      total={['合计', currency(report.total), '100.0%', '100.0%', '0.0%', '—']}
      note="目标比例为演示口径；再平衡 = 目标市值 − 当前市值。"
    />
  )
  const periodTable = (
    <ReportTable
      device={device}
      title="期间投入与指标"
      desc="累计收益已扣除期间净投入"
      ariaLabel="投资期间指标"
      variant="c2"
      columns={[{ label: '指标' }, { label: '数值', align: 'num' }]}
      rows={periodRows}
      note="XIRR / TWR 由快照链与净投入推算；快照缺失时显示「—」。"
    />
  )
  const accountTable = (
    <ReportTable
      device={device}
      title="投资账户明细"
      desc="按账户市值拆分资产类别"
      ariaLabel="投资账户明细"
      columns={[{ label: '账户 / 类别' }, { label: '市值', align: 'num' }, { label: '占比', align: 'num' }]}
      rows={accountRows}
      total={['合计', currency(report.total), '100.0%']}
      note="类别金额按当前市值比例估算，不写回账本。"
    />
  )
  const snapshotTable = (
    <ReportTable
      device={device}
      title="快照链"
      desc="每期市值 / 期间收益 / 净投入"
      ariaLabel="投资快照链"
      variant="c4"
      columns={[
        { label: '日期' },
        { label: '市值', align: 'num' },
        { label: '期间收益', align: 'num' },
        { label: '净投入', align: 'num' },
      ]}
      rows={snapshotRows}
      note="末点市值跟随投资账户余额；期间收益已剔除净投入。"
    />
  )

  const trendChart = (
    <ReportLineChart
      device={device}
      title="净值走势"
      desc="快照链 · 末点跟随账户余额"
      points={report.trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="投资净值走势"
    />
  )
  const allocationChart = (
    <ChartCard title="资产分布" desc="当前占比 / 目标比例">
      <AllocationBars rows={report.allocation} />
    </ChartCard>
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(device, <>{trendChart}{allocationChart}</>)}
      {device === 'desktop' ? (
        <>
          <div className="mb-rp-cols">
            {allocationTable}
            {periodTable}
          </div>
          <div className="mb-rp-cols">
            {accountTable}
            {snapshotTable}
          </div>
        </>
      ) : (
        <>
          <Segmented
            label="投资分析分段"
            value={pane}
            options={[
              { id: 'allocation', label: '资产分布' },
              { id: 'period', label: '投入指标' },
              { id: 'accounts', label: '账户' },
              { id: 'snapshots', label: '快照' },
            ]}
            onChange={onPane}
          />
          {pane === 'allocation' && (
            <ReportCardList
              device={device}
              title="资产分布"
              desc={`总市值 ${currency(report.total)}`}
              rows={report.allocation.map((row) => ({
                id: row.id,
                label: row.name,
                meta: `目标 ${row.target.toFixed(1)}% · 偏差 ${signedPercent(row.deviation)}`,
                amount: currency(row.current),
                share: row.ratio,
                barTone: 'accent',
              }))}
              total={{ label: '合计', value: currency(report.total) }}
              note="目标比例为演示口径；再平衡 = 目标市值 − 当前市值。"
            />
          )}
          {pane === 'period' && (
            <ReportCardList
              device={device}
              title="期间投入与指标"
              desc="累计收益已扣除期间净投入"
              rows={report.periodRows.map((row) => ({
                id: row.label,
                label: row.label,
                amount: row.value,
              }))}
              note="XIRR / TWR 由快照链与净投入推算；快照缺失时显示「—」。"
            />
          )}
          {pane === 'accounts' && (
            <ReportCardList
              device={device}
              title="投资账户明细"
              desc="按账户市值拆分资产类别"
              rows={report.accountRows.flatMap((account) => [
                {
                  id: account.id,
                  label: account.name,
                  meta: '账户',
                  amount: currency(account.total),
                },
                ...account.children.map((child) => ({
                  id: child.id,
                  level: 1 as const,
                  label: child.name,
                  meta: `${child.share.toFixed(1)}%`,
                  amount: currency(child.amount),
                })),
              ])}
              total={{ label: '合计', value: currency(report.total) }}
              note="类别金额按当前市值比例估算，不写回账本。"
            />
          )}
          {pane === 'snapshots' && (
            <ReportCardList
              device={device}
              title="快照链"
              desc="每期市值 / 期间收益 / 净投入"
              rows={report.snapshots.map((snapshot) => ({
                id: snapshot.date,
                label: snapshot.date,
                meta: `净投入 ${signedCurrency(snapshot.net)}`,
                amount:
                  snapshot.periodReturn === null
                    ? currency(snapshot.total)
                    : `${currency(snapshot.total)} · ${formatPercent(snapshot.periodReturn, 2)}`,
              }))}
              note="末点市值跟随投资账户余额；期间收益已剔除净投入。"
            />
          )}
        </>
      )}
      <p className="mb-rp-footnote">
        <Info size={13} /> 投资报表复用快照链；无快照的账户只显示市值，收益率留空。
      </p>
    </>
  )
}

function DrillDrawer({
  device,
  data,
  onClose,
  onViewFlow,
}: {
  device: DeviceMode
  data: DrillData | null
  onClose: () => void
  onViewFlow: () => void
}) {
  return (
    <Drawer
      opened={Boolean(data)}
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 420}
      withinPortal={false}
      title={data ? `${data.title} · 下钻` : '下钻'}
      classNames={{
        content: 'mb-rp-sheet',
        header: 'mb-rp-sheet-head',
        title: 'mb-rp-sheet-title',
        body: 'mb-rp-sheet-body',
        overlay: 'mb-rp-overlay',
        close: 'mb-rp-sheet-close',
      }}
    >
      {data && (
        <div className="mb-rp-drill">
          <div className="mb-rp-drill-head">
            <span className="mb-rp-drill-label">当期合计</span>
            <span className={`mb-rp-drill-amount is-${data.tone}`}>
              {data.tone === 'income' ? '+' : '−'}
              {currency(data.amount)}
            </span>
          </div>
          <h4 className="mb-rp-drill-title">二级类别</h4>
          {data.children.length === 0 ? (
            <p className="mb-rp-empty-line">该分类没有二级类别</p>
          ) : (
            data.children.map((child) => (
              <div className="mb-rp-drill-row" key={child.id}>
                <span>{child.name}</span>
                <span className="mb-rp-drill-meta">{child.count} 笔</span>
                <span className="mb-rp-drill-value">{currency(child.amount)}</span>
              </div>
            ))
          )}
          <h4 className="mb-rp-drill-title">相关流水</h4>
          {data.transactions.length === 0 ? (
            <p className="mb-rp-empty-line">该期间没有相关流水</p>
          ) : (
            data.transactions.map((transaction) => (
              <div className="mb-rp-drill-row is-tx" key={transaction.id}>
                <div>
                  <span className="mb-rp-drill-tx-label">{transaction.label}</span>
                  <span className="mb-rp-drill-meta">
                    {transaction.date.slice(5)} · {transaction.account}
                  </span>
                </div>
                <span className={`mb-rp-drill-value is-${transaction.tone}`}>
                  {currency(transaction.amount)}
                </span>
              </div>
            ))
          )}
          <p className="mb-rp-drill-note">下钻只展开当期口径；完整筛选与编辑在流水页完成。</p>
          <div className="mb-rp-sheet-actions">
            <button type="button" className="mb-rp-btn is-ghost" onClick={onClose}>
              关闭
            </button>
            <button type="button" className="mb-rp-btn is-primary" onClick={onViewFlow}>
              在流水中查看
            </button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
