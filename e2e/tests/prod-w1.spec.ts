import { test, expect } from '@playwright/test'

/**
 * W1 收尾（生产壳）：N 热键、草稿丢弃可撤销、流水「显示」面板。
 * 不依赖账本数据，纯 UI 行为；读的都是真实 API 页面的壳层。
 */
test.describe('生产壳：W1 交互收尾', () => {
  test('N 热键打开记账，关闭草稿可撤销', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()

    await page.keyboard.press('n')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '金额' }).fill('66')
    await dialog.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }).click()
    await dialog.getByRole('textbox', { name: '备注' }).fill('草稿撤销 e2e')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByText('草稿已丢弃')).toBeVisible()

    await page.getByRole('button', { name: '撤销' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: '金额' })).toHaveValue('66')
    await expect(dialog.getByRole('textbox', { name: '备注' })).toHaveValue('草稿撤销 e2e')
  })

  test('流水「显示」面板切换列与密度并持久化', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: '流水', exact: true })).toBeVisible()

    const table = page.locator('.tx-table')
    await expect(table).toHaveAttribute('data-density', 'standard')

    await page.getByRole('button', { name: '显示' }).click()
    const panel = page.getByLabel('列表显示')
    await expect(panel).toBeVisible()

    const note = panel.getByRole('checkbox', { name: '备注' })
    await expect(note).toBeChecked()
    await note.uncheck()
    await expect(note).not.toBeChecked()

    await panel.getByRole('group', { name: '密度' }).getByRole('button', { name: '紧凑' }).click()
    await expect(table).toHaveAttribute('data-density', 'compact')

    // 刷新后仍保留（localStorage 长期设置）
    await page.reload()
    await expect(page.locator('.tx-table')).toHaveAttribute('data-density', 'compact')
    await page.getByRole('button', { name: '显示' }).click()
    await expect(page.getByLabel('列表显示').getByRole('checkbox', { name: '备注' })).not.toBeChecked()

    // 还原默认，避免污染后续用例
    await page.getByLabel('列表显示').getByRole('checkbox', { name: '备注' }).check()
    await page.getByLabel('列表显示').getByRole('group', { name: '密度' }).getByRole('button', { name: '标准' }).click()
  })
})

test.describe('移动端：页头「显示」抽屉', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('从页头打开同一套显示字段', async ({ page }) => {
    await page.goto('/transactions')
    // 移动端页头不渲染 h1 标题，以页头「显示」入口作为就绪信号。
    await expect(page.getByRole('button', { name: '显示' })).toBeVisible()

    await page.getByRole('button', { name: '显示' }).click()
    const drawer = page.getByRole('dialog').filter({ hasText: '列表显示' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('checkbox', { name: '账户' })).toBeChecked()
    await expect(drawer.getByRole('group', { name: '密度' })).toBeVisible()

    await drawer.getByRole('button', { name: '完成' }).click()
    await expect(drawer).toBeHidden()
  })
})
