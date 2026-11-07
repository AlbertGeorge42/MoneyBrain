import { test, expect } from '@playwright/test'
import { seedAccount } from '../helpers/seed'

/**
 * 用户入门流程（高保真）
 *
 * e2e 使用空的临时库：根路径应出现冷启动引导，并可从同一入口进入
 * 设置 / 流水 / 报表 / 预算。旧版各自访问 /settings、/transactions 等路径的写法已移除。
 */

test.describe('用户入门流程', () => {
  test('空账本从总览冷启动引导开始', async ({ page }) => {
    // 显式空态，避免与其他并行用例写入的临时账户互相干扰。
    await page.goto('/?state=empty')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.mb-side-nav')).toBeVisible()
    await expect(page.getByRole('heading', { name: '总览', level: 1 })).toBeVisible()
    await expect(page.getByText('从一个账户开始')).toBeVisible()
  })

  test('从根路径进入设置与各业务页', async ({ page }) => {
    // 设置页在「零账户」时只显示冷启动引导，先建一个账户让分区导航可用。
    await seedAccount(page)

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const nav = page.locator('.mb-side-nav')

    await nav.locator('.mb-side-nav-item', { hasText: '设置' }).click()
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
    await expect(page.locator('.mb-set-nav')).toBeVisible()

    await nav.locator('.mb-side-nav-item', { hasText: '流水' }).click()
    await expect(page.getByRole('heading', { name: '流水', level: 1 })).toBeVisible()
    await expect(page.getByText('还没有流水')).toBeVisible()

    await nav.locator('.mb-side-nav-item', { hasText: '报表' }).click()
    await expect(page.getByRole('tablist', { name: '报表视图' })).toBeVisible()

    await nav.locator('.mb-side-nav-item', { hasText: '预算' }).click()
    await expect(page.locator('.mb-bg-month')).toBeVisible()
    await expect(page.getByText('还没有预算')).toBeVisible()
  })
})
