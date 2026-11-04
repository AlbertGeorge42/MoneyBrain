import { test, expect } from '@playwright/test'

/**
 * 设置页（R1 后挂在 /legacy/settings）：页面结构已不是旧版 KPI 卡片 + 主题卡片 + Tabs，
 * 这里只覆盖当前仍存在的三个入口。主题切换由 theme.spec 覆盖，避免重复。
 */
test.describe('设置页面（旧版入口）', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/legacy/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })

  test('数据备份分区应该可见', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '数据导出' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '数据导入' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '回滚点' })).toBeVisible()
  })

  test('清空交易数据应该弹出确认框', async ({ page }) => {
    const trigger = page.getByRole('button', { name: '清空交易数据' })
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()

    const modal = page.locator('.ant-modal').filter({ hasText: '清空交易数据' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('button', { name: '确认清空' })).toBeVisible()
  })

  test('清空全部数据应该弹出确认框', async ({ page }) => {
    const trigger = page.getByRole('button', { name: '清空全部数据' })
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()

    const modal = page.locator('.ant-modal').filter({ hasText: '清空全部数据' })
    await expect(modal).toBeVisible()
    await expect(modal.getByPlaceholder('DELETE')).toBeVisible()
  })
})
