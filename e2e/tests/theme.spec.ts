import { test, expect } from '@playwright/test'

test.describe('主题切换功能', () => {
  test.beforeEach(async ({ page }) => {
    // 确保每个测试使用默认桌面端视口
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })

  test('应该支持浅色主题', async ({ page }) => {
    // 桌面端使用 theme-option-card 组件
    await page.locator('.theme-option-card', { hasText: '浅色' }).click()
    
    // 等待主题切换
    await page.waitForTimeout(500)
    
    // 验证 data-theme 属性为 light
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('应该支持深色主题', async ({ page }) => {
    // 桌面端使用 theme-option-card 组件
    await page.locator('.theme-option-card', { hasText: '深色' }).click()
    
    // 等待主题切换
    await page.waitForTimeout(500)
    
    // 验证 data-theme 属性为 dark
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')
  })

  test('应该支持系统主题', async ({ page }) => {
    // 桌面端使用 theme-option-card 组件
    await page.locator('.theme-option-card', { hasText: '跟随系统' }).click()
    
    // 等待主题切换
    await page.waitForTimeout(500)
    
    // 验证系统主题模式被激活（通过检查 Tag 中的文本）
    await expect(page.locator('.ant-tag')).toContainText('跟随系统')
  })
})
