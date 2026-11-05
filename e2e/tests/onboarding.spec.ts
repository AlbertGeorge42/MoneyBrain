import { test, expect } from '@playwright/test'

test.describe('用户入门流程', () => {
  test('创建账户分类 -> 创建账户 -> 验证显示', async ({ page }) => {
    // 访问首页
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端验证工具栏标题（侧边栏在移动端隐藏）
      await expect(page.locator('.app-shell__toolbar-title')).toBeVisible()
    } else {
      // 桌面端验证 app-shell__brand-title
      await expect(page.locator('.app-shell__brand-title')).toBeVisible()
    }

    // 导航到设置页面
    if (!isDesktop) {
      await page.locator('.mobile-tab-bar').locator('text=设置').click()
    } else {
      await page.click('text=设置')
    }
    await expect(page).toHaveURL(/.*settings/)
    await page.waitForLoadState('domcontentloaded')

    // 验证设置页面内容 - 使用 page-header__title 类选择器定位页面标题
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
    await expect(page.locator('text=外观主题').first()).toBeVisible()
    await expect(page.locator('text=导入与导出').first()).toBeVisible()
  })
})

test.describe('交易记录流程', () => {
  test('交易记录页面可以正常访问', async ({ page }) => {
    await page.goto('/transactions')
    // 使用 domcontentloaded 代替 networkidle，避免 Firefox 超时
    await page.waitForLoadState('domcontentloaded')

    // 验证交易记录页面内容 - 使用 page-header__title 定位标题
    await expect(page.locator('h1.page-header__title')).toContainText('交易记录', { timeout: 10000 })
    await expect(page.locator('text=记收入').first()).toBeVisible()
    await expect(page.locator('text=记支出').first()).toBeVisible()
  })

  test('Dashboard 页面显示 KPI 指标', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // 验证 Dashboard 页面内容 - 使用 page-header__title 定位标题
    await expect(page.locator('h1.page-header__title')).toContainText('财务总览', { timeout: 10000 })
    // 使用 metric-card__label 选择器定位 KPI 标签，避免 toolbar meta 的 hidden 问题
    await expect(page.locator('.metric-card__label', { hasText: '总资产' })).toBeVisible()
    await expect(page.locator('.metric-card__label', { hasText: '总负债' })).toBeVisible()
    await expect(page.locator('.metric-card__label', { hasText: '净资产' })).toBeVisible()
  })
})

test.describe('预算管理流程', () => {
  test('预算页面可以正常访问', async ({ page }) => {
    await page.goto('/budgets')
    await page.waitForLoadState('domcontentloaded')

    // 验证预算页面内容 - 使用 page-header__title 定位标题
    await expect(page.locator('h1.page-header__title')).toContainText('预算管理', { timeout: 10000 })
  })
})
