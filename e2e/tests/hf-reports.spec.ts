import { test, expect } from '@playwright/test'

test.describe('HF 报表：四视图、图表与下钻', () => {
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

    // 点击行进入详情：构成 + 相关流水 + 在流水中查看
    await expense.locator('tr.rep-data-row').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: '支出 · 详情' })).toBeVisible()
    await expect(drawer.getByRole('heading', { name: '构成' })).toBeVisible()
    await expect(drawer.getByRole('heading', { name: '相关流水 · 近 2 笔' })).toBeVisible()
    await expect(drawer.getByText('11 月房租')).toBeVisible()
    await drawer.getByRole('button', { name: '在流水中查看' }).click()

    // 跳转流水页并带筛选 chip
    await expect(page.getByRole('heading', { name: '流水', exact: true })).toBeVisible()
    await expect(page.locator('.tx-condition').filter({ hasText: '居住' })).toBeVisible()
    await expect(page.locator('.tx-condition').filter({ hasText: '2026-11-01' })).toBeVisible()
  })

  test('月/年切换与资产负债视图', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()

    // 月切换：前一月 → 2026-10，走势 x 轴跟随所选期间
    await page.getByRole('button', { name: '上一期' }).click()
    await expect(page.getByText('2026-10', { exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: '收入 · 2026-10' })).toBeVisible()
    await expect(page.locator('.rep-trend-x span')).toHaveText(['5月', '6月', '7月', '8月', '9月', '10月'])
    await expect(page.locator('.rep-trend-svg')).toHaveAttribute('aria-label', /近 6 个月.*10月/)

    // 再往前一月 → 2026-09
    await page.getByRole('button', { name: '上一期' }).click()
    await expect(page.getByText('2026-09', { exact: true })).toBeVisible()
    await expect(page.locator('.rep-trend-x span')).toHaveText(['4月', '5月', '6月', '7月', '8月', '9月'])
    await expect(page.locator('.rep-trend-svg')).toHaveAttribute('aria-label', /近 6 个月.*9月/)

    // 年切换：回到 2026，走势按年份
    await page.getByRole('button', { name: '年', exact: true }).click()
    await expect(page.locator('.rep-period-value')).toHaveText('2026')
    await expect(page.getByRole('table', { name: '收入 · 2026' })).toBeVisible()
    await expect(page.locator('.rep-trend-x span')).toHaveText(['2021', '2022', '2023', '2024', '2025', '2026'])
    await expect(page.locator('.rep-trend-svg')).toHaveAttribute('aria-label', /近 6 年.*2026/)

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

  test('现金流与投资分析：指标、图表与持仓排序', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()

    // 每个视图都有走势与构成图
    await expect(page.getByRole('region', { name: '走势' })).toBeVisible()
    await expect(page.getByRole('region', { name: '构成' })).toBeVisible()

    await page.getByRole('button', { name: '现金流' }).click()
    await expect(page.getByRole('table', { name: '流入 · 2026-11' })).toBeVisible()
    await expect(page.getByRole('table', { name: '流出 · 2026-11' })).toBeVisible()
    const cashMetrics = page.locator('.rep-metric-strip--flat .rep-metric-cell')
    await expect(cashMetrics).toHaveCount(4)
    await expect(page.getByText('期末现金总量', { exact: true })).toBeVisible()

    // 汇总行没有可定位的流水：不给出口，文案也不承诺
    await page.getByRole('table', { name: '流入 · 2026-11' }).locator('tr.rep-data-row').first().click()
    const groupDrawer = page.getByRole('dialog')
    await expect(groupDrawer.getByRole('heading', { name: '流入 · 详情' })).toBeVisible()
    await expect(groupDrawer.getByRole('button', { name: '在流水中查看' })).toHaveCount(0)
    await expect(groupDrawer.getByText('没有可直接定位的单笔流水')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(groupDrawer).toBeHidden()

    await page.getByRole('button', { name: '投资分析' }).click()
    const holdings = page.getByRole('table', { name: '持仓明细 · 2026-11' })
    await expect(holdings).toBeVisible()
    await expect(holdings.locator('colgroup col')).toHaveCount(5)
    const before = await holdings.locator('tr.rep-data-row').first().innerText()
    await holdings.getByRole('button', { name: '按收益率排序' }).click()
    const after = await holdings.locator('tr.rep-data-row').first().innerText()
    expect(after).not.toBe(before)
    await expect(holdings.locator('th[aria-sort="descending"]')).toHaveCount(1)

    // 投资详情不下钻到流水
    await holdings.locator('tr.rep-data-row').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: '持仓明细 · 详情' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '在流水中查看' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    // 有匹配但所选期间账本无流水：不给出口，文案不承诺
    await page.getByRole('button', { name: '收支明细' }).click()
    await page.getByRole('button', { name: '上一期' }).click()
    await page.getByRole('button', { name: '上一期' }).click()
    await expect(page.getByText('2026-09', { exact: true })).toBeVisible()
    await page.getByRole('table', { name: '支出 · 2026-09' }).locator('tr.rep-data-row').first().click()
    const emptyDrawer = page.getByRole('dialog')
    await expect(emptyDrawer.getByText('本期账本里没有匹配的流水')).toBeVisible()
    await expect(emptyDrawer.getByRole('button', { name: '在流水中查看' })).toHaveCount(0)
  })

  test('移动端单表切换、四视图空态与金额不截断', async ({ page }) => {
    await page.goto('/design')
    await page.getByRole('button', { name: '报表' }).click()
    await page.getByRole('group', { name: '设备' }).getByRole('button', { name: '移动' }).click()

    await expect(page.getByRole('table', { name: '收入 · 2026-11' })).toBeVisible()
    await expect(page.getByRole('table', { name: '支出 · 2026-11' })).toHaveCount(0)
    await page.getByRole('button', { name: '支出', exact: true }).click()
    await expect(page.getByRole('table', { name: '支出 · 2026-11' })).toBeVisible()

    // 有效断言：金额 span 有实际宽度，且 scrollWidth 不超过 clientWidth（真的检测截断）
    const overflow = await page
      .locator('.rep-table tbody .rep-data-row td.rep-num-cell .mb-num')
      .evaluateAll((nodes) => nodes
        .filter((node) => node.clientWidth > 0)
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.textContent ?? ''))
    expect(overflow).toEqual([])

    const zeroWidth = await page
      .locator('.rep-table tbody .rep-data-row td.rep-num-cell .mb-num')
      .evaluateAll((nodes) => nodes.filter((node) => node.clientWidth === 0).length)
    expect(zeroWidth).toBe(0)

    const clippedHeaders = await page
      .locator('.rep-table th')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(clippedHeaders).toBe(0)

    // 现金流与投资分析在移动端也检查金额不截断
    await page.getByRole('button', { name: '现金流' }).click()
    await expect(page.getByRole('table', { name: '流入 · 2026-11' })).toBeVisible()
    const cashOverflow = await page
      .locator('.rep-table tbody .rep-data-row td.rep-num-cell .mb-num')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(cashOverflow).toBe(0)

    await page.getByRole('button', { name: '投资分析' }).click()
    await expect(page.getByRole('table', { name: '持仓明细 · 2026-11' })).toBeVisible()
    const investOverflow = await page
      .locator('.rep-table tbody .rep-data-row td.rep-num-cell .mb-num')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(investOverflow).toBe(0)

    // 投资表可横向滚动：有提示、首列吸顶
    await expect(page.getByText('左右滑动查看成本、收益与收益率。')).toBeVisible()
    const scroller = page.locator('.rep-table-scroll--investment')
    await expect(scroller).toHaveCount(1)
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    const firstHeader = scroller.locator('thead th').first()
    const beforeScroll = await firstHeader.boundingBox()
    await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth })
    const afterScroll = await firstHeader.boundingBox()
    expect(Math.abs((afterScroll?.x ?? 0) - (beforeScroll?.x ?? 0))).toBeLessThan(2)
    const scrolledOverflow = await page
      .locator('.rep-table tbody .rep-data-row td.rep-num-cell .mb-num')
      .evaluateAll((nodes) => nodes
        .filter((node) => node.clientWidth > 0)
        .filter((node) => node.scrollWidth > node.clientWidth + 1).length)
    expect(scrolledOverflow).toBe(0)

    // 最大滚动时，最后内容在「+」FAB 上方
    await page.locator('.hf-mobile-body').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const noteBox = await page.locator('.rep-table-note').last().boundingBox()
    const fabBox = await page.locator('.hf-fab').boundingBox()
    expect(noteBox).not.toBeNull()
    expect(fabBox).not.toBeNull()
    expect((noteBox?.y ?? 0) + (noteBox?.height ?? 0)).toBeLessThanOrEqual(fabBox?.y ?? 0)

    // 冷启动空态：四个视图都空态、不渲染表格
    await page.getByRole('group', { name: '数据态' }).getByRole('button', { name: '冷启动' }).click()
    for (const view of ['收支明细', '资产负债', '现金流', '投资分析']) {
      await page.getByRole('button', { name: view }).click()
      await expect(page.getByRole('heading', { name: '这段时间还没有可汇总的记录' })).toBeVisible()
      await expect(page.getByRole('table')).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: '记第一笔' })).toBeVisible()
  })
})
