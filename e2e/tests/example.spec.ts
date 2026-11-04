import { test, expect } from '@playwright/test'

/**
 * 生产壳基础测试（R1 起 / 与 /reports 走 ProdShell，旧页在 /legacy）。
 * 只断言壳层与导航的结构，不依赖账本里有没有数据。
 */

test.describe('生产壳基础测试', () => {
  test('首页进入总览并显示主导航', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page.locator('.hf-sidebar')).toBeVisible()
    await expect(page.locator('.hf-brand-name')).toHaveText('MoneyBrain')
  })

  test('主导航可以正常切换', async ({ page }) => {
    await page.goto('/dashboard')
    const nav = page.getByRole('navigation', { name: '主导航' })

    await nav.getByRole('button', { name: '流水' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
    await expect(page.getByRole('heading', { name: '流水', exact: true })).toBeVisible()

    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '报表' }).click()
    await expect(page).toHaveURL(/\/reports$/)
    await expect(page.getByRole('heading', { name: '报表', exact: true })).toBeVisible()

    // 预算与设置仍由 R2 前的旧页承载，入口指向 /legacy。
    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '预算' }).click()
    await expect(page).toHaveURL(/\/legacy\/budgets$/)
    await expect(page.locator('h1.page-header__title')).toContainText('预算管理')

    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置' }).click()
    await expect(page).toHaveURL(/\/legacy\/settings$/)
    await expect(page.locator('h1.page-header__title')).toContainText('设置与数据')
  })
})
