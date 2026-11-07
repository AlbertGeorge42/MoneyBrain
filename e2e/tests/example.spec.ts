import { test, expect } from '@playwright/test'

/**
 * 应用基础测试（高保真单入口）
 *
 * 旧版按 /dashboard、/transactions 等路由断言；高保真只有一个根路径入口，
 * 页面切换走侧边导航，断言落在 .mb-side-nav / 页面内容上。
 */

test.describe('应用基础测试', () => {
  test('根路径加载高保真单入口', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-side-nav')).toBeVisible()
    await expect(page.locator('.mb-brand-name')).toContainText('MoneyBrain')
    await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible()
  })

  test('侧边导航可以切换页面', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('.mb-side-nav')
    for (const label of ['流水', '报表', '预算', '设置', '总览']) {
      await nav.locator('.mb-side-nav-item', { hasText: label }).click()
      await expect(nav.locator('.mb-side-nav-item.is-active')).toContainText(label)
    }

    await nav.locator('.mb-side-nav-item', { hasText: '报表' }).click()
    await expect(page.getByRole('tablist', { name: '报表视图' })).toBeVisible()
  })
})
