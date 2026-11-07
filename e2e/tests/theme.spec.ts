import { test, expect } from '@playwright/test'
import { seedAccount } from '../helpers/seed'

/**
 * 主题切换（高保真）
 *
 * 旧版点 .theme-option-card 并看 .ant-tag；HF 是 role=radio 的主题单选，
 * 结果落在 <html data-theme> 与设置页的状态行。
 */

async function openAppearance(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1280, height: 720 })
  // 零账户时设置页只显示冷启动引导；建一个账户后才能进入分区导航。
  await seedAccount(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.locator('.mb-side-nav-item', { hasText: '设置' }).click()
  await expect(page.locator('.mb-set-nav')).toBeVisible()
  await page.locator('.mb-set-nav-item', { hasText: '外观主题' }).click()
  const group = page.getByRole('radiogroup', { name: '外观主题' })
  await expect(group).toBeVisible()
  return group
}

test.describe('主题切换功能', () => {
  test('支持浅色主题', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '浅色' }).click()
    await expect(group.getByRole('radio', { name: '浅色' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：浅色')
  })

  test('支持深色主题', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '深色' }).click()
    await expect(group.getByRole('radio', { name: '深色' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：深色')
  })

  test('支持跟随系统主题', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '跟随系统' }).click()
    await expect(group.getByRole('radio', { name: '跟随系统' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：跟随系统')
  })
})
