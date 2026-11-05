/**
 * /design 浮层的 body 级宿主。
 *
 * 预览画布与手机框都带 transform，会成为 `position: fixed` 的包含块；浮层必须挂到
 * body 才能真视口固定。但 `--mb-s-*` / `--mb-fs-*` 等设计 token 作用在 `.mb-hf-root`，
 * 直接挂 body 会丢 token（`bottom` 失效、toast 掉出视口）。宿主带 `.mb-hf-portal`
 * 作用域，token 由 variables.css 同步声明。
 */
export function getPortalHost(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('.mb-hf-portal')
  if (existing) return existing
  const host = document.createElement('div')
  host.className = 'mb-hf-portal'
  document.body.appendChild(host)
  return host
}
