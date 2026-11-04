import { test, expect } from '@playwright/test'

test.describe('HF 报表：固定表与两视图', () => {
  test('并排表列宽固定、行高一致、合计行对齐、短侧占位', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()

    await expect(page.getByRole('heading', { name: '报表', exact: true })).toBeVisible()
    await expect(page.getByText('2026-11', { exact: true })).toBeVisible()

    const income = page.getByRole('table', { name: '收入 · 2026-11' })
    const expense = page.getByRole('table', { name: '支出 · 2026-11' })
    await expect(income).toBeVisible()
    await expect(expense).toBeVisible()

    // table-layout: fixed + colgroup 三列权重
    await expect(income).toHaveCSS('table-layout', 'fixed')
    await expect(income.locator('colgroup col')).toHaveCount(3)

    // 数据行与合计行同高
    const heights = await income.locator('tr.rep-data-row, tfoot tr').evaluateAll((rows) =>
      rows.map((row) => Math.round(row.getBoundingClientRect().height * 10) / 10),
    )
    const expenseHeights = await expense.locator('tr.rep-data-row, tfoot tr').evaluateAll((rows) =>
      rows.map((row) => Math.round(row.getBoundingClientRect().height * 10) / 10),
    )
    expect(new Set(heights).size).toBe(1)
    expect(new Set(expenseHeights).size).toBe(1)
    expect(heights[0]).toBe(expenseHeights[0])

    // 短侧（收入表）静默补行，两侧合计行顶部对齐
    await expect(income.locator('tr.rep-spacer-row')).toHaveCount(10)
    await expect(expense.locator('tr.rep-spacer-row')).toHaveCount(0)
    const incomeFoot = await income.locator('tfoot tr').boundingBox()
    const expenseFoot = await expense.locator('tfoot tr').boundingBox()
    expect(incomeFoot?.y).toBe(expenseFoot?.y)

    // 折叠后重新补行，合计仍对齐
    await expense.getByRole('button', { name: '折叠 居住' }).click()
    await expect(income.locator('tr.rep-spacer-row')).toHaveCount(8)
    await expect(expense.locator('tr.rep-spacer-row')).toHaveCount(0)
    const foldedFoot = await expense.locator('tfoot tr').boundingBox()
    const incomeFoldedFoot = await income.locator('tfoot tr').boundingBox()
    expect(foldedFoot?.y).toBe(incomeFoldedFoot?.y)

    // 点击行进入详情，不做行内展开
    await expense.locator('tr.rep-data-row').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: '支出 · 详情' })).toBeVisible()
    await expect(drawer.getByRole('heading', { name: '构成' })).toBeVisible()
    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toBeHidden()
  })

  test('月/年切换与资产负债视图', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()

    // 月切换：前一月 → 2026-10
    await page.getByRole('button', { name: '上一期' }).click()
    await expect(page.getByText('2026-10', { exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: '收入 · 2026-10' })).toBeVisible()

    // 年切换：回到 2026
    await page.getByRole('button', { name: '年', exact: true }).click()
    await expect(page.getByText('2026', { exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: '收入 · 2026' })).toBeVisible()

    // 资产负债视图：两侧合计相等
    await page.getByRole('button', { name: '资产负债' }).click()
    const assets = page.getByRole('table', { name: '资产 · 2026' })
    const liabilities = page.getByRole('table', { name: '负债与权益 · 2026' })
    await expect(assets).toBeVisible()
    await expect(liabilities).toBeVisible()
    const assetTotal = await assets.locator('tfoot td').last().innerText()
    const liabilityTotal = await liabilities.locator('tfoot td').last().innerText()
    expect(assetTotal).toBe(liabilityTotal)
    const assetFoot = await assets.locator('tfoot tr').boundingBox()
    const liabilityFoot = await liabilities.locator('tfoot tr').boundingBox()
    expect(assetFoot?.y).toBe(liabilityFoot?.y)

    // 超长行才进 tab 序列并给 tooltip；短行不占 tab
    const longCell = assets.getByText(/招商银行储蓄卡/, { exact: false })
    await expect(longCell).toHaveAttribute('tabindex', '0')
    await longCell.hover()
    await expect(page.getByRole('tooltip')).toContainText('招商银行储蓄卡')
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    // 键盘路径：先聚焦数据行，Tab 到截断单元格后 tooltip 出现
    const longRow = assets.locator('tr.rep-data-row').filter({ hasText: '招商银行储蓄卡' })
    await longRow.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('tooltip')).toContainText('招商银行储蓄卡')
    await expect(assets.getByText('基金', { exact: true })).not.toHaveAttribute('tabindex', '0')
  })

  test('移动端单表切换与空态', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()
    await page.getByRole('group', { name: '设备' }).getByRole('button', { name: '移动' }).click()

    await expect(page.getByRole('table', { name: '收入 · 2026-11' })).toBeVisible()
    await expect(page.getByRole('table', { name: '支出 · 2026-11' })).toHaveCount(0)
    await page.getByRole('button', { name: '支出', exact: true }).click()
    await expect(page.getByRole('table', { name: '支出 · 2026-11' })).toBeVisible()

    // 移动端金额列不被截断、表头不裁切
    const overflowing = await page
      .locator('.rep-table tbody .rep-data-row td:last-child span')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(overflowing).toBe(0)
    const clippedHeaders = await page
      .locator('.rep-table th')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(clippedHeaders).toBe(0)

    // 冷启动空态：不渲染表格，给出记账入口
    await page.getByRole('group', { name: '数据态' }).getByRole('button', { name: '冷启动' }).click()
    await expect(page.getByRole('heading', { name: '这段时间还没有可汇总的记录' })).toBeVisible()
    await expect(page.getByRole('button', { name: '记第一笔' })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})
