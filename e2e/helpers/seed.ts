import { expect, type Page } from '@playwright/test'

/**
 * e2e 临时库起步数据：先建一个 asset 顶层账户分类（API 要求账户有默认分类），
 * 再建一个带期初余额的账户。只写本次运行的 %TEMP% 临时库。
 */
export async function seedAccount(page: Page) {
  const category = await page.request.post('/api/account-categories', {
    data: { name: 'E2E 现金', type: 'asset', sort: 0 },
  })
  expect(category.ok(), `${category.status()} ${await category.text()}`).toBeTruthy()

  const account = await page.request.post('/api/accounts', {
    data: { name: 'E2E 账户', type: 'asset', initialBalance: 10000 },
  })
  expect(account.ok(), `${account.status()} ${await account.text()}`).toBeTruthy()
}
