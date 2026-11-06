import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickEntry } from '@/features/overview/QuickEntry'

const { mockAdd } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
}))

vi.mock('@/features/overview/ledgerStore', () => ({
  useLedger: () => ({
    ledger: {
      accounts: [{ id: 'cash', name: '现金', kind: 'cash', balance: 100_000 }],
      categories: [
        { id: 'food', name: '餐饮', type: 'expense' },
        { id: 'salary', name: '工资', type: 'income' },
        { id: 'move', name: '账户互转', type: 'transfer' },
        { id: 'refund', name: '退款', type: 'refund' },
        { id: 'other', name: '其他', type: 'expense' },
      ],
      budgets: [],
      transactions: [],
    },
    dataMode: 'seed',
    addTransaction: mockAdd,
  }),
}))

function renderEntry(device: 'desktop' | 'mobile') {
  return render(
    <MantineProvider>
      <QuickEntry opened device={device} onClose={() => {}} onSaved={() => {}} />
    </MantineProvider>,
  )
}

function deferred() {
  let resolve: (value: unknown) => void = () => {}
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('记账提交的并发闸门', () => {
  beforeEach(() => {
    mockAdd.mockReset()
  })

  it('连续点击保存 10 次只发出 1 次写请求，提交期间按钮禁用并显示进行中', async () => {
    const gate = deferred()
    mockAdd.mockReturnValueOnce(gate.promise)
    renderEntry('desktop')

    fireEvent.change(screen.getByLabelText('金额'), { target: { value: '12' } })
    const save = screen.getByRole('button', { name: '保存' })
    for (let index = 0; index < 10; index += 1) fireEvent.click(save)

    expect(mockAdd).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '保存并再记 ⏎' })).toBeDisabled()

    gate.resolve({ ok: true, id: 'tx-1' })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument())
  })

  it('按住 Enter 连发 10 次只落 1 笔', async () => {
    const gate = deferred()
    mockAdd.mockReturnValueOnce(gate.promise)
    const { container } = renderEntry('desktop')

    const amount = screen.getByLabelText('金额')
    fireEvent.change(amount, { target: { value: '12' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    const grid = container.querySelector('.mb-entry-grid')!
    for (let index = 0; index < 10; index += 1) fireEvent.keyDown(grid, { key: 'Enter' })

    expect(mockAdd).toHaveBeenCalledTimes(1)
    gate.resolve({ ok: true, id: 'tx-2' })
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1))
  })

  it('保存失败后恢复可点并保留输入', async () => {
    mockAdd.mockResolvedValueOnce({ ok: false, error: '网络错误' })
    renderEntry('desktop')

    const amount = screen.getByLabelText('金额') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('网络错误'))
    expect(amount.value).toBe('12.00')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })
})
