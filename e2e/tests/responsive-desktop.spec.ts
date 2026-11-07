import { test, expect } from '@playwright/test'

test.describe('桌面端响应式布局', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('桌面端显示高保真侧边导航与五个入口', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('.mb-side-nav')
    await expect(nav).toBeVisible()
    await expect(nav.locator('.mb-side-nav-item')).toHaveCount(5)
    for (const label of ['总览', '流水', '报表', '预算', '设置']) {
      await expect(nav.locator('.mb-side-nav-item', { hasText: label })).toBeVisible()
    }
  })

  test('桌面端显示品牌信息', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-brand-name')).toContainText('MoneyBrain')
  })

  test('桌面端不渲染移动端底部导航', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-mobile-nav')).toHaveCount(0)
  })
})
