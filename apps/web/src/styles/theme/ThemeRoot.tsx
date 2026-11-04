import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import './theme.css'
import 'dayjs/locale/zh-cn'

import { useLayoutEffect, type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import { buildMantineTheme, buildThemeCss, type ColorScheme } from './tokens'

const THEME_CSS = buildThemeCss()

type ThemeRootProps = {
  scheme: ColorScheme
  children: ReactNode
  notificationPosition?: 'top-center' | 'bottom-right'
}

/**
 * HF 主题根：MantineProvider → DatesProvider → Notifications。
 * 颜色变量挂在 body 上（带 data-hf-scheme），使 Drawer / Modal / toast 等 portal 也能取到 token。
 */
export function ThemeRoot({ scheme, children, notificationPosition = 'top-center' }: ThemeRootProps) {
  useLayoutEffect(() => {
    document.body.setAttribute('data-hf-scheme', scheme)
    return () => {
      document.body.removeAttribute('data-hf-scheme')
    }
  }, [scheme])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      <MantineProvider forceColorScheme={scheme} theme={buildMantineTheme(scheme)}>
        <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
          <Notifications position={notificationPosition} limit={3} />
          <div className="mb-theme" data-mb-scheme={scheme}>
            {children}
          </div>
        </DatesProvider>
      </MantineProvider>
    </>
  )
}
