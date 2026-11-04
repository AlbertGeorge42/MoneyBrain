/**
 * 记账浮层 W1 收尾回归：草稿丢弃/撤销、连记计数、保存路径不误报「草稿已丢弃」。
 */
import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeRoot } from '../../../src/styles/theme/ThemeRoot'
import { EntryOverlay } from '../../../src/features/transactions/EntryOverlay'

function setup(overrides: Partial<ComponentProps<typeof EntryOverlay>> = {}) {
  const props: ComponentProps<typeof EntryOverlay> = {
    open: true,
    device: 'pc',
    onClose: vi.fn(),
    onSaved: vi.fn().mockResolvedValue(undefined),
    onReopen: vi.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeRoot scheme="light">
      <EntryOverlay {...props} />
    </ThemeRoot>,
  )
  const rerender = (next: Partial<ComponentProps<typeof EntryOverlay>>) => {
    view.rerender(
      <ThemeRoot scheme="light">
        <EntryOverlay {...props} {...next} />
      </ThemeRoot>,
    )
  }
  return { props, rerender }
}

function closeByEscape() {
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
}

function amountBox() {
  return screen.getByRole('textbox', { name: '金额' }) as HTMLInputElement
}

describe('EntryOverlay 草稿与连记', () => {
  it('空表单关闭不发「草稿已丢弃」', () => {
    const { props } = setup()
    closeByEscape()
    expect(props.onClose).toHaveBeenCalled()
    expect(screen.queryByText('草稿已丢弃')).toBeNull()
  })

  it('有金额关闭后发草稿 toast，撤销重开并恢复草稿', () => {
    const { props, rerender } = setup()
    fireEvent.change(amountBox(), { target: { value: '66' } })
    closeByEscape()

    expect(screen.getByText('草稿已丢弃')).toBeTruthy()
    rerender({ open: false })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(props.onReopen).toHaveBeenCalled()

    rerender({ open: true })
    expect(amountBox().value).toBe('66')
  })

  it('保存并再记后标题显示连记计数', async () => {
    const { props } = setup()
    fireEvent.change(amountBox(), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: /保存并再记/ }))

    await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalled())
    await vi.waitFor(() => expect(document.body.textContent).toContain('已连记 1 笔'))
  })

  it('保存成功后关闭不算丢弃草稿', async () => {
    const { props } = setup()
    fireEvent.change(amountBox(), { target: { value: '28' } })
    // 「更多」展开着保存：若只看表单内容会被误判成草稿，这里锁住保存路径不弹 toast。
    fireEvent.click(screen.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }))
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }))

    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(screen.queryByText('草稿已丢弃')).toBeNull()
  })
})
