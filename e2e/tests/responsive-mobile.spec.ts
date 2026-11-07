import { test, expect } from '@playwright/test'

test.describe('移动端响应式布局', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('移动端不渲染桌面侧边导航', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-side-nav')).toHaveCount(0)
    await expect(page.locator('.mb-mobile-shell')).toBeVisible()
  })

  test('移动端显示底部导航', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-mobile-nav')).toBeVisible()
  })

  test('移动端底部导航可以切换页面', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('.mb-mobile-nav')
    for (const [label, pageId] of [
      ['流水', 'transactions'],
      ['报表', 'reports'],
      ['预算', 'budgets'],
      ['设置', 'settings'],
      ['总览', 'overview'],
    ] as const) {
      await nav.locator('.mb-mobile-nav-item', { hasText: label }).click()
      await expect(page.locator('.mb-mobile-shell')).toHaveAttribute('data-page', pageId)
    }
  })

  test('移动端手机框布局紧凑可读', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-mobile-title')).toContainText('总览')
    await expect(page.locator('.mb-mobile-scroll')).toBeVisible()
  })
})
