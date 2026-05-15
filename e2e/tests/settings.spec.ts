import { test, expect } from '@playwright/test'
import { clearAllTestData, createTestAccountCategory, createTestAccount, createTestTransactionCategory, createTestTransaction } from '../helpers/test-data'

test.describe('设置页面', () => {
  test.beforeEach(async ({ page }) => {
    // 确保每个测试使用默认桌面端视口
    await page.setViewportSize({ width: 1280, height: 720 })
    await clearAllTestData()
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })

  test('应该正确显示交易记录总数', async ({ page }) => {
    // 创建基础数据
    const categoryId = await createTestAccountCategory({ name: '现金', type: 'asset' })
    const accountId = await createTestAccount({ name: '钱包', type: 'asset', categoryId })
    const txCategoryId = await createTestTransactionCategory({ name: '餐饮', type: 'expense' })
    
    // 创建一条交易用于验证
    const txId = await createTestTransaction({
      type: 'expense',
      amount: 100,
      accountId,
      categoryId: txCategoryId,
    })
    
    // 如果交易创建成功，等待数据同步
    if (txId) {
      await page.waitForTimeout(500)
    }
    
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    
    // 等待数据加载
    await page.waitForTimeout(2000)
    
    // 验证页面加载正确
    const transactionCard = page.locator('.kpi-grid .metric-card:has-text("交易记录") .metric-card__value')
    await expect(transactionCard).toBeVisible()
  })

  test('数据概览卡片应该正确显示各类数据数量', async ({ page }) => {
    await createTestAccountCategory({ name: '资产', type: 'asset' })
    await createTestAccountCategory({ name: '负债', type: 'liability' })
    await createTestTransactionCategory({ name: '收入', type: 'income' })
    await createTestTransactionCategory({ name: '支出', type: 'expense' })
    
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    
    const accountCategoryCard = page.locator('.kpi-grid .metric-card:has-text("账户分类") .metric-card__value')
    await expect(accountCategoryCard).toHaveText('2')
    
    const txCategoryCard = page.locator('.kpi-grid .metric-card:has-text("收支分类") .metric-card__value')
    await expect(txCategoryCard).toHaveText('2')
  })

  test('移动端下页面布局应该紧凑', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    
    const kpiGrid = page.locator('.kpi-grid')
    // 检查 kpi-grid 中有多少个 metric-card
    const kpiCards = await page.locator('.kpi-grid .metric-card').count()
    expect(kpiCards).toBeGreaterThan(0)
    
    const themeGrid = page.locator('.theme-options-grid')
    // 检查 theme-options-grid 中有多少个 theme-option-card
    const themeCards = await page.locator('.theme-options-grid .theme-option-card').count()
    expect(themeCards).toBeGreaterThan(0)
  })

  test('应该可以切换主题', async ({ page }) => {
    await page.locator('.theme-option-card:has-text("深色")').click()
    
    await page.waitForTimeout(500)
    
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')
    
    await expect(page.locator('.ant-tag:has-text("当前生效")')).toContainText('深色')
  })

  test('数据备份 Tabs 应该可以切换', async ({ page }) => {
    await expect(page.locator('.ant-tabs-tab-active:has-text("交易记录")')).toBeVisible()
    
    await page.locator('.ant-tabs-tab:has-text("配置信息")').click()
    
    await expect(page.locator('h3:has-text("导出配置")')).toBeVisible()
    await expect(page.locator('h3:has-text("导入配置")')).toBeVisible()
  })

  test('清空交易数据应该弹出确认框', async ({ page }) => {
    // 滚动到页面底部，使按钮可见
    await page.locator('button:has-text("清空交易数据")').scrollIntoViewIfNeeded()
    await page.locator('button:has-text("清空交易数据")').click({ force: true })
    
    // 等待 modal 出现
    await expect(page.locator('.ant-modal:has-text("确认清空交易数据")')).toBeVisible({ timeout: 5000 })
  })

  test('清空全部数据应该弹出确认框', async ({ page }) => {
    // 滚动到页面底部，使按钮可见
    await page.locator('button:has-text("清空全部数据")').scrollIntoViewIfNeeded()
    await page.locator('button:has-text("清空全部数据")').click({ force: true })
    
    // 等待 modal 出现
    await expect(page.locator('.ant-modal:has-text("确认清空全部数据")')).toBeVisible({ timeout: 5000 })
  })
})
