import { test, expect } from '@playwright/test'

test.describe('移动端响应式布局', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('移动端应该隐藏侧边导航栏', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 侧边栏在移动端应该隐藏（检查 app-shell__sider 的 CSS 属性）
    const sider = page.locator('.app-shell__sider')
    // 在移动端，侧边栏可能仍然存在但不可见或被隐藏
    const isVisible = await sider.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('移动端应该显示底部导航栏', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 验证底部导航存在
    await expect(page.locator('.mobile-tab-bar')).toBeVisible()
  })

  test('移动端底部导航应该可以切换页面', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 点击底部导航的交易记录
    await page.locator('.mobile-tab-bar').locator('text=交易').click()
    await expect(page).toHaveURL(/.*transactions/)

    // 点击底部导航的报表
    await page.locator('.mobile-tab-bar').locator('text=报表').click()
    await expect(page).toHaveURL(/.*reports/)

    // 点击底部导航的设置
    await page.locator('.mobile-tab-bar').locator('text=设置').click()
    await expect(page).toHaveURL(/.*settings/)
  })

  test('移动端应该显示紧凑的布局', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证 KPI 卡片在移动端正常显示 - 使用 metric-card__label 选择器
    await expect(page.locator('.metric-card__label', { hasText: '总资产' })).toBeVisible()
    await expect(page.locator('.metric-card__label', { hasText: '总负债' })).toBeVisible()
    await expect(page.locator('.metric-card__label', { hasText: '净资产' })).toBeVisible()
  })
})
