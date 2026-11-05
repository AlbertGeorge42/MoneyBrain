/**
 * 报表页（HF 批次 3）
 *
 * 四视图共用一条时间条与一套指标条：资产负债看时点，收支 / 现金流 / 投资看期间。
 * PC 双列表格、移动卡片行；结构以 concept-design 的报表章节为准，视觉只用 design-tokens。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FolderInput, ScanLine } from 'lucide-react'
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
  cashRowsFor,
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
  clampAsOfPoint,
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

interface ToastState {
  message: string
}

interface DrillState {
  node: FlowTreeNode
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
    </section>
  )
}

function chartGrid(device: DeviceMode, charts: ReactNode) {
  if (device === 'mobile') return <div className="mb-rp-chart-scroll">{charts}</div>
  return <div className="mb-rp-chart-grid">{charts}</div>
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
  onViewFlow: (options: {
    categoryId?: string
    categoryIds?: string[]
    from: string
    to: string
  }) => void
}) {
  const { ledger } = useLedger()
  const [tab, setTab] = useState<ReportTab>('balance')
  const [time, setTime] = useState<ReportTime>({
    gran: 'month',
    point: TODAY,
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

  // 时点不超过数据截止日：月末/年末锚点在本月会被截到 asOf，避免出现 10-31 晚于 10-28。
  const balancePoint = clampAsOfPoint(time.point, TODAY)
  const balance = useMemo(
    () => deriveBalanceReport(ledger, balancePoint),
    [ledger, balancePoint],
  )
  const flow = useMemo(
    () => deriveFlowReport(ledger, time.from, time.to, time.gran),
    [ledger, time.from, time.to, time.gran],
  )
  const cash = useMemo(() => deriveCashReport(ledger, time.from, time.to), [ledger, time.from, time.to])
  const invest = useMemo(() => deriveInvestmentReport(ledger), [ledger])
  const drillData = useMemo<DrillData | null>(
    () => (drill ? buildDrill(ledger, drill.node, drill.kind, time.from, time.to) : null),
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
              side={flowSide}
              onSide={setFlowSide}
              folded={foldedFlow}
              onFold={toggleFlowFold}
              onDrill={(node, kind) => setDrill({ node, kind })}
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
          {tab === 'invest' && <InvestView device={device} report={invest} />}
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
          onViewFlow(
            drill.node.id === 'rest'
              ? { categoryIds: drill.node.mergedIds, from: time.from, to: time.to }
              : { categoryId: drill.node.id, from: time.from, to: time.to },
          )
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
              </div>
              <button type="button" className="mb-rp-btn is-ghost" onClick={() => notify(`${item.label}配置将在设置批次接入`)}>
                配置
              </button>
            </div>
          ))}
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
    <ChartCard title="资产构成">
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
      desc="近 12 个月"
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
            ariaLabel="资产明细"
            columns={[{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]}
            rows={assetRows}
            minRows={balanceMinRows}
            total={['合计', '', currency(report.assetTotal)]}
          />
          <ReportTable
            device={device}
            title="负债与权益"
            ariaLabel="负债与权益明细"
            columns={[{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]}
            rows={liabilityRows}
            minRows={balanceMinRows}
            total={['合计', '', currency(report.equityTotal)]}
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
            />
          ) : (
            <ReportCardList
              device={device}
              title="负债与权益"
              desc={`负债 ${currency(report.liabilityTotal)} · 权益 ${currency(report.equity)}`}
              rows={liabilityCards}
              total={{ label: '合计', value: currency(report.equityTotal) }}
            />
          )}
        </>
      )}
    </>
  )
}

function FlowView({
  device,
  report,
  side,
  onSide,
  folded,
  onFold,
  onDrill,
}: {
  device: DeviceMode
  report: FlowReport
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
            series={report.series}
            ariaLabel="本期收支走势"
          />
          <CompositionBars
            incomeTrees={report.incomeTrees}
            expenseTrees={report.expenseTrees}
            incomeTotal={report.income}
            expenseTotal={report.expense}
            onOpen={onDrill}
          />
        </>,
      )}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="收入构成"
            desc={`合计 ${currency(report.income)}`}
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
          />
          <ReportTable
            device={device}
            title="支出构成"
            desc={`合计 ${currency(report.expense)}`}
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
            desc={`合计 ${currency(side === 'expense' ? report.expense : report.income)}`}
            rows={side === 'expense' ? expenseCards : incomeCards}
            total={{
              label: '合计',
              value: currency(side === 'expense' ? report.expense : report.income),
            }}
          />
        </>
      )}
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
  // 左右两表共用一份 folded：键必须带方向前缀，否则同名分组（经营 / 投资 / 筹资）会串扰
  const foldKey = (id: string) => `${side}:${id}`
  const cards: CardRow[] = []
  for (const group of groups) {
    const key = foldKey(group.key)
    const expanded = folded[key] !== false
    cards.push({
      id: key,
      label: group.name,
      meta: `${group.count} 笔`,
      amount: currency(group.total),
      tone: side === 'in' ? 'income' : 'expense',
      fold: group.children.length > 0 ? { expanded, onToggle: () => onFold(key) } : undefined,
    })
    if (expanded) {
      for (const child of group.children) {
        cards.push({
          id: foldKey(child.id),
          level: 1,
          label: child.label,
          meta: child.account,
          amount: currency(child.amount),
          tone: side === 'in' ? 'income' : 'expense',
        })
      }
    }
  }

  const inflowRows = cashRowsFor('in', report.inflowGroups, folded, onFold)
  const outflowRows = cashRowsFor('out', report.outflowGroups, folded, onFold)
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
            desc={`合计 ${currency(report.inflowTotal)}`}
            ariaLabel="现金流入"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={inflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(report.inflowTotal)]}
          />
          <ReportTable
            device={device}
            title="流出"
            desc={`合计 ${currency(report.outflowTotal)}`}
            ariaLabel="现金流出"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={outflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(report.outflowTotal)]}
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
          />
        </>
      )}
    </>
  )
}

function InvestView({ device, report }: { device: DeviceMode; report: InvestmentReport }) {
  const [folded, setFolded] = useState<Record<string, boolean>>({})

  const rows: ReportRow[] = []
  for (const group of report.holdings) {
    const expanded = folded[group.id] !== false
    rows.push({
      id: group.id,
      cells: [
        group.name,
        currency(group.marketValue),
        currency(group.cost),
        signedCurrency(group.gain),
        formatPercent(group.rate, 2),
      ],
      fold: group.children.length > 0
        ? {
            expanded,
            onToggle: () =>
              setFolded((current) => ({ ...current, [group.id]: current[group.id] === false })),
          }
        : undefined,
      tone: group.gain >= 0 ? 'income' : 'expense',
    })
    if (expanded) {
      for (const child of group.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: [
            child.name,
            currency(child.marketValue),
            currency(child.cost),
            signedCurrency(child.gain),
            formatPercent(child.rate, 2),
          ],
          tone: child.gain >= 0 ? 'income' : 'expense',
        })
      }
    }
  }

  const totalRate = report.costTotal === 0 ? 0 : (report.gainTotal / report.costTotal) * 100

  const trendChart = (
    <ReportLineChart
      device={device}
      title="净值走势"
      points={report.trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="投资净值走势"
    />
  )
  const allocationChart = (
    <ChartCard title="资产分布">
      <AllocationBars rows={report.allocation} />
    </ChartCard>
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(device, <>{trendChart}{allocationChart}</>)}
      <ReportTable
        device={device}
        title="持仓明细"
        desc={`总市值 ${currency(report.total)} · 成本 ${currency(report.costTotal)}`}
        ariaLabel="投资持仓明细"
        variant="c5"
        scrollable
        columns={[
          { label: '持仓' },
          { label: '市值', align: 'num' },
          { label: '成本', align: 'num' },
          { label: '收益', align: 'num' },
          { label: '收益率', align: 'num' },
        ]}
        rows={rows}
        total={[
          '合计',
          currency(report.total),
          currency(report.costTotal),
          signedCurrency(report.gainTotal),
          formatPercent(totalRate, 2),
        ]}
      />
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
