import { test, expect } from '@playwright/test'

/** 主题切换（旧版设置页仍用 AntD Segmented；生产壳共用同一 data-theme）。 */
test.describe('主题切换功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/legacy/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })

  test('应该支持浅色主题', async ({ page }) => {
    await page.locator('.ant-segmented-item').filter({ hasText: '浅色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.settings-theme-badge')).toContainText('浅色')
  })

  test('应该支持深色主题', async ({ page }) => {
    await page.locator('.ant-segmented-item').filter({ hasText: '深色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.settings-theme-badge')).toContainText('深色')
  })

  test('应该支持跟随系统主题', async ({ page }) => {
    await page.locator('.ant-segmented-item').filter({ hasText: '跟随系统' }).click()
    await expect(page.locator('.settings-theme-badge')).toContainText('跟随系统')
  })
})
