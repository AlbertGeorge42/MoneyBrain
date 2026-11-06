/**
 * 同名账户可辨识
 *
 * 真实库里有 16 个名为「钱包」的账户，只显示名称无法区分。同名时展示名追加 id 尾号，
 * 名称唯一时不加噪声。
 */
import { describe, expect, it } from 'vitest'
import { accountDisplayName } from '@/features/shared/accountIdentity'

describe('accountDisplayName', () => {
  it('同名账户追加各自 id 尾号，保证可区分', () => {
    const accounts = [
      { id: 'b51b52f4-718b-44c5-a4b9-67fa46183b50', name: '钱包' },
      { id: '5c0384fe-dd11-4264-b5ef-1f99542180fd', name: '钱包' },
    ]

    const first = accountDisplayName(accounts[0], accounts)
    const second = accountDisplayName(accounts[1], accounts)

    expect(first).toBe('钱包 · #183b50')
    expect(second).toBe('钱包 · #2180fd')
    expect(first).not.toBe(second)
    expect(first).toContain('钱包')
    expect(second).toContain('钱包')
  })

  it('名称唯一时保持原名，不追加尾号', () => {
    const accounts = [
      { id: 'a1', name: '微信' },
      { id: 'a2', name: '支付宝' },
    ]

    expect(accountDisplayName(accounts[0], accounts)).toBe('微信')
    expect(accountDisplayName(accounts[1], accounts)).toBe('支付宝')
  })
})
