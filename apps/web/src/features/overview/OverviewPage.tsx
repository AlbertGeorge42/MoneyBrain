import type { LedgerTransaction } from './model'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { ColdStartGuide, ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import { AccountEntry } from './AccountEntry'
import { BudgetCard } from './BudgetCard'
import { MobileHero, MobileSnapshots, NetWorthHero } from './Hero'
import { NetWorthTrend } from './NetWorthTrend'
import { RecentTransactions } from './RecentTransactions'
import { useLedger } from './ledgerStore'
import {
  CURRENT_MONTH_LABEL,
  deriveBudgets,
  deriveNetWorthTrend,
  deriveOverview,
  groupRecentTransactions,
  TODAY,
} from './model'
import './overview.css'

interface OverviewPageProps {
  device: DeviceMode
  dataState: DataState
  onOpenDetail: (transaction: LedgerTransaction) => void
  onOpenTransactions: () => void
  onOpenBudgets: () => void
  onOpenAccounts: () => void
  onRetry: () => void
  onCreateAccount: () => void
  onImport: () => void
}

function PageHead({ device, dataState }: { device: DeviceMode; dataState: DataState }) {
  const note =
    dataState === 'normal'
      ? `数据截至 ${TODAY.slice(5)}`
      : dataState === 'loading'
        ? '正在读取本地账本'
        : dataState === 'empty'
          ? '尚未开始记账'
          : '本地账本读取失败'
  if (device === 'mobile') {
    return <p className="mb-m-page-meta">{CURRENT_MONTH_LABEL} · {note}</p>
  }
  return (
    <div className="mb-page-head">
      <h1 className="mb-page-title">总览</h1>
      <p className="mb-page-sub">{CURRENT_MONTH_LABEL} · {note}</p>
    </div>
  )
}

export function OverviewPage({
  device,
  dataState,
  onOpenDetail,
  onOpenTransactions,
  onOpenBudgets,
  onOpenAccounts,
  onRetry,
  onCreateAccount,
  onImport,
}: OverviewPageProps) {
  const { ledger } = useLedger()

  if (dataState === 'loading') {
    return (
      <>
        <PageHead device={device} dataState={dataState} />
        <LoadingSkeleton device={device} />
      </>
    )
  }

  if (dataState === 'empty') {
    return (
      <>
        <PageHead device={device} dataState={dataState} />
        <ColdStartGuide variant="overview" onPrimary={onCreateAccount} onImport={onImport} />
      </>
    )
  }

  if (dataState === 'error') {
    return (
      <>
        <PageHead device={device} dataState={dataState} />
        <ErrorPanel onRetry={onRetry} />
      </>
    )
  }

  const summary = deriveOverview(ledger)
  const budget = deriveBudgets(ledger)
  const groups = groupRecentTransactions(ledger.transactions, device === 'mobile' ? 4 : 3)
  const trend = deriveNetWorthTrend(summary.netWorth)

  if (device === 'mobile') {
    return (
      <>
        <PageHead device={device} dataState={dataState} />
        <MobileHero summary={summary} />
        <MobileSnapshots summary={summary} />
        <AccountEntry summary={summary} accounts={ledger.accounts} onOpen={onOpenAccounts} />
        <NetWorthTrend points={trend} />
        <BudgetCard summary={budget} mobile onOpenAll={onOpenBudgets} />
        <RecentTransactions
          device="mobile"
          groups={groups}
          ledger={ledger}
          onOpenDetail={onOpenDetail}
          onOpenAll={onOpenTransactions}
        />
      </>
    )
  }

  return (
    <>
      <PageHead device={device} dataState={dataState} />
      <NetWorthHero summary={summary} />
      <AccountEntry summary={summary} accounts={ledger.accounts} onOpen={onOpenAccounts} />
      <div className="mb-dash-mid">
        <RecentTransactions
          device="desktop"
          groups={groups}
          ledger={ledger}
          onOpenDetail={onOpenDetail}
          onOpenAll={onOpenTransactions}
        />
        <BudgetCard summary={budget} onOpenAll={onOpenBudgets} />
      </div>
      <NetWorthTrend points={trend} />
    </>
  )
}
