/**
 * HfSheet 桌面抽屉 portal 守护。
 *
 * 画布 .mb-hf-canvas 带 transform，会成为 position:fixed 的包含块；桌面抽屉必须
 * portal 到无 transform 的 .mb-hf-root，才能真视口固定——长页面滚动才不会跟着
 * 画布错位、底部也不会被 overflow 裁切。移动端仍留在手机框内，由手机框约束 fixed。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { HfSheet } from '@/features/shared/HfSheet'

function mountRoot(): HTMLElement {
  const root = document.createElement('div')
  root.className = 'mb-hf-root'
  document.body.appendChild(root)
  return root
}

afterEach(() => {
  document.querySelectorAll('.mb-hf-root').forEach((node) => node.remove())
})

describe('HfSheet 按设备选择 portal 目标', () => {
  it('桌面抽屉脱离渲染容器，挂到无 transform 的 .mb-hf-root', () => {
    const root = mountRoot()
    const { container } = render(
      <MantineProvider>
        <HfSheet variant="report" device="desktop" opened onClose={() => {}} title="下钻">
          <div className="portal-probe">抽屉内容</div>
        </HfSheet>
      </MantineProvider>,
    )

    expect(root.querySelector('.mb-rp-sheet .portal-probe')).not.toBeNull()
    expect(container.querySelector('.mb-rp-sheet')).toBeNull()
  })

  it('移动端抽屉留在渲染容器内，不 portal 到根容器', () => {
    const root = mountRoot()
    const { container } = render(
      <MantineProvider>
        <HfSheet variant="report" device="mobile" opened onClose={() => {}} title="下钻">
          <div className="portal-probe">抽屉内容</div>
        </HfSheet>
      </MantineProvider>,
    )

    expect(container.querySelector('.mb-rp-sheet .portal-probe')).not.toBeNull()
    expect(root.querySelector('.mb-rp-sheet')).toBeNull()
  })
})
