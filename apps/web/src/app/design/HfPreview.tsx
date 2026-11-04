import { useState } from 'react'
import { useHotkeys } from '@mantine/hooks'
import { ThemeRoot } from '../../styles/theme/ThemeRoot'
import type { ColorScheme } from '../../styles/theme/tokens'
import { TRANSACTIONS } from '../../features/transactions/mock'
import type { DataState, DeviceMode, Transaction } from '../../features/transactions/types'
import { HfShell } from './HfShell'
import { PreviewBar } from './PreviewBar'
import type { NavPage } from './navigation'
import './hf.css'

const SCHEME_STORAGE_KEY = 'mantine-color-scheme-value'

function initialScheme(): ColorScheme {
  return window.localStorage.getItem(SCHEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export default function HfPreview() {
  const [device, setDevice] = useState<DeviceMode>('pc')
  const [scheme, setScheme] = useState<ColorScheme>(initialScheme)
  const [dataState, setDataState] = useState<DataState>('ready')
  const [page, setPage] = useState<NavPage>('overview')
  const [items, setItems] = useState<Transaction[]>(TRANSACTIONS)
  const [freshLedger, setFreshLedger] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)

  const changeScheme = (next: ColorScheme) => {
    setScheme(next)
    window.localStorage.setItem(SCHEME_STORAGE_KEY, next)
  }

  const changePage = (next: NavPage) => {
    if (entryOpen) return
    setPage(next)
    if (next !== 'transactions') setBatchMode(false)
  }

  const openEntry = () => {
    if (entryOpen) return
    setBatchMode(false)
    setEntryOpen(true)
  }

  const changeDataState = (next: DataState) => {
    if (next !== 'empty' && freshLedger) {
      setItems(TRANSACTIONS)
      setFreshLedger(false)
    }
    setDataState(next)
  }

  /** 冷启动账本的第一笔：清掉 mock 历史，只保留这一笔并切到正常态。 */
  const recordEntry = (tx: Transaction) => {
    if (dataState === 'empty') {
      setItems([tx])
      setFreshLedger(true)
      setDataState('ready')
      return
    }
    setItems((current) => [tx, ...current])
  }

  useHotkeys([
    ['n', openEntry],
    ['1', () => changePage('overview')],
    ['2', () => changePage('transactions')],
    ['3', () => changePage('reports')],
    ['4', () => changePage('budgets')],
    ['5', () => changePage('settings')],
    ['Escape', () => { if (!entryOpen) setBatchMode(false) }],
  ])

  const shellProps = {
    device,
    scheme,
    page,
    dataState,
    batchMode,
    items,
    freshLedger,
    setItems,
    entryOpen,
    onPageChange: changePage,
    onRecord: openEntry,
    onEntryOpen: openEntry,
    onEntryClose: () => setEntryOpen(false),
    onEntrySaved: recordEntry,
    onBatchModeChange: setBatchMode,
    onRetry: () => setDataState('ready'),
  }

  return (
    <ThemeRoot scheme={scheme} notificationPosition={device === 'mobile' ? 'top-center' : 'bottom-right'}>
      <div className="hf-preview-root">
        <PreviewBar
          device={device}
          scheme={scheme}
          dataState={dataState}
          onDeviceChange={setDevice}
          onSchemeChange={changeScheme}
          onDataStateChange={changeDataState}
        />
        {device === 'pc' ? (
          <div className="hf-stage hf-stage--pc">
            <HfShell {...shellProps} />
          </div>
        ) : (
          <div className="hf-stage hf-stage--mobile">
            <div className="hf-device-frame">
              <HfShell {...shellProps} />
            </div>
          </div>
        )}
      </div>
    </ThemeRoot>
  )
}
