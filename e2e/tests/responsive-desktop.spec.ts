import { test, expect } from '@playwright/test'

test.describe('桌面端响应式布局', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('桌面端应该显示侧边导航栏', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 验证侧边栏存在 - 使用 ant-menu 选择器定位菜单项
    await expect(page.locator('.ant-menu').locator('text=首页')).toBeVisible()
    await expect(page.locator('.ant-menu').locator('text=交易记录')).toBeVisible()
    await expect(page.locator('.ant-menu').locator('text=财务报表')).toBeVisible()
    await expect(page.locator('.ant-menu').locator('text=预算管理')).toBeVisible()
    await expect(page.locator('.ant-menu').locator('text=设置')).toBeVisible()
  })

  test('桌面端应该显示品牌信息', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=MoneyBrain')).toBeVisible()
  })

  test('桌面端不应该显示移动端底部导航', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 移动端底部导航不应该存在
    const mobileTabBar = page.locator('.mobile-tab-bar')
    await expect(mobileTabBar).toHaveCount(0)
  })
})
