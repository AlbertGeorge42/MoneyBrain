import { test, expect } from '@playwright/test'

test.describe('HF 总览：冷启动首笔记账闭环', () => {
  test('切到冷启动 → 记第一笔 → 总览展示该笔记录与负净资产', async ({ page }) => {
    await page.goto('/design')

    // 默认落在总览
    await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()

    // 预览条切到冷启动，出现空账本引导
    await page.getByRole('group', { name: '数据态' }).getByRole('button', { name: '冷启动' }).click()
    await expect(page.getByRole('heading', { name: '账本还是空的' })).toBeVisible()

    // 记第一笔：金额 + 备注，走 PC 浮层的保存
    await page.getByRole('button', { name: '记第一笔' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '金额' }).fill('28')
    await dialog.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }).click()
    await dialog.getByRole('textbox', { name: '备注' }).fill('冷启动测试')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toBeHidden()

    // 引导退场，总览切到正常态
    await expect(page.getByRole('heading', { name: '账本还是空的' })).toHaveCount(0)

    // 净资产与支出都带 − 号（净资产 = 已记流水净额）
    const netWorth = page.getByRole('region', { name: '净资产', exact: true })
    await expect(netWorth.getByText('−¥28.00', { exact: true }).first()).toBeVisible()
    await expect(netWorth.getByText('本月结余 −¥28.00 · 已记 1 笔', { exact: true })).toBeVisible()
    await expect(netWorth).toContainText(/本月支出\s*−¥28\.00/)

    // 最近流水只保留这一笔
    const recent = page.getByRole('region', { name: '最近流水', exact: true })
    await expect(
      recent.getByRole('row', { name: '餐饮 · 冷启动测试，微信零钱，−¥28.00', exact: true }),
    ).toBeVisible()
  })
})
