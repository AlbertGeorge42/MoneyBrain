import { test, expect } from '@playwright/test'

/** 移动端壳层（ProdShell）：无侧栏、底部导航切页、内容紧凑。 */
test.describe('移动端响应式布局', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('移动端应该隐藏侧边导航栏', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.locator('.hf-sidebar')).toHaveCount(0)
    await expect(page.locator('.hf-shell-mobile')).toBeVisible()
  })

  test('移动端应该显示底部导航栏', async ({ page }) => {
    await page.goto('/dashboard')

    const nav = page.getByRole('navigation', { name: '底部导航' })
    await expect(nav).toBeVisible()
    for (const label of ['总览', '流水', '报表', '预算', '设置']) {
      await expect(nav.getByRole('button', { name: label })).toBeVisible()
    }
  })

  test('移动端底部导航应该可以切换页面', async ({ page }) => {
    await page.goto('/dashboard')
    const nav = page.getByRole('navigation', { name: '底部导航' })

    await nav.getByRole('button', { name: '流水' }).click()
    await expect(page).toHaveURL(/\/transactions$/)

    await page.getByRole('navigation', { name: '底部导航' }).getByRole('button', { name: '报表' }).click()
    await expect(page).toHaveURL(/\/reports$/)

    await page.getByRole('navigation', { name: '底部导航' }).getByRole('button', { name: '设置' }).click()
    await expect(page).toHaveURL(/\/legacy\/settings$/)
  })

  test('移动端应该显示紧凑的布局', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.locator('.hf-mobile-header')).toBeVisible()
    // 移动端页标题在头部（PC 才渲染 h1 标题）。
    await expect(page.locator('.hf-mobile-page-title')).toHaveText('总览')
    await expect(page.locator('.hf-fab')).toBeVisible()
    await expect(
      page.getByRole('region', { name: '净资产', exact: true })
        .or(page.getByRole('heading', { name: '账本还是空的' })),
    ).toBeVisible()
  })
})
