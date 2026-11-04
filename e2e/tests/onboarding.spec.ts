import { test, expect } from '@playwright/test'

/**
 * 用户入门流程（R1 后）：总览 / 流水 / 报表是生产壳，预算与设置暂在 /legacy。
 * 断言取当前壳层与页面标题，不依赖旧 AntD 的类名。
 */

test.describe('用户入门流程', () => {
  test('从总览进入设置页', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()

    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置' }).click()
    await expect(page).toHaveURL(/\/legacy\/settings$/)
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')

    await expect(page.getByText('外观主题').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '数据导出' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '数据导入' })).toBeVisible()
  })
})

test.describe('生产页面访问', () => {
  test('流水页面可以正常访问', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: '流水', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '显示' })).toBeVisible()
    await expect(page.getByRole('button', { name: /记一笔/ }).first()).toBeVisible()
  })

  test('总览页面显示净资产主卡或冷启动引导', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()

    // 有数据时显示净资产主卡；空账本时显示「记第一笔」引导，两者都是有效首屏。
    await expect(
      page.getByRole('region', { name: '净资产', exact: true })
        .or(page.getByRole('heading', { name: '账本还是空的' })),
    ).toBeVisible()
  })
})

test.describe('预算管理流程', () => {
  test('预算页面可以正常访问', async ({ page }) => {
    await page.goto('/legacy/budgets')
    await expect(page.locator('h1.page-header__title')).toContainText('预算管理')
  })
})
