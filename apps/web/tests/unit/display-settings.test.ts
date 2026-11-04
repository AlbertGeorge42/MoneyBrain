/** 流水「显示」设置的持久化：默认全列 + 标准密度，坏数据回退默认。 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_LIST_DISPLAY,
  readListDisplay,
  writeListDisplay,
} from '../../src/features/transactions/display-settings'

describe('list display settings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('无存储时用默认值', () => {
    expect(readListDisplay()).toEqual(DEFAULT_LIST_DISPLAY)
  })

  it('写入后能读回', () => {
    writeListDisplay({ account: false, type: true, note: false, density: 'compact' })
    expect(readListDisplay()).toEqual({ account: false, type: true, note: false, density: 'compact' })
  })

  it('坏数据回退默认值', () => {
    window.localStorage.setItem('moneybrain.hf.list-display', '{not json')
    expect(readListDisplay()).toEqual(DEFAULT_LIST_DISPLAY)
  })

  it('未知密度回退标准', () => {
    window.localStorage.setItem('moneybrain.hf.list-display', JSON.stringify({ density: 'huge' }))
    expect(readListDisplay().density).toBe('standard')
  })
})
