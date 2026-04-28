import { test, expect } from '@playwright/test'

/**
 * 示例端到端测试
 * 验证应用基本可访问性和导航
 */

test.describe('应用基础测试', () => {
  test('首页可以正常访问', async ({ page }) => {
    await page.goto('/')
    // 等待页面加载完成
    await page.waitForLoadState('networkidle')

    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端：验证工具栏标题和底部导航
      await expect(page.locator('.app-shell__toolbar-title')).toBeVisible()
      await expect(page.locator('.mobile-tab-bar')).toBeVisible()
    } else {
      // 桌面端：验证侧边栏品牌标题
      await expect(page.locator('.app-shell__brand-title')).toBeVisible()
    }
  })

  test('导航菜单可以正常切换', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端使用底部导航
      await page.locator('.mobile-tab-bar').locator('text=交易').click()
      await expect(page).toHaveURL(/.*transactions/)
      await page.waitForLoadState('networkidle')

      await page.locator('.mobile-tab-bar').locator('text=报表').click()
      await expect(page).toHaveURL(/.*reports/)
      await page.waitForLoadState('networkidle')

      await page.locator('.mobile-tab-bar').locator('text=预算').click()
      await expect(page).toHaveURL(/.*budgets/)
      await page.waitForLoadState('networkidle')

      await page.locator('.mobile-tab-bar').locator('text=设置').click()
      await expect(page).toHaveURL(/.*settings/)
    } else {
      // 桌面端使用侧边栏菜单
      await page.locator('.ant-menu').locator('text=交易记录').click()
      await expect(page).toHaveURL(/.*transactions/)
      await page.waitForLoadState('networkidle')

      await page.locator('.ant-menu').locator('text=财务报表').click()
      await expect(page).toHaveURL(/.*reports/)
      await page.waitForLoadState('networkidle')

      await page.locator('.ant-menu').locator('text=预算管理').click()
      await expect(page).toHaveURL(/.*budgets/)
      await page.waitForLoadState('networkidle')

      await page.locator('.ant-menu').locator('text=设置').click()
      await expect(page).toHaveURL(/.*settings/)
    }
  })
})
