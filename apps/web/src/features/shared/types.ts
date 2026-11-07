export type DataState = 'normal' | 'loading' | 'empty' | 'error'
export type DeviceMode = 'desktop' | 'mobile'
export type SchemeMode = 'light' | 'dark'
/** 外观设置的三个选项：浅色 / 深色 / 跟随系统（Mantine 里对应 light / dark / auto）。 */
export type ThemeMode = SchemeMode | 'system'
