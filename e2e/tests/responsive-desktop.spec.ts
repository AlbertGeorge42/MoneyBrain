import { test, expect } from '@playwright/test'

/** 桌面端壳层（ProdShell）：侧栏导航存在、品牌可见、无移动底栏。 */
test.describe('桌面端响应式布局', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('桌面端应该显示侧边导航栏', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.hf-sidebar')).toBeVisible()
    const nav = page.getByRole('navigation', { name: '主导航' })
    await expect(nav).toBeVisible()
    for (const label of ['总览', '流水', '报表', '预算', '设置']) {
      await expect(nav.getByRole('button', { name: label })).toBeVisible()
    }
  })

  test('桌面端应该显示品牌信息', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.hf-brand-name')).toHaveText('MoneyBrain')
    await expect(page.locator('.hf-brand-mark')).toBeVisible()
  })

  test('桌面端不应该显示移动端底部导航', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.hf-bottom-nav')).toHaveCount(0)
    await expect(page.locator('.hf-fab')).toHaveCount(0)
  })
})
