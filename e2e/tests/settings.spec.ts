import { test, expect } from '@playwright/test'
import { seedAccount } from '../helpers/seed'

/**
 * 设置页面（高保真）
 *
 * 选择器统一用 .mb-set-nav / .mb-set-panel / .mb-set-sheet。
 * 数据区只验证入口与确认面板，不做真实清空。
 */

async function openSettings(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1280, height: 720 })
  // 零账户时设置页只显示冷启动引导；建一个账户后才能进入分区导航。
  await seedAccount(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.locator('.mb-side-nav-item', { hasText: '设置' }).click()
  await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
  await expect(page.locator('.mb-set-nav')).toBeVisible()
}

test.describe('设置页面', () => {
  test('分区导航覆盖配置中心与通用设置', async ({ page }) => {
    await openSettings(page)

    const nav = page.locator('.mb-set-nav')
    for (const label of [
      '账户分类',
      '收支分类',
      '现金流分类',
      '投资资产类型',
      '外观主题',
      '自动备份',
      '列表显示',
      '数据与备份',
      '回收站',
    ]) {
      await expect(nav.locator('.mb-set-nav-item', { hasText: label })).toBeVisible()
    }
    await expect(page.locator('.mb-set-panel-title')).toContainText('账户分类')
  })

  test('数据与备份区提供导出、导入与清空入口', async ({ page }) => {
    await openSettings(page)

    await page.locator('.mb-set-nav-item', { hasText: '数据与备份' }).click()
    await expect(page.locator('.mb-set-panel-title')).toContainText('数据与备份')

    await expect(page.getByRole('button', { name: /导出账本/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '打开导入向导' })).toBeVisible()
    await expect(page.getByRole('button', { name: '清空账本' })).toBeVisible()
  })

  test('清空账本会先打开确认面板而不是立即执行', async ({ page }) => {
    await openSettings(page)

    await page.locator('.mb-set-nav-item', { hasText: '数据与备份' }).click()
    await page.getByRole('button', { name: '清空账本' }).click()

    await expect(page.locator('.mb-set-sheet-title')).toContainText('清空账本')
    await expect(page.getByText(/清空会删除所有账户、分类、流水、预算与投资快照/)).toBeVisible()
  })

  test('自动备份区暴露开启开关', async ({ page }) => {
    await openSettings(page)

    await page.locator('.mb-set-nav-item', { hasText: '自动备份' }).click()
    await expect(page.locator('.mb-set-panel-title')).toContainText('自动备份')
    await expect(page.getByRole('switch', { name: '开启自动备份' })).toBeVisible()
  })
})
