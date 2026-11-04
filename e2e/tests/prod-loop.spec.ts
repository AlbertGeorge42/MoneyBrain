import { test, expect } from '@playwright/test'
import {
  clearTestTransactions,
  createTestAccount,
  createTestAccountCategory,
  createTestTransactionCategory,
  listTestAccounts,
  listTestTransactionCategories,
} from '../helpers/test-data'

test.describe.configure({ mode: 'serial' })

test.describe('生产路由：冷启动记账闭环（真实 API）', () => {
  test('清账本 → 记一笔 → 总览/流水/报表都能看到', async ({ page }) => {
    await clearTestTransactions()

    // 保留账户与分类（清交易不删配置）；若空库则补最小配置
    let accounts = await listTestAccounts()
    if (accounts.length === 0) {
      const accountCategoryId = await createTestAccountCategory({ name: '测试账户分类', type: 'asset' })
      if (!accountCategoryId) throw new Error('创建账户分类失败')
      const accountId = await createTestAccount({
        name: '测试账户',
        type: 'asset',
        balance: 0,
        categoryId: accountCategoryId,
      })
      if (!accountId) throw new Error('创建账户失败')
      accounts = await listTestAccounts()
    }

    let categories = await listTestTransactionCategories()
    if (!categories.some((category) => category.type === 'expense')) {
      await createTestTransactionCategory({ name: '测试支出', type: 'expense', icon: 'CoffeeOutlined' })
      categories = await listTestTransactionCategories()
      if (!categories.some((category) => category.type === 'expense')) throw new Error('创建支出分类失败')
    }

    // 1. 冷启动：空账本引导
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '账本还是空的' })).toBeVisible()

    // 2. 记一笔：走生产 EntryOverlay → POST /transactions
    await page.getByRole('button', { name: '记第一笔' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '金额' }).fill('28')
    await dialog.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }).click()
    await dialog.getByRole('textbox', { name: '备注' }).fill('生产冷启动')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toBeHidden()

    // 3. 总览：引导退场，显示记录与净资产
    await expect(page.getByRole('heading', { name: '账本还是空的' })).toHaveCount(0)
    const netWorth = page.getByRole('region', { name: '净资产', exact: true })
    await expect(netWorth).toContainText('¥')
    await expect(netWorth).toContainText('个账户在用')
    const recent = page.getByRole('region', { name: '最近流水', exact: true })
    const overviewRow = recent.getByRole('row').filter({ hasText: '生产冷启动' })
    await expect(overviewRow).toHaveCount(1)
    await expect(overviewRow).toContainText('−¥28.00')
    await expect(recent.getByRole('row').filter({ hasText: '生产冷启动' })).toHaveCount(1)

    // 4. 流水：同一条记录出现在生产流水页
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '流水' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
    await expect(page.getByRole('heading', { name: '流水', exact: true })).toBeVisible()
    const txRow = page.getByRole('row').filter({ hasText: '生产冷启动' })
    await expect(txRow).toHaveCount(1)
    await expect(txRow).toContainText('−¥28.00')

    // 5. 报表：本期收支合计包含这笔
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '报表' }).click()
    await expect(page).toHaveURL(/\/reports$/)
    await expect(page.getByRole('heading', { name: '报表', exact: true })).toBeVisible()
    const expenseCell = page.locator('.rep-metric-cell').filter({ hasText: '本期支出' })
    await expect(expenseCell).toContainText('¥28.00')
    const expenseTable = page.getByRole('table', { name: /^支出 · / })
    await expect(expenseTable.locator('tr.rep-data-row').first()).toContainText('28')
    await expect(expenseTable.locator('tfoot')).toContainText('28')
  })
})
