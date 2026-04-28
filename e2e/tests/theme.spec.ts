import { test, expect } from '@playwright/test'

test.describe('主题切换功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })

  test('应该支持浅色主题', async ({ page }) => {
    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端使用 Dropdown 菜单
      await page.locator('.app-shell__toolbar-actions .ant-btn').first().click()
      await page.locator('.ant-dropdown-menu-item', { hasText: '浅色' }).click()
    } else {
      // 桌面端使用 Segmented 组件
      await page.locator('.ant-segmented-item', { hasText: '浅色' }).click()
    }

    // 等待主题切换
    await page.waitForTimeout(500)

    // 验证 data-theme 属性为 light
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('应该支持深色主题', async ({ page }) => {
    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端使用 Dropdown 菜单
      await page.locator('.app-shell__toolbar-actions .ant-btn').first().click()
      await page.locator('.ant-dropdown-menu-item', { hasText: '深色' }).click()
    } else {
      // 桌面端使用 Segmented 组件
      await page.locator('.ant-segmented-item', { hasText: '深色' }).click()
    }

    // 等待主题切换
    await page.waitForTimeout(500)

    // 验证 data-theme 属性为 dark
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')
  })

  test('应该支持系统主题', async ({ page }) => {
    // 检查是否是移动端（通过检查侧边栏是否隐藏）
    const sider = page.locator('.app-shell__sider')
    const isDesktop = await sider.isVisible().catch(() => false)

    if (!isDesktop) {
      // 移动端使用 Dropdown 菜单
      await page.locator('.app-shell__toolbar-actions .ant-btn').first().click()
      await page.locator('.ant-dropdown-menu-item', { hasText: '系统' }).click()
    } else {
      // 桌面端使用 Segmented 组件
      await page.locator('.ant-segmented-item', { hasText: '系统' }).click()
    }

    // 等待主题切换
    await page.waitForTimeout(500)

    // 验证系统主题模式被激活（通过检查 status-chip 中的文本）
    await expect(page.locator('.status-chip')).toContainText('系统')
  })
})
