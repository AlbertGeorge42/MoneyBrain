import { ChevronRight } from 'lucide-react'
import { Button } from '@/features/shared/Button'
import { amountText } from './format'
import type { LedgerAccount, LedgerAccountCategory, OverviewSummary } from './model'
import { CATEGORY_COLORS, stableSlotMap } from '@/features/shared/seriesColor'

/** 没有分组表时按账户性质取色；四个性质即四个稳定身份。 */
const KIND_KEYS = ['cash', 'deposit', 'investment', 'credit'] as const

export function AccountEntry({
  summary,
  accounts,
  categories,
  onOpen,
}: {
  summary: OverviewSummary
  accounts: LedgerAccount[]
  /** 一级账户分组；有分组表时圆点跟分组 id 走，同类账户同色。 */
  categories?: readonly LedgerAccountCategory[]
  onOpen: () => void
}) {
  const visibleAccounts = accounts.slice(0, 3)
  const knownGroups = new Set((categories ?? []).map((category) => category.id))
  // 槽位按完整分组集合计算，不看账户顺序或可见子集；未分组账户共用一个身份。
  const groupKeys = categories
    ? [...categories.map((category) => `group:${category.id}`), 'group:__ungrouped']
    : KIND_KEYS.map((kind) => `kind:${kind}`)
  const slots = stableSlotMap(groupKeys, CATEGORY_COLORS.length)
  const keyOf = (account: LedgerAccount) =>
    categories
      ? account.categoryId && knownGroups.has(account.categoryId)
        ? `group:${account.categoryId}`
        : 'group:__ungrouped'
      : `kind:${account.kind}`
  return (
    <Button
      className="mb-ov-entry"
      aria-label="账户与余额"
      onClick={onOpen}
    >
      <span className="mb-ov-ledger" aria-hidden="true">
        账
      </span>
      <span className="mb-ov-copy">
        <span className="mb-ov-account-title">账户与余额</span>
        <span className="mb-ov-account-meta">
          {accounts.length} 个账户 · 现金等价 {amountText(summary.liquidAssets)} · 投资{' '}
          {amountText(summary.investmentAssets)}
        </span>
      </span>
      <span className="mb-ov-stack" aria-hidden="true">
        {visibleAccounts.map((account) => (
          <span
            key={account.id}
            className={`mb-ov-dot mb-tone-cat-${(slots.get(keyOf(account)) ?? 0) + 1}`}
          >
            {account.name.slice(0, 1)}
          </span>
        ))}
      </span>
      <ChevronRight className="mb-ov-chevron" size={18} aria-hidden="true" />
    </Button>
  )
}
