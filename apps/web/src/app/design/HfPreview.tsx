import { useState } from 'react'
import { useHotkeys } from '@mantine/hooks'
import { ThemeRoot } from '../../styles/theme/ThemeRoot'
import type { ColorScheme } from '../../styles/theme/tokens'
import type { DataState, DeviceMode } from '../../features/transactions/types'
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
  const [page, setPage] = useState<NavPage>('transactions')
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
    setPage('transactions')
    setBatchMode(false)
    setEntryOpen(true)
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

  return (
    <ThemeRoot scheme={scheme} notificationPosition={device === 'mobile' ? 'top-center' : 'bottom-right'}>
      <div className="hf-preview-root">
        <PreviewBar
          device={device}
          scheme={scheme}
          dataState={dataState}
          onDeviceChange={setDevice}
          onSchemeChange={changeScheme}
          onDataStateChange={setDataState}
        />
        {device === 'pc' ? (
          <div className="hf-stage hf-stage--pc">
            <HfShell
              device={device}
              page={page}
              dataState={dataState}
              batchMode={batchMode}
              entryOpen={entryOpen}
              onPageChange={changePage}
              onRecord={openEntry}
              onEntryOpen={openEntry}
              onEntryClose={() => setEntryOpen(false)}
              onBatchModeChange={setBatchMode}
              onRetry={() => setDataState('ready')}
            />
          </div>
        ) : (
          <div className="hf-stage hf-stage--mobile">
            <div className="hf-device-frame">
              <HfShell
                device={device}
                page={page}
                dataState={dataState}
                batchMode={batchMode}
                entryOpen={entryOpen}
                onPageChange={changePage}
                onRecord={openEntry}
                onEntryOpen={openEntry}
                onEntryClose={() => setEntryOpen(false)}
                onBatchModeChange={setBatchMode}
                onRetry={() => setDataState('ready')}
              />
            </div>
          </div>
        )}
      </div>
    </ThemeRoot>
  )
}
