/**
 * E2E 测试数据辅助函数
 * 用于通过 API 准备测试数据
 */

const API_BASE = 'http://localhost:3001/api'

/**
 * 创建测试账户分类
 */
export async function createTestAccountCategory(data: {
  name: string
  type: string
  icon?: string
}): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/account-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) return ''
    const result = await response.json()
    return result.data?.id || ''
  } catch {
    return ''
  }
}

/**
 * 创建测试账户
 */
export async function createTestAccount(data: {
  name: string
  type: string
  balance?: number
  categoryId?: string
}): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) return ''
    const result = await response.json()
    return result.data?.id || ''
  } catch {
    return ''
  }
}

/**
 * 创建测试交易分类
 */
export async function createTestTransactionCategory(data: {
  name: string
  type: string
  icon?: string
}): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/transaction-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) return ''
    const result = await response.json()
    return result.data?.id || ''
  } catch {
    return ''
  }
}

/**
 * 创建测试交易
 */
export async function createTestTransaction(data: {
  type: string
  amount: number
  accountId: string
  categoryId?: string
  toAccountId?: string
  date?: string
  note?: string
}): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) return ''
    const result = await response.json()
    return result.data?.id || ''
  } catch {
    return ''
  }
}

/**
 * 清理所有测试数据
 */
export async function clearAllTestData(): Promise<void> {
  try {
    await fetch(`${API_BASE}/data/all`, {
      method: 'DELETE',
    })
  } catch {
    // 忽略清理错误
  }
}
