import { test, expect } from '@playwright/test'
import { seedAccount } from '../helpers/seed'

/**
 * 主题切换（高保真）
 *
 * 主题唯一来源是 Mantine 的 colorScheme：结果落在 <html data-mantine-color-scheme>
 * 与由 cssVariablesResolver 输出的 --mb-* 变量上，设置页状态行同步显示。
 */

const SCHEME_ATTR = 'data-mantine-color-scheme'

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

async function surfaceToken(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--mb-color-surface').trim(),
  )
}

test.describe('主题切换功能', () => {
  test('支持浅色主题', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '浅色' }).click()
    await expect(group.getByRole('radio', { name: '浅色' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute(SCHEME_ATTR, 'light')
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：浅色')
    await expect.poll(() => surfaceToken(page)).toBe('#f6f6f4')
  })

  test('支持深色主题，刷新后保持', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '深色' }).click()
    await expect(group.getByRole('radio', { name: '深色' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute(SCHEME_ATTR, 'dark')
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：深色')
    await expect.poll(() => surfaceToken(page)).toBe('#0d0f10')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('html')).toHaveAttribute(SCHEME_ATTR, 'dark')
    await expect.poll(() => surfaceToken(page)).toBe('#0d0f10')
  })

  test('支持跟随系统主题', async ({ page }) => {
    const group = await openAppearance(page)

    await group.getByRole('radio', { name: '跟随系统' }).click()
    await expect(group.getByRole('radio', { name: '跟随系统' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('.mb-set-theme-status')).toContainText('当前生效：跟随系统')
    // 系统偏好由无头浏览器决定；无论明暗，解析后的变量都必须与属性一致。
    const scheme = await page.locator('html').getAttribute(SCHEME_ATTR)
    expect(scheme === 'light' || scheme === 'dark').toBe(true)
    await expect
      .poll(() => surfaceToken(page))
      .toBe(scheme === 'dark' ? '#0d0f10' : '#f6f6f4')
  })
})
