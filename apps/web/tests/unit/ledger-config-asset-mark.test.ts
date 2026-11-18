import { describe, expect, it } from 'vitest'
import { assetMarkOf, ASSET_MARK_GROUPS } from '@/features/ledger-config/model'
import type { LedgerAccountCategory } from '@/features/overview/model'

function category(patch: Partial<LedgerAccountCategory> = {}): LedgerAccountCategory {
  return {
    id: 'c1',
    name: '分类',
    type: 'asset',
    parentId: null,
    sort: 0,
    effectiveIsCashEquivalent: false,
    effectiveIsInvestment: false,
    ...patch,
  }
}

describe('一级资产分类的资产标记', () => {
  it('按有效标记派生现金 / 投资 / 其他三组', () => {
    expect(assetMarkOf(category({ effectiveIsCashEquivalent: true }))).toBe('cash')
    expect(assetMarkOf(category({ effectiveIsInvestment: true }))).toBe('investment')
    expect(assetMarkOf(category())).toBe('other')
    // 两者同时为真时投资优先，与 accountKind 的派生顺序一致。
    expect(assetMarkOf(category({ effectiveIsCashEquivalent: true, effectiveIsInvestment: true }))).toBe('investment')
    expect(ASSET_MARK_GROUPS.map((group) => group.id)).toEqual(['cash', 'investment', 'other'])
  })

  it('子分类的有效标记来自继承，不读 raw', () => {
    const child = category({
      parentId: 'root',
      isCashEquivalent: true,
      effectiveIsCashEquivalent: false,
      effectiveIsInvestment: true,
    })
    expect(assetMarkOf(child)).toBe('investment')
  })
})
