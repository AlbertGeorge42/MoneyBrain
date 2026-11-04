declare module '*.css' {
  const content: { [className: string]: string }
  export default content
}

/** 构建期注入的应用版本（来源：根 package.json）。 */
declare const __APP_VERSION__: string
