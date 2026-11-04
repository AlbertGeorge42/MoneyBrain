#!/usr/bin/env node
/**
 * 桌面端端到端烟测：通过 CDP 驱动真实的 Edge 应用窗口（不是另起浏览器），
 * 验证「记一笔 → 总览 → 流水 → 报表」闭环，并把每一步截图留证。
 *
 * 用法：
 *   $env:MB_DESKTOP_DEBUG_PORT=9333; npm run desktop   # 另开一个终端
 *   node scripts/desktop-smoke.mjs
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

const PORT = process.env.MB_DESKTOP_DEBUG_PORT || '9333'
const NOTE = '桌面端闭环验证'
const OUT = path.join(os.tmpdir(), 'moneybrain-desktop-smoke')

function log(message) {
  console.log(`[smoke] ${message}`)
}

async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const context = browser.contexts()[0]
  if (!context) throw new Error('未连上桌面窗口：没有浏览器上下文')
  const page = context.pages().find((candidate) => candidate.url().startsWith('http://127.0.0.1:4173'))
  if (!page) throw new Error('未找到 4173 的应用窗口')

  await page.goto('http://127.0.0.1:4173/dashboard')
  await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
  log('总览已加载')
  await page.screenshot({ path: path.join(OUT, '1-overview.png') })

  await page.getByRole('button', { name: /记一笔/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('textbox', { name: '金额' }).fill('28')
  await dialog.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }).click()
  await dialog.getByRole('textbox', { name: '备注' }).fill(NOTE)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  log('已完成一笔支出录入')

  const recent = page.getByRole('region', { name: '最近流水', exact: true })
  await recent.getByRole('row').filter({ hasText: NOTE }).waitFor()
  await recent.getByRole('row').filter({ hasText: '−¥28.00' }).first().waitFor()
  await page.screenshot({ path: path.join(OUT, '2-overview-after-entry.png') })

  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '流水' }).click()
  await page.waitForURL(/\/transactions$/)
  await page.getByRole('row').filter({ hasText: NOTE }).waitFor()
  await page.screenshot({ path: path.join(OUT, '3-transactions.png') })

  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '报表' }).click()
  await page.waitForURL(/\/reports$/)
  await page.getByRole('heading', { name: '报表', exact: true }).waitFor()
  const expenseMetric = page.locator('.rep-metric-cell').filter({ hasText: '本期支出' })
  await expenseMetric.waitFor()
  log(`报表本期支出：${(await expenseMetric.innerText()).replace(/\s+/g, ' ')}`)
  await page.screenshot({ path: path.join(OUT, '4-reports.png') })

  log(`闭环通过，截图目录：${OUT}`)
  await browser.close()
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.message}`)
  process.exitCode = 1
})
